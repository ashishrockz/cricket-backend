const router = require('express').Router();
const { authenticate, adminOnly } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const Joi = require('joi');
const {
  listTournaments, getTournamentById, createTournament, updateTournament,
  addTeam, removeTeam, generateFixtures,
  startTournament, completeTournament, cancelTournament,
  updateFixtureResult, getPointsTable, getTournamentStats
} = require('../controllers/tournamentController');

const createSchema = Joi.object({
  name: Joi.string().min(3).max(150).required(),
  description: Joi.string().max(2000).allow(null, ''),
  format: Joi.string().valid('league', 'knockout', 'group_knockout', 'round_robin', 'double_elimination').required(),
  matchFormat: Joi.string().valid('T10', 'T20', 'ODI', 'TEST', 'CUSTOM').required(),
  totalOvers: Joi.number().integer().min(1).max(90).required(),
  minTeams: Joi.number().integer().min(2).max(64),
  maxTeams: Joi.number().integer().min(2).max(64),
  maxPlayersPerTeam: Joi.number().integer().min(2).max(25),
  pointsSystem: Joi.object({
    win: Joi.number(), loss: Joi.number(),
    tie: Joi.number(), noResult: Joi.number(), bonusPoint: Joi.number()
  }),
  startDate: Joi.date().allow(null),
  endDate: Joi.date().allow(null),
  registrationDeadline: Joi.date().allow(null),
  venues: Joi.array().items(Joi.string().max(200)),
  defaultVenue: Joi.string().max(200).allow(null, ''),
  rules: Joi.string().max(5000).allow(null, ''),
  isPublic: Joi.boolean(),
  entryFee: Joi.number().min(0),
  prizeMoney: Joi.number().min(0)
});

const updateSchema = createSchema.fork(
  ['name', 'format', 'matchFormat', 'totalOvers'],
  s => s.optional()
);

const addTeamSchema = Joi.object({
  name: Joi.string().min(2).max(60).required(),
  shortName: Joi.string().max(10),
  captain: Joi.string().hex().length(24).allow(null),
  players: Joi.array().items(Joi.object({
    user: Joi.string().hex().length(24).allow(null),
    name: Joi.string().min(2).max(60).required(),
    isRegistered: Joi.boolean()
  })),
  color: Joi.string().max(10)
});

const fixtureResultSchema = Joi.object({
  status: Joi.string().valid('scheduled', 'in_progress', 'completed', 'cancelled'),
  winnerId: Joi.string().hex().length(24).allow(null),
  resultSummary: Joi.string().max(200),
  matchId: Joi.string().hex().length(24),
  matchStats: Joi.object({
    teamARuns: Joi.number(), teamAOvers: Joi.number(),
    teamBRuns: Joi.number(), teamBOvers: Joi.number()
  })
});

// Stats overview
router.get('/stats', authenticate, adminOnly, getTournamentStats);

// CRUD
router.get('/', authenticate, adminOnly, listTournaments);
router.post('/', authenticate, adminOnly, validate(createSchema), createTournament);
router.get('/:id', authenticate, adminOnly, getTournamentById);
router.put('/:id', authenticate, adminOnly, validate(updateSchema), updateTournament);

// Team management
router.post('/:id/teams', authenticate, adminOnly, validate(addTeamSchema), addTeam);
router.delete('/:id/teams/:teamId', authenticate, adminOnly, removeTeam);

// Fixtures & lifecycle
router.post('/:id/generate-fixtures', authenticate, adminOnly, generateFixtures);
router.post('/:id/start', authenticate, adminOnly, startTournament);
router.post('/:id/complete', authenticate, adminOnly, completeTournament);
router.post('/:id/cancel', authenticate, adminOnly, cancelTournament);

// Fixture result
router.put('/:id/fixtures/:fixtureId', authenticate, adminOnly, validate(fixtureResultSchema), updateFixtureResult);

// Points table
router.get('/:id/points-table', authenticate, adminOnly, getPointsTable);

module.exports = router;
