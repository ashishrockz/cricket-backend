const Match = require('../models/Match');
const Room = require('../models/Room');
const ScoreEvent = require('../models/ScoreEvent');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, buildPaginationResponse } = require('../utils/pagination');
const { MATCH_STATUS, ROOM_STATUS, SOCKET_EVENTS } = require('../config/constants');
const { getIO } = require('../socket/socketManager');
const { syncMatchStatsToProfiles } = require('../services/statsService');

/**
 * @desc    Get match details
 * @route   GET /api/v1/matches/:id
 * @access  Private
 */
const getMatchDetails = asyncHandler(async (req, res, next) => {
  const match = await Match.findById(req.params.id)
    .populate('room', 'roomCode name members status')
    .populate('createdBy', 'username fullName')
    .populate('teamA.players.user', 'username fullName avatar')
    .populate('teamB.players.user', 'username fullName avatar');

  if (!match) {
    return next(ApiError.notFound('Match not found'));
  }

  ApiResponse.success(res, { match });
});

/**
 * @desc    Record toss
 * @route   POST /api/v1/matches/:id/toss
 * @access  Private
 */
const recordToss = asyncHandler(async (req, res, next) => {
  const { wonBy, decision } = req.body;

  const match = await Match.findById(req.params.id);
  if (!match) return next(ApiError.notFound('Match not found'));

  if (match.status !== MATCH_STATUS.NOT_STARTED) {
    return next(ApiError.badRequest('Toss can only be recorded before match starts'));
  }

  const room = await Room.findById(match.room);
  if (!room || !room.isMember(req.user._id)) {
    return next(ApiError.forbidden('Only room members can record the toss'));
  }

  // Validate teams have minimum players
  if (match.teamA.players.length < 2) {
    return next(ApiError.badRequest('Team A needs at least 2 players'));
  }
  if (match.teamB.players.length < 2) {
    return next(ApiError.badRequest('Team B needs at least 2 players'));
  }

  match.toss = { wonBy, decision };
  match.status = MATCH_STATUS.TOSS;

  // Determine batting order based on toss
  const battingFirst = (wonBy === 'team_a' && decision === 'bat') || (wonBy === 'team_b' && decision === 'bowl')
    ? 'team_a' : 'team_b';
  const bowlingFirst = battingFirst === 'team_a' ? 'team_b' : 'team_a';

  // Initialize first innings
  match.innings.push({
    inningsNumber: 1,
    battingTeam: battingFirst,
    bowlingTeam: bowlingFirst,
    totalRuns: 0,
    totalWickets: 0,
    totalOvers: 0,
    totalBalls: 0,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0, total: 0 },
    battingStats: [],
    bowlingStats: [],
    partnerships: [],
    fallOfWickets: [],
    isCompleted: false
  });

  match.currentInnings = 1;
  await match.save();

  try {
    const io = getIO();
    io.to(`room:${room._id}`).emit(SOCKET_EVENTS.SCORE_UPDATE, {
      type: 'toss',
      toss: match.toss,
      battingFirst,
      bowlingFirst
    });
  } catch (e) { /* Socket not critical */ }

  ApiResponse.success(res, { match }, 'Toss recorded. Ready to start match.');
});

/**
 * @desc    Start match (transition from toss to in_progress)
 * @route   POST /api/v1/matches/:id/start
 * @access  Private
 */
const startMatch = asyncHandler(async (req, res, next) => {
  const match = await Match.findById(req.params.id);
  if (!match) return next(ApiError.notFound('Match not found'));

  if (match.status !== MATCH_STATUS.TOSS) {
    return next(ApiError.badRequest('Toss must be completed before starting the match'));
  }

  const room = await Room.findById(match.room);
  if (!room || !room.isMember(req.user._id)) {
    return next(ApiError.forbidden('Only room members can start the match'));
  }

  match.status = MATCH_STATUS.IN_PROGRESS;
  match.startedAt = new Date();
  room.status = ROOM_STATUS.LIVE;

  await Promise.all([match.save(), room.save()]);

  try {
    const io = getIO();
    io.to(`room:${room._id}`).emit(SOCKET_EVENTS.SCORE_UPDATE, {
      type: 'match_started',
      matchId: match._id,
      innings: match.innings[0]
    });
  } catch (e) { /* Socket not critical */ }

  ApiResponse.success(res, { match }, 'Match started');
});

/**
 * @desc    End innings (start next or complete match)
 * @route   POST /api/v1/matches/:id/end-innings
 * @access  Private
 */
const endInnings = asyncHandler(async (req, res, next) => {
  const match = await Match.findById(req.params.id);
  if (!match) return next(ApiError.notFound('Match not found'));

  if (match.status !== MATCH_STATUS.IN_PROGRESS) {
    return next(ApiError.badRequest('Match is not in progress'));
  }

  const room = await Room.findById(match.room);
  if (!room || !room.isMember(req.user._id)) {
    return next(ApiError.forbidden('Only room members can end innings'));
  }

  const currentInnings = match.innings[match.currentInnings - 1];
  if (!currentInnings) {
    return next(ApiError.badRequest('No active innings'));
  }

  currentInnings.isCompleted = true;

  if (match.currentInnings === 1) {
    // Start second innings
    const battingSecond = currentInnings.bowlingTeam;
    const bowlingSecond = currentInnings.battingTeam;

    match.innings.push({
      inningsNumber: 2,
      battingTeam: battingSecond,
      bowlingTeam: bowlingSecond,
      totalRuns: 0,
      totalWickets: 0,
      totalOvers: 0,
      totalBalls: 0,
      extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0, total: 0 },
      battingStats: [],
      bowlingStats: [],
      partnerships: [],
      fallOfWickets: [],
      isCompleted: false,
      target: currentInnings.totalRuns + 1
    });

    match.currentInnings = 2;
    match.status = MATCH_STATUS.IN_PROGRESS;

    try {
      const io = getIO();
      io.to(`room:${room._id}`).emit(SOCKET_EVENTS.INNINGS_COMPLETE, {
        completedInnings: currentInnings,
        target: currentInnings.totalRuns + 1,
        nextInnings: 2
      });
    } catch (e) { /* Socket not critical */ }

    await match.save();
    return ApiResponse.success(res, { match }, 'First innings completed. Second innings ready.');
  }

  // Match complete after second innings
  await completeMatch(match, room);
  await match.save();

  ApiResponse.success(res, { match }, 'Match completed');
});

/**
 * Helper: Complete the match and calculate result
 */
async function completeMatch(match, room) {
  const innings1 = match.innings[0];
  const innings2 = match.innings[1];

  match.status = MATCH_STATUS.COMPLETED;
  match.completedAt = new Date();
  room.status = ROOM_STATUS.COMPLETED;

  if (innings2.totalRuns > innings1.totalRuns) {
    const battingTeam = innings2.battingTeam;
    const wicketsRemaining = (match.teamA.players.length > match.teamB.players.length
      ? match.teamB.players.length : match.teamA.players.length) - 1 - innings2.totalWickets;

    match.result = {
      winner: battingTeam,
      winMargin: Math.max(wicketsRemaining, 0),
      winType: 'wickets',
      summary: `${battingTeam === 'team_a' ? match.teamA.name : match.teamB.name} won by ${Math.max(wicketsRemaining, 0)} wickets`
    };
  } else if (innings1.totalRuns > innings2.totalRuns) {
    const battingTeam = innings1.battingTeam;
    const margin = innings1.totalRuns - innings2.totalRuns;

    match.result = {
      winner: battingTeam,
      winMargin: margin,
      winType: 'runs',
      summary: `${battingTeam === 'team_a' ? match.teamA.name : match.teamB.name} won by ${margin} runs`
    };
  } else {
    match.result = {
      winner: 'tie',
      winMargin: 0,
      winType: null,
      summary: 'Match Tied'
    };
  }

  await room.save();

  // Sync stats to registered player profiles (async, non-blocking)
  syncMatchStatsToProfiles(match._id).catch((err) =>
    require('../config/logger').warn(`Stats sync error: ${err.message}`)
  );

  try {
    const io = getIO();
    io.to(`room:${room._id}`).emit(SOCKET_EVENTS.MATCH_COMPLETE, {
      result: match.result,
      matchId: match._id
    });
  } catch (e) { /* Socket not critical */ }
}

/**
 * @desc    Get live scorecard
 * @route   GET /api/v1/matches/:id/live
 * @access  Public (with optional auth)
 */
const getLiveScore = asyncHandler(async (req, res, next) => {
  const match = await Match.findById(req.params.id)
    .populate('teamA.players.user', 'username fullName avatar')
    .populate('teamB.players.user', 'username fullName avatar');

  if (!match) return next(ApiError.notFound('Match not found'));

  const currentInnings = match.innings[match.currentInnings - 1];

  const liveData = {
    matchId: match._id,
    status: match.status,
    format: match.format,
    totalOvers: match.totalOvers,
    teamA: { name: match.teamA.name, players: match.teamA.players },
    teamB: { name: match.teamB.name, players: match.teamB.players },
    toss: match.toss,
    currentInnings: currentInnings ? {
      inningsNumber: currentInnings.inningsNumber,
      battingTeam: currentInnings.battingTeam,
      bowlingTeam: currentInnings.bowlingTeam,
      totalRuns: currentInnings.totalRuns,
      totalWickets: currentInnings.totalWickets,
      overs: `${currentInnings.totalOvers}.${currentInnings.totalBalls}`,
      runRate: currentInnings.runRate,
      extras: currentInnings.extras,
      target: currentInnings.target,
      battingStats: currentInnings.battingStats,
      bowlingStats: currentInnings.bowlingStats,
      partnerships: currentInnings.partnerships,
      fallOfWickets: currentInnings.fallOfWickets
    } : null,
    result: match.result,
    allInnings: match.innings.map(inn => ({
      inningsNumber: inn.inningsNumber,
      battingTeam: inn.battingTeam,
      totalRuns: inn.totalRuns,
      totalWickets: inn.totalWickets,
      overs: `${inn.totalOvers}.${inn.totalBalls}`,
      isCompleted: inn.isCompleted
    }))
  };

  // If authenticated user is a registered player, highlight personal stats
  if (req.user) {
    const userId = req.user._id.toString();
    const personalStats = { batting: null, bowling: null };

    match.innings.forEach(inn => {
      const batStat = inn.battingStats.find(b => b.player && b.player.toString() === userId);
      if (batStat) personalStats.batting = batStat;
      const bowlStat = inn.bowlingStats.find(b => b.player && b.player.toString() === userId);
      if (bowlStat) personalStats.bowling = bowlStat;
    });

    liveData.personalStats = personalStats;
  }

  ApiResponse.success(res, liveData);
});

/**
 * @desc    Get match ball-by-ball timeline
 * @route   GET /api/v1/matches/:id/timeline
 * @access  Private
 */
const getMatchTimeline = asyncHandler(async (req, res, next) => {
  const match = await Match.findById(req.params.id);
  if (!match) return next(ApiError.notFound('Match not found'));

  const { page, limit, skip } = paginate(req.query);
  const inningsNumber = parseInt(req.query.innings) || match.currentInnings;

  const filter = {
    match: match._id,
    inningsNumber,
    isUndone: false
  };

  const [events, totalDocs] = await Promise.all([
    ScoreEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit).lean(),
    ScoreEvent.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, events, buildPaginationResponse(page, limit, totalDocs));
});

module.exports = {
  getMatchDetails, recordToss, startMatch, endInnings,
  getLiveScore, getMatchTimeline
};
