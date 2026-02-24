const Match = require('../models/Match');
const Room = require('../models/Room');
const ScoreEvent = require('../models/ScoreEvent');
const User = require('../models/User');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { MATCH_STATUS, DELIVERY_OUTCOMES, SOCKET_EVENTS, ROOM_ROLES } = require('../config/constants');
const { getIO } = require('../socket/socketManager');
const logger = require('../config/logger');

/**
 * @desc    Record a ball/delivery
 * @route   POST /api/v1/scoring/ball
 * @access  Private (Scorer only)
 */
const recordBall = asyncHandler(async (req, res, next) => {
  const {
    matchId, outcome, runs, extraRuns, strikerId, nonStrikerId,
    bowlerId, isWicket, dismissalType, dismissedPlayerId, fielderId, commentary
  } = req.body;

  // Fetch match and room
  const match = await Match.findById(matchId);
  if (!match) return next(ApiError.notFound('Match not found'));

  if (match.status !== MATCH_STATUS.IN_PROGRESS) {
    return next(ApiError.badRequest('Match is not in progress'));
  }

  const room = await Room.findById(match.room);
  if (!room) return next(ApiError.notFound('Room not found'));

  // Verify scorer role
  const member = room.getMember(req.user._id);
  if (!member) return next(ApiError.forbidden('You are not a member of this room'));

  const isSoloMode = room.members.length === 1;
  if (!isSoloMode && member.role !== ROOM_ROLES.SCORER) {
    return next(ApiError.forbidden('Only the scorer can record deliveries'));
  }

  const innings = match.innings[match.currentInnings - 1];
  if (!innings || innings.isCompleted) {
    return next(ApiError.badRequest('No active innings'));
  }

  // Determine if legal delivery
  const isLegal = outcome !== DELIVERY_OUTCOMES.WIDE &&
                  outcome !== DELIVERY_OUTCOMES.NO_BALL &&
                  outcome !== DELIVERY_OUTCOMES.DEAD_BALL;

  // Find player names
  const battingTeamPlayers = innings.battingTeam === 'team_a' ? match.teamA.players : match.teamB.players;
  const bowlingTeamPlayers = innings.bowlingTeam === 'team_a' ? match.teamA.players : match.teamB.players;

  const striker = battingTeamPlayers.find(p => p._id.toString() === strikerId);
  const nonStriker = battingTeamPlayers.find(p => p._id.toString() === nonStrikerId);
  const bowler = bowlingTeamPlayers.find(p => p._id.toString() === bowlerId);

  if (!striker) return next(ApiError.badRequest('Striker not found in batting team'));
  if (!nonStriker) return next(ApiError.badRequest('Non-striker not found in batting team'));
  if (!bowler) return next(ApiError.badRequest('Bowler not found in bowling team'));

  // ============================================
  // UPDATE INNINGS SCORE
  // ============================================
  let totalRunsThisBall = runs;
  const actualExtraRuns = extraRuns || 0;

  if (outcome === DELIVERY_OUTCOMES.WIDE) {
    innings.extras.wides += 1 + actualExtraRuns;
    innings.extras.total += 1 + actualExtraRuns;
    totalRunsThisBall = 1 + actualExtraRuns;
  } else if (outcome === DELIVERY_OUTCOMES.NO_BALL) {
    innings.extras.noBalls += 1;
    innings.extras.total += 1 + actualExtraRuns;
    totalRunsThisBall = runs + 1 + actualExtraRuns;
  } else if (outcome === DELIVERY_OUTCOMES.BYE) {
    innings.extras.byes += runs;
    innings.extras.total += runs;
    totalRunsThisBall = runs;
  } else if (outcome === DELIVERY_OUTCOMES.LEG_BYE) {
    innings.extras.legByes += runs;
    innings.extras.total += runs;
    totalRunsThisBall = runs;
  }

  innings.totalRuns += totalRunsThisBall;

  // Update balls count (only legal deliveries)
  if (isLegal) {
    innings.totalBalls += 1;
    if (innings.totalBalls >= 6) {
      innings.totalOvers += 1;
      innings.totalBalls = 0;
    }
  }

  // ============================================
  // UPDATE BATTING STATS
  // ============================================
  let batStats = innings.battingStats.find(b => b.player.toString() === strikerId);
  if (!batStats) {
    innings.battingStats.push({
      player: striker._id,
      playerName: striker.name,
      runs: 0, ballsFaced: 0, fours: 0, sixes: 0,
      isOut: false, isNotOut: true, isOnStrike: true,
      position: innings.battingStats.length + 1
    });
    batStats = innings.battingStats[innings.battingStats.length - 1];
  }

  // Ensure non-striker exists in stats
  let nonStrikerStats = innings.battingStats.find(b => b.player.toString() === nonStrikerId);
  if (!nonStrikerStats) {
    innings.battingStats.push({
      player: nonStriker._id,
      playerName: nonStriker.name,
      runs: 0, ballsFaced: 0, fours: 0, sixes: 0,
      isOut: false, isNotOut: true, isOnStrike: false,
      position: innings.battingStats.length + 1
    });
  }

  // Only count balls faced for normal, wicket, no_ball deliveries
  if (outcome !== DELIVERY_OUTCOMES.WIDE && outcome !== DELIVERY_OUTCOMES.DEAD_BALL) {
    batStats.ballsFaced += 1;
  }

  // Runs scored by batsman (not extras)
  if (outcome === DELIVERY_OUTCOMES.NORMAL || outcome === DELIVERY_OUTCOMES.WICKET || outcome === DELIVERY_OUTCOMES.NO_BALL) {
    batStats.runs += runs;
    if (runs === 4) batStats.fours += 1;
    if (runs === 6) batStats.sixes += 1;
  }

  // ============================================
  // UPDATE BOWLING STATS
  // ============================================
  let bowlStats = innings.bowlingStats.find(b => b.player.toString() === bowlerId);
  if (!bowlStats) {
    innings.bowlingStats.push({
      player: bowler._id,
      playerName: bowler.name,
      overs: 0, balls: 0, maidens: 0, runsConceded: 0,
      wickets: 0, wides: 0, noBalls: 0, dotBalls: 0, fours: 0, sixes: 0
    });
    bowlStats = innings.bowlingStats[innings.bowlingStats.length - 1];
  }

  bowlStats.runsConceded += totalRunsThisBall;

  if (isLegal) {
    bowlStats.balls += 1;
    if (bowlStats.balls >= 6) {
      bowlStats.overs += 1;
      bowlStats.balls = 0;
    }
  }

  if (outcome === DELIVERY_OUTCOMES.WIDE) bowlStats.wides += 1;
  if (outcome === DELIVERY_OUTCOMES.NO_BALL) bowlStats.noBalls += 1;
  if (totalRunsThisBall === 0 && isLegal) bowlStats.dotBalls += 1;
  if (runs === 4 && outcome === DELIVERY_OUTCOMES.NORMAL) bowlStats.fours += 1;
  if (runs === 6 && outcome === DELIVERY_OUTCOMES.NORMAL) bowlStats.sixes += 1;

  // ============================================
  // HANDLE WICKET
  // ============================================
  if (isWicket) {
    innings.totalWickets += 1;

    const dismissedPlayer = battingTeamPlayers.find(p => p._id.toString() === dismissedPlayerId);
    const dismissedBatStats = innings.battingStats.find(b => b.player.toString() === dismissedPlayerId);

    if (dismissedBatStats) {
      dismissedBatStats.isOut = true;
      dismissedBatStats.isNotOut = false;
      dismissedBatStats.dismissalType = dismissalType;
      dismissedBatStats.dismissedBy = bowler.name;

      if (fielderId) {
        const fielder = bowlingTeamPlayers.find(p => p._id.toString() === fielderId);
        if (fielder) dismissedBatStats.fielder = fielder.name;
      }
    }

    if (isLegal) bowlStats.wickets += 1;

    // Fall of wicket
    innings.fallOfWickets.push({
      wicketNumber: innings.totalWickets,
      playerName: dismissedPlayer ? dismissedPlayer.name : 'Unknown',
      score: innings.totalRuns,
      overs: `${innings.totalOvers}.${innings.totalBalls}`,
      dismissalType
    });
  }

  // ============================================
  // CREATE SCORE EVENT
  // ============================================
  const scoreEvent = await ScoreEvent.create({
    match: match._id,
    room: room._id,
    inningsNumber: innings.inningsNumber,
    overNumber: innings.totalOvers,
    ballNumber: innings.totalBalls || 6,
    delivery: {
      outcome,
      runs,
      extraRuns: actualExtraRuns,
      isLegalDelivery: isLegal,
      isBoundaryFour: runs === 4 && (outcome === DELIVERY_OUTCOMES.NORMAL),
      isBoundarySix: runs === 6 && (outcome === DELIVERY_OUTCOMES.NORMAL)
    },
    striker: { player: striker._id, playerName: striker.name },
    nonStriker: { player: nonStriker._id, playerName: nonStriker.name },
    bowler: { player: bowler._id, playerName: bowler.name },
    wicket: {
      isWicket: isWicket || false,
      dismissalType: isWicket ? dismissalType : null,
      dismissedPlayer: isWicket ? {
        player: dismissedPlayerId,
        playerName: battingTeamPlayers.find(p => p._id.toString() === dismissedPlayerId)?.name
      } : { player: null, playerName: null },
      fielder: fielderId ? {
        player: fielderId,
        playerName: bowlingTeamPlayers.find(p => p._id.toString() === fielderId)?.name
      } : { player: null, playerName: null }
    },
    scoreAfterBall: {
      totalRuns: innings.totalRuns,
      totalWickets: innings.totalWickets,
      totalOvers: innings.totalOvers,
      totalBalls: innings.totalBalls
    },
    scoredBy: req.user._id,
    commentary
  });

  // ============================================
  // CHECK INNINGS COMPLETION
  // ============================================
  const maxWickets = battingTeamPlayers.length - 1;
  const maxOvers = match.totalOvers;
  let inningsCompleted = false;

  if (innings.totalWickets >= maxWickets) {
    innings.isCompleted = true;
    inningsCompleted = true;
  }
  if (innings.totalOvers >= maxOvers && innings.totalBalls === 0) {
    innings.isCompleted = true;
    inningsCompleted = true;
  }
  // Second innings: target reached
  if (match.currentInnings === 2 && innings.target && innings.totalRuns >= innings.target) {
    innings.isCompleted = true;
    inningsCompleted = true;
  }

  await match.save();

  // ============================================
  // BROADCAST VIA SOCKET
  // ============================================
  try {
    const io = getIO();
    const scoreData = {
      type: 'ball_update',
      event: scoreEvent.toObject(),
      innings: {
        totalRuns: innings.totalRuns,
        totalWickets: innings.totalWickets,
        overs: `${innings.totalOvers}.${innings.totalBalls}`,
        runRate: innings.runRate,
        extras: innings.extras,
        target: innings.target
      },
      inningsCompleted
    };

    // Broadcast to all room members and spectators
    io.to(`room:${room._id}`).emit(SOCKET_EVENTS.BALL_UPDATE, scoreData);
    io.to(`match:${match._id}`).emit(SOCKET_EVENTS.BALL_UPDATE, scoreData);

    if (isWicket) {
      io.to(`room:${room._id}`).emit(SOCKET_EVENTS.WICKET_FALLEN, {
        wicketNumber: innings.totalWickets,
        dismissedPlayer: scoreEvent.wicket.dismissedPlayer,
        dismissalType,
        score: innings.totalRuns
      });
    }

    if (innings.totalBalls === 0 && innings.totalOvers > 0) {
      io.to(`room:${room._id}`).emit(SOCKET_EVENTS.OVER_COMPLETE, {
        overNumber: innings.totalOvers,
        runsConceded: bowlStats.runsConceded,
        wicketsInOver: 0 // simplified
      });
    }
  } catch (e) {
    logger.warn(`Socket broadcast failed: ${e.message}`);
  }

  ApiResponse.success(res, {
    event: scoreEvent,
    innings: {
      totalRuns: innings.totalRuns,
      totalWickets: innings.totalWickets,
      overs: `${innings.totalOvers}.${innings.totalBalls}`,
      extras: innings.extras,
      target: innings.target,
      isCompleted: innings.isCompleted
    }
  }, 'Ball recorded successfully');
});

/**
 * @desc    Undo last ball
 * @route   POST /api/v1/scoring/undo
 * @access  Private (Scorer only)
 */
const undoBall = asyncHandler(async (req, res, next) => {
  const { matchId } = req.body;

  const match = await Match.findById(matchId);
  if (!match) return next(ApiError.notFound('Match not found'));

  if (match.status !== MATCH_STATUS.IN_PROGRESS) {
    return next(ApiError.badRequest('Match is not in progress'));
  }

  const room = await Room.findById(match.room);
  if (!room) return next(ApiError.notFound('Room not found'));

  const member = room.getMember(req.user._id);
  const isSoloMode = room.members.length === 1;
  if (!member || (!isSoloMode && member.role !== ROOM_ROLES.SCORER)) {
    return next(ApiError.forbidden('Only the scorer can undo deliveries'));
  }

  const innings = match.innings[match.currentInnings - 1];
  if (!innings) return next(ApiError.badRequest('No active innings'));

  // Find last ball event
  const lastEvent = await ScoreEvent.getLastBall(matchId, innings.inningsNumber);
  if (!lastEvent) {
    return next(ApiError.badRequest('No balls to undo'));
  }

  // Mark event as undone
  lastEvent.isUndone = true;
  lastEvent.undoneBy = req.user._id;
  lastEvent.undoneAt = new Date();
  await lastEvent.save();

  // Reverse the score changes
  const { delivery, wicket } = lastEvent;

  // Reverse runs
  let totalRunsToReverse = delivery.runs;
  if (delivery.outcome === DELIVERY_OUTCOMES.WIDE) {
    innings.extras.wides -= 1 + (delivery.extraRuns || 0);
    innings.extras.total -= 1 + (delivery.extraRuns || 0);
    totalRunsToReverse = 1 + (delivery.extraRuns || 0);
  } else if (delivery.outcome === DELIVERY_OUTCOMES.NO_BALL) {
    innings.extras.noBalls -= 1;
    innings.extras.total -= 1 + (delivery.extraRuns || 0);
    totalRunsToReverse = delivery.runs + 1 + (delivery.extraRuns || 0);
  } else if (delivery.outcome === DELIVERY_OUTCOMES.BYE) {
    innings.extras.byes -= delivery.runs;
    innings.extras.total -= delivery.runs;
  } else if (delivery.outcome === DELIVERY_OUTCOMES.LEG_BYE) {
    innings.extras.legByes -= delivery.runs;
    innings.extras.total -= delivery.runs;
  }

  innings.totalRuns -= totalRunsToReverse;

  // Reverse ball count
  if (delivery.isLegalDelivery) {
    if (innings.totalBalls === 0) {
      innings.totalOvers -= 1;
      innings.totalBalls = 5;
    } else {
      innings.totalBalls -= 1;
    }
  }

  // Reverse batting stats
  const batStats = innings.battingStats.find(b => b.player.toString() === lastEvent.striker.player.toString());
  if (batStats) {
    if (delivery.outcome !== DELIVERY_OUTCOMES.WIDE && delivery.outcome !== DELIVERY_OUTCOMES.DEAD_BALL) {
      batStats.ballsFaced -= 1;
    }
    if (delivery.outcome === DELIVERY_OUTCOMES.NORMAL || delivery.outcome === DELIVERY_OUTCOMES.NO_BALL) {
      batStats.runs -= delivery.runs;
      if (delivery.isBoundaryFour) batStats.fours -= 1;
      if (delivery.isBoundarySix) batStats.sixes -= 1;
    }
  }

  // Reverse bowling stats
  const bowlStats = innings.bowlingStats.find(b => b.player.toString() === lastEvent.bowler.player.toString());
  if (bowlStats) {
    bowlStats.runsConceded -= totalRunsToReverse;
    if (delivery.isLegalDelivery) {
      if (bowlStats.balls === 0) {
        bowlStats.overs -= 1;
        bowlStats.balls = 5;
      } else {
        bowlStats.balls -= 1;
      }
    }
  }

  // Reverse wicket
  if (wicket.isWicket) {
    innings.totalWickets -= 1;
    if (bowlStats && delivery.isLegalDelivery) bowlStats.wickets -= 1;

    const dismissedBatStats = innings.battingStats.find(
      b => b.player.toString() === wicket.dismissedPlayer.player.toString()
    );
    if (dismissedBatStats) {
      dismissedBatStats.isOut = false;
      dismissedBatStats.isNotOut = true;
      dismissedBatStats.dismissalType = null;
      dismissedBatStats.dismissedBy = null;
      dismissedBatStats.fielder = null;
    }

    innings.fallOfWickets.pop();
    innings.isCompleted = false;
  }

  await match.save();

  try {
    const io = getIO();
    io.to(`room:${room._id}`).emit(SOCKET_EVENTS.UNDO_BALL, {
      undoneEvent: lastEvent._id,
      innings: {
        totalRuns: innings.totalRuns,
        totalWickets: innings.totalWickets,
        overs: `${innings.totalOvers}.${innings.totalBalls}`,
        extras: innings.extras
      }
    });
  } catch (e) { /* Socket not critical */ }

  ApiResponse.success(res, {
    undoneEvent: lastEvent._id,
    innings: {
      totalRuns: innings.totalRuns,
      totalWickets: innings.totalWickets,
      overs: `${innings.totalOvers}.${innings.totalBalls}`
    }
  }, 'Last ball undone successfully');
});

module.exports = { recordBall, undoBall };
