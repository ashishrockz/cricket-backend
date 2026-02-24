const Tournament = require('../models/Tournament');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, buildPaginationResponse } = require('../utils/pagination');
const { logAction } = require('../services/auditService');

/** GET /api/v1/admin/tournaments */
const listTournaments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { status, format } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (format) filter.format = format;

  const [tournaments, totalDocs] = await Promise.all([
    Tournament.find(filter).populate('organizer', 'username fullName')
      .select('-fixtures -pointsTable -rules')
      .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Tournament.countDocuments(filter)
  ]);
  ApiResponse.paginated(res, tournaments, buildPaginationResponse(page, limit, totalDocs));
});

/** GET /api/v1/admin/tournaments/:id */
const getTournamentById = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findById(req.params.id)
    .populate('organizer', 'username fullName email')
    .populate('admins', 'username fullName')
    .populate('teams.captain', 'username fullName')
    .populate('teams.players.user', 'username fullName');
  if (!t) return next(ApiError.notFound('Tournament not found'));
  ApiResponse.success(res, { tournament: t });
});

/** POST /api/v1/admin/tournaments */
const createTournament = asyncHandler(async (req, res) => {
  const { name, description, format, matchFormat, totalOvers, minTeams, maxTeams, maxPlayersPerTeam, pointsSystem, startDate, endDate, registrationDeadline, venues, defaultVenue, rules, isPublic, entryFee, prizeMoney } = req.body;

  const tournament = await Tournament.create({
    name, description, format, matchFormat, totalOvers,
    minTeams: minTeams || 4, maxTeams: maxTeams || 16,
    maxPlayersPerTeam: maxPlayersPerTeam || 15,
    pointsSystem: pointsSystem || undefined,
    startDate, endDate, registrationDeadline,
    venues: venues || [], defaultVenue,
    rules, isPublic: isPublic !== false,
    entryFee: entryFee || 0, prizeMoney: prizeMoney || 0,
    organizer: req.user._id,
    admins: [req.user._id]
  });

  await logAction(req, { action: 'tournament_created', category: 'tournaments', targetType: 'tournament', targetId: tournament._id, targetLabel: name, description: `Created tournament: ${name} (${format}, ${matchFormat})` });
  ApiResponse.created(res, { tournament }, 'Tournament created');
});

/** PUT /api/v1/admin/tournaments/:id */
const updateTournament = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findById(req.params.id);
  if (!t) return next(ApiError.notFound('Tournament not found'));
  if (t.status === 'completed') return next(ApiError.badRequest('Cannot update completed tournament'));

  const fields = ['name', 'description', 'matchFormat', 'totalOvers', 'minTeams', 'maxTeams', 'maxPlayersPerTeam', 'pointsSystem', 'startDate', 'endDate', 'registrationDeadline', 'venues', 'defaultVenue', 'rules', 'isPublic', 'entryFee', 'prizeMoney'];
  fields.forEach(f => { if (req.body[f] !== undefined) t[f] = req.body[f]; });
  await t.save();

  await logAction(req, { action: 'tournament_updated', category: 'tournaments', targetType: 'tournament', targetId: t._id, description: `Updated tournament: ${t.name}` });
  ApiResponse.success(res, { tournament: t }, 'Tournament updated');
});

/** POST /api/v1/admin/tournaments/:id/teams — add a team */
const addTeam = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findById(req.params.id);
  if (!t) return next(ApiError.notFound('Tournament not found'));
  if (t.teams.length >= t.maxTeams) return next(ApiError.badRequest('Maximum teams reached'));
  if (!['draft', 'registration_open'].includes(t.status)) return next(ApiError.badRequest('Registration not open'));

  const { name, shortName, captain, players, color } = req.body;
  if (t.teams.some(team => team.name.toLowerCase() === name.toLowerCase())) {
    return next(ApiError.conflict('Team name already exists'));
  }

  t.teams.push({ name, shortName, captain, players: players || [], color });
  await t.save();

  ApiResponse.success(res, { tournament: t }, 'Team added');
});

/** DELETE /api/v1/admin/tournaments/:id/teams/:teamId */
const removeTeam = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findById(req.params.id);
  if (!t) return next(ApiError.notFound('Tournament not found'));
  if (!['draft', 'registration_open'].includes(t.status)) return next(ApiError.badRequest('Cannot remove teams after tournament starts'));

  t.teams.pull(req.params.teamId);
  await t.save();
  ApiResponse.success(res, { tournament: t }, 'Team removed');
});

/** POST /api/v1/admin/tournaments/:id/generate-fixtures */
const generateFixtures = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findById(req.params.id);
  if (!t) return next(ApiError.notFound('Tournament not found'));
  if (t.teams.length < t.minTeams) return next(ApiError.badRequest(`Need at least ${t.minTeams} teams`));
  if (t.fixtures.length > 0) return next(ApiError.badRequest('Fixtures already generated. Clear them first.'));

  const teams = t.teams;
  const fixtures = [];
  let matchNum = 1;

  if (t.format === 'league' || t.format === 'round_robin') {
    // Round-robin: every team plays every other team
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        fixtures.push({
          matchNumber: matchNum++,
          round: 1,
          roundLabel: 'League Stage',
          teamA: teams[i]._id,
          teamAName: teams[i].name,
          teamB: teams[j]._id,
          teamBName: teams[j].name,
          status: 'scheduled',
          venue: t.defaultVenue || null
        });
      }
    }
    t.totalRounds = 1;
  } else if (t.format === 'knockout') {
    // Single elimination bracket
    const n = teams.length;
    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(n)));
    const byes = nextPow2 - n;
    const round1Teams = [...teams];

    // Shuffle for randomness
    for (let i = round1Teams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [round1Teams[i], round1Teams[j]] = [round1Teams[j], round1Teams[i]];
    }

    // Round 1
    let roundLabel = getRoundLabel(nextPow2, nextPow2);
    for (let i = 0; i < round1Teams.length; i += 2) {
      if (i + 1 < round1Teams.length) {
        fixtures.push({
          matchNumber: matchNum++,
          round: 1, roundLabel,
          teamA: round1Teams[i]._id, teamAName: round1Teams[i].name,
          teamB: round1Teams[i + 1]._id, teamBName: round1Teams[i + 1].name,
          status: 'scheduled', bracketPosition: Math.floor(i / 2),
          venue: t.defaultVenue || null
        });
      }
    }

    // Subsequent rounds (placeholders)
    let currentRoundSize = nextPow2 / 2;
    let round = 2;
    while (currentRoundSize >= 1) {
      roundLabel = getRoundLabel(currentRoundSize * 2, nextPow2);
      for (let i = 0; i < currentRoundSize / 2; i++) {
        fixtures.push({
          matchNumber: matchNum++,
          round, roundLabel,
          teamAName: 'TBD', teamBName: 'TBD',
          status: 'scheduled', bracketPosition: i,
          venue: t.defaultVenue || null
        });
      }
      currentRoundSize /= 2;
      round++;
    }
    t.totalRounds = round - 1;
  } else if (t.format === 'group_knockout') {
    const groupCount = t.knockoutConfig?.groupCount || 2;
    const teamsPerGroup = Math.ceil(teams.length / groupCount);

    // Shuffle teams
    const shuffled = [...teams].sort(() => Math.random() - 0.5);

    // Create groups and round-robin within each
    for (let g = 0; g < groupCount; g++) {
      const groupTeams = shuffled.slice(g * teamsPerGroup, (g + 1) * teamsPerGroup);
      for (let i = 0; i < groupTeams.length; i++) {
        for (let j = i + 1; j < groupTeams.length; j++) {
          fixtures.push({
            matchNumber: matchNum++,
            round: 1,
            roundLabel: `Group ${String.fromCharCode(65 + g)}`,
            teamA: groupTeams[i]._id, teamAName: groupTeams[i].name,
            teamB: groupTeams[j]._id, teamBName: groupTeams[j].name,
            status: 'scheduled',
            venue: t.defaultVenue || null
          });
        }
      }
    }

    // Knockout placeholders
    const qualifyPerGroup = t.knockoutConfig?.qualifyFromGroup || 2;
    const knockoutTeams = groupCount * qualifyPerGroup;
    let koRound = 2;
    let koSize = knockoutTeams;
    while (koSize >= 2) {
      const label = getRoundLabel(koSize, knockoutTeams);
      for (let i = 0; i < koSize / 2; i++) {
        fixtures.push({
          matchNumber: matchNum++,
          round: koRound, roundLabel: label,
          teamAName: 'TBD', teamBName: 'TBD',
          status: 'scheduled',
          venue: t.defaultVenue || null
        });
      }
      koSize /= 2;
      koRound++;
    }
    t.totalRounds = koRound - 1;
  }

  t.fixtures = fixtures;

  // Initialize points table
  t.pointsTable = teams.map((team, idx) => ({
    team: team._id,
    teamName: team.name,
    position: idx + 1
  }));

  await t.save();

  await logAction(req, { action: 'tournament_updated', category: 'tournaments', targetType: 'tournament', targetId: t._id, description: `Generated ${fixtures.length} fixtures for ${t.name}` });

  ApiResponse.success(res, { tournament: t, fixtureCount: fixtures.length }, 'Fixtures generated');
});

/** POST /api/v1/admin/tournaments/:id/start */
const startTournament = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findById(req.params.id);
  if (!t) return next(ApiError.notFound('Tournament not found'));
  if (t.fixtures.length === 0) return next(ApiError.badRequest('Generate fixtures first'));
  if (t.status === 'in_progress') return next(ApiError.badRequest('Already in progress'));

  t.status = 'in_progress';
  t.currentRound = 1;
  if (!t.startDate) t.startDate = new Date();
  await t.save();

  await logAction(req, { action: 'tournament_started', category: 'tournaments', targetType: 'tournament', targetId: t._id, description: `Started tournament: ${t.name}`, severity: 'warning' });

  ApiResponse.success(res, { tournament: t }, 'Tournament started');
});

/** POST /api/v1/admin/tournaments/:id/complete */
const completeTournament = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findById(req.params.id);
  if (!t) return next(ApiError.notFound('Tournament not found'));

  const { manOfTheTournament, bestBatsman, bestBowler } = req.body;
  t.status = 'completed';
  if (!t.endDate) t.endDate = new Date();
  if (manOfTheTournament) t.awards.manOfTheTournament = manOfTheTournament;
  if (bestBatsman) t.awards.bestBatsman = bestBatsman;
  if (bestBowler) t.awards.bestBowler = bestBowler;
  await t.save();

  await logAction(req, { action: 'tournament_completed', category: 'tournaments', targetType: 'tournament', targetId: t._id, description: `Completed tournament: ${t.name}`, severity: 'warning' });

  ApiResponse.success(res, { tournament: t }, 'Tournament completed');
});

/** POST /api/v1/admin/tournaments/:id/cancel */
const cancelTournament = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findById(req.params.id);
  if (!t) return next(ApiError.notFound('Tournament not found'));
  if (t.status === 'completed') return next(ApiError.badRequest('Cannot cancel completed tournament'));

  t.status = 'cancelled';
  await t.save();

  await logAction(req, { action: 'tournament_cancelled', category: 'tournaments', targetType: 'tournament', targetId: t._id, description: `Cancelled tournament: ${t.name}`, severity: 'critical' });

  ApiResponse.success(res, { tournament: t }, 'Tournament cancelled');
});

/** PUT /api/v1/admin/tournaments/:id/fixtures/:fixtureId — update fixture result */
const updateFixtureResult = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findById(req.params.id);
  if (!t) return next(ApiError.notFound('Tournament not found'));

  const fixture = t.fixtures.id(req.params.fixtureId);
  if (!fixture) return next(ApiError.notFound('Fixture not found'));

  const { status, winnerId, resultSummary, matchStats, matchId } = req.body;

  if (matchId) fixture.match = matchId;
  if (status) fixture.status = status;

  if (status === 'completed' && winnerId) {
    t.recordFixtureResult(fixture._id, winnerId, resultSummary, matchStats);
  }

  await t.save();
  ApiResponse.success(res, { tournament: t }, 'Fixture updated');
});

/** GET /api/v1/admin/tournaments/:id/points-table */
const getPointsTable = asyncHandler(async (req, res, next) => {
  const t = await Tournament.findById(req.params.id).select('pointsTable name format');
  if (!t) return next(ApiError.notFound('Tournament not found'));

  const sorted = [...t.pointsTable].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.netRunRate - a.netRunRate;
  });

  ApiResponse.success(res, { tournamentName: t.name, format: t.format, pointsTable: sorted });
});

/** GET /api/v1/admin/tournaments/stats */
const getTournamentStats = asyncHandler(async (req, res) => {
  const [total, byStatus, byFormat] = await Promise.all([
    Tournament.countDocuments(),
    Tournament.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Tournament.aggregate([{ $group: { _id: '$format', count: { $sum: 1 } } }])
  ]);
  ApiResponse.success(res, { total, byStatus, byFormat });
});

function getRoundLabel(teamsInRound, totalTeams) {
  if (teamsInRound === 2) return 'Final';
  if (teamsInRound === 4) return 'Semi-Final';
  if (teamsInRound === 8) return 'Quarter-Final';
  return `Round of ${teamsInRound}`;
}

module.exports = {
  listTournaments, getTournamentById, createTournament, updateTournament,
  addTeam, removeTeam, generateFixtures,
  startTournament, completeTournament, cancelTournament,
  updateFixtureResult, getPointsTable, getTournamentStats
};
