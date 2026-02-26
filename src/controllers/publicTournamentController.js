const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, buildPaginationResponse } = require('../utils/pagination');

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Strip heavy fields that users don't need in list views */
const TOURNAMENT_LIST_SELECT = '-fixtures -rules -admins -sponsors -knockoutConfig -season';

/** Live-score snapshot from a Match document */
function liveScoreSnapshot(match) {
  if (!match) return null;
  const summary = {
    matchId: match._id,
    status: match.status,
    teamA: match.teamA?.name,
    teamB: match.teamB?.name,
    result: match.result || null,
    innings: []
  };
  if (match.innings?.length) {
    summary.innings = match.innings.map(inn => ({
      inningsNumber: inn.inningsNumber,
      battingTeam: inn.battingTeam,
      totalRuns: inn.totalRuns,
      totalWickets: inn.totalWickets,
      overs: `${inn.totalOvers}.${inn.totalBalls}`,
      extras: inn.extras?.total || 0,
      target: inn.target || null,
      isCompleted: inn.isCompleted
    }));
  }
  return summary;
}

// ─── controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/tournaments
 * List public tournaments — visible on the home page.
 * Default: shows registration_open + in_progress. Pass ?status=completed for past.
 */
const listPublicTournaments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { status, format, search } = req.query;

  const filter = { isPublic: true };

  if (status) {
    // Support comma-separated: ?status=registration_open,in_progress
    filter.status = { $in: status.split(',').map(s => s.trim()) };
  } else {
    // Default: active tournaments only
    filter.status = { $in: ['registration_open', 'in_progress'] };
  }

  if (format) filter.format = format;
  if (search) filter.name = { $regex: search, $options: 'i' };

  const [tournaments, totalDocs] = await Promise.all([
    Tournament.find(filter)
      .populate('organizer', 'username fullName avatar')
      .select(TOURNAMENT_LIST_SELECT)
      .sort({ status: 1, startDate: 1 })   // in_progress first, then upcoming
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    Tournament.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, tournaments, buildPaginationResponse(page, limit, totalDocs));
});

/**
 * GET /api/v1/tournaments/live
 * Returns in_progress tournaments with their currently live fixtures + match scores.
 * Powers the "Live Now" widget on the home page.
 */
const getLiveTournaments = asyncHandler(async (req, res) => {
  const tournaments = await Tournament.find({ isPublic: true, status: 'in_progress' })
    .populate('organizer', 'username fullName')
    .select('name code format matchFormat totalOvers status currentRound startDate endDate banner organizer stats fixtures')
    .lean({ virtuals: true });

  // For each tournament, pick only in_progress/scheduled fixtures of the current round
  const result = await Promise.all(tournaments.map(async t => {
    const liveFixtures = (t.fixtures || [])
      .filter(f => f.status === 'in_progress' || (f.status === 'scheduled' && f.round === t.currentRound))
      .slice(0, 10); // cap at 10 fixtures per tournament

    // Populate live match scores for in_progress fixtures
    const fixturesWithScores = await Promise.all(liveFixtures.map(async fixture => {
      let score = null;
      if (fixture.match) {
        const match = await Match.findById(fixture.match)
          .select('status teamA teamB innings result')
          .lean({ virtuals: false });
        score = liveScoreSnapshot(match);
      }
      return { ...fixture, liveScore: score };
    }));

    // Remove raw fixtures array from response, replace with processed ones
    const { fixtures: _, ...tournamentData } = t;
    return { ...tournamentData, liveFixtures: fixturesWithScores };
  }));

  ApiResponse.success(res, { tournaments: result, total: result.length });
});

/**
 * GET /api/v1/tournaments/:id
 * Public tournament details page — info, teams, sponsors, awards.
 * Does NOT include fixtures (use /schedule) or points table (use /points-table).
 */
const getPublicTournament = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findOne({ _id: req.params.id, isPublic: true })
    .populate('organizer', 'username fullName avatar')
    .select('-fixtures -rules -admins -knockoutConfig')
    .lean({ virtuals: true });

  if (!t) return next(ApiError.notFound('Tournament not found'));

  ApiResponse.success(res, { tournament: t });
});

/**
 * GET /api/v1/tournaments/:id/schedule
 * Full fixture schedule grouped by round.
 * Each fixture includes live score if the match is in_progress.
 */
const getTournamentSchedule = asyncHandler(async (req, res, next) => {
  const { round, status } = req.query;

  const t = await Tournament.findOne({ _id: req.params.id, isPublic: true })
    .select('name code format matchFormat status currentRound totalRounds fixtures')
    .lean();

  if (!t) return next(ApiError.notFound('Tournament not found'));

  let fixtures = t.fixtures || [];

  // Filter
  if (round) fixtures = fixtures.filter(f => f.round === parseInt(round));
  if (status) fixtures = fixtures.filter(f => f.status === status);

  // Sort: scheduled first, then in_progress, then completed
  const ORDER = { in_progress: 0, scheduled: 1, completed: 2, cancelled: 3, bye: 4 };
  fixtures.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return (ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5);
  });

  // Populate live scores for in_progress fixtures
  const enrichedFixtures = await Promise.all(fixtures.map(async fixture => {
    let liveScore = null;
    if (fixture.match && fixture.status === 'in_progress') {
      const match = await Match.findById(fixture.match)
        .select('status teamA teamB innings result')
        .lean();
      liveScore = liveScoreSnapshot(match);
    }
    return { ...fixture, liveScore };
  }));

  // Group by round
  const byRound = {};
  for (const fixture of enrichedFixtures) {
    const key = fixture.round;
    if (!byRound[key]) {
      byRound[key] = { round: key, label: fixture.roundLabel || `Round ${key}`, fixtures: [] };
    }
    byRound[key].fixtures.push(fixture);
  }

  ApiResponse.success(res, {
    tournamentId: t._id,
    tournamentName: t.name,
    format: t.format,
    status: t.status,
    currentRound: t.currentRound,
    totalRounds: t.totalRounds,
    schedule: Object.values(byRound).sort((a, b) => a.round - b.round)
  });
});

/**
 * GET /api/v1/tournaments/:id/fixtures/:fixtureId
 * Single fixture with full match scorecard.
 */
const getFixtureDetails = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findOne({ _id: req.params.id, isPublic: true })
    .select('name code format matchFormat fixtures')
    .lean();

  if (!t) return next(ApiError.notFound('Tournament not found'));

  const fixture = (t.fixtures || []).find(f => f._id.toString() === req.params.fixtureId);
  if (!fixture) return next(ApiError.notFound('Fixture not found'));

  let matchData = null;
  if (fixture.match) {
    matchData = await Match.findById(fixture.match)
      .select('status format totalOvers teamA teamB toss innings result createdAt')
      .populate('teamA.players.user', 'username fullName avatar')
      .populate('teamB.players.user', 'username fullName avatar')
      .lean({ virtuals: true });
  }

  ApiResponse.success(res, {
    tournament: { _id: t._id, name: t.name, code: t.code, format: t.format },
    fixture,
    match: matchData
  });
});

/**
 * GET /api/v1/tournaments/:id/points-table
 * Standings table sorted by points then NRR.
 */
const getPublicPointsTable = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findOne({ _id: req.params.id, isPublic: true })
    .select('name format status pointsTable pointsSystem')
    .lean();

  if (!t) return next(ApiError.notFound('Tournament not found'));

  const sorted = [...(t.pointsTable || [])].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.netRunRate - a.netRunRate;
  });

  // Assign display positions
  sorted.forEach((entry, idx) => { entry.position = idx + 1; });

  ApiResponse.success(res, {
    tournamentId: t._id,
    tournamentName: t.name,
    format: t.format,
    status: t.status,
    pointsSystem: t.pointsSystem,
    standings: sorted
  });
});

/**
 * GET /api/v1/tournaments/:id/teams
 * Team list with squad details.
 */
const getTournamentTeams = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findOne({ _id: req.params.id, isPublic: true })
    .select('name teams')
    .populate('teams.captain', 'username fullName avatar')
    .populate('teams.players.user', 'username fullName avatar')
    .lean();

  if (!t) return next(ApiError.notFound('Tournament not found'));

  ApiResponse.success(res, {
    tournamentId: t._id,
    tournamentName: t.name,
    teams: t.teams || []
  });
});

/**
 * GET /api/v1/tournaments/:id/stats
 * Tournament-wide stats: total matches, runs, wickets, top scores, best bowling.
 * Also derives top scorers and top wicket-takers from completed match innings.
 */
const getTournamentPublicStats = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findOne({ _id: req.params.id, isPublic: true })
    .select('name stats awards fixtures')
    .lean();

  if (!t) return next(ApiError.notFound('Tournament not found'));

  // Collect match IDs from completed fixtures
  const completedMatchIds = (t.fixtures || [])
    .filter(f => f.status === 'completed' && f.match)
    .map(f => f.match);

  // Aggregate batting stats across all tournament matches
  const battingAgg = await Match.aggregate([
    { $match: { _id: { $in: completedMatchIds } } },
    { $unwind: '$innings' },
    { $unwind: '$innings.battingStats' },
    {
      $group: {
        _id: '$innings.battingStats.player',
        playerName: { $first: '$innings.battingStats.playerName' },
        totalRuns: { $sum: '$innings.battingStats.runs' },
        innings: { $sum: 1 },
        highestScore: { $max: '$innings.battingStats.runs' },
        fours: { $sum: '$innings.battingStats.fours' },
        sixes: { $sum: '$innings.battingStats.sixes' }
      }
    },
    { $sort: { totalRuns: -1 } },
    { $limit: 10 }
  ]);

  // Aggregate bowling stats
  const bowlingAgg = await Match.aggregate([
    { $match: { _id: { $in: completedMatchIds } } },
    { $unwind: '$innings' },
    { $unwind: '$innings.bowlingStats' },
    {
      $group: {
        _id: '$innings.bowlingStats.player',
        playerName: { $first: '$innings.bowlingStats.playerName' },
        totalWickets: { $sum: '$innings.bowlingStats.wickets' },
        totalRunsConceded: { $sum: '$innings.bowlingStats.runsConceded' },
        innings: { $sum: 1 }
      }
    },
    { $sort: { totalWickets: -1 } },
    { $limit: 10 }
  ]);

  ApiResponse.success(res, {
    tournamentId: t._id,
    tournamentName: t.name,
    overview: t.stats,
    awards: t.awards,
    topBatsmen: battingAgg,
    topBowlers: bowlingAgg
  });
});

module.exports = {
  listPublicTournaments,
  getLiveTournaments,
  getPublicTournament,
  getTournamentSchedule,
  getFixtureDetails,
  getPublicPointsTable,
  getTournamentTeams,
  getTournamentPublicStats
};
