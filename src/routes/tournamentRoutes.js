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

/**
 * @swagger
 * /api/v1/admin/tournaments/stats:
 *   get:
 *     summary: Tournament overview stats — counts by status, format, recent activity
 *     tags: [Admin - Tournaments]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tournament stats
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/stats', authenticate, adminOnly, getTournamentStats);

/**
 * @swagger
 * /api/v1/admin/tournaments:
 *   get:
 *     summary: List all tournaments with filters
 *     tags: [Admin - Tournaments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - $ref: '#/components/parameters/SearchQuery'
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, registration_open, in_progress, completed, cancelled]
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [league, knockout, group_knockout, round_robin, double_elimination]
 *     responses:
 *       200:
 *         description: Paginated tournament list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Tournament' }
 *                 pagination: { $ref: '#/components/schemas/PaginationMeta' }
 */
router.get('/', authenticate, adminOnly, listTournaments);

/**
 * @swagger
 * /api/v1/admin/tournaments:
 *   post:
 *     summary: Create a new tournament
 *     tags: [Admin - Tournaments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, format, matchFormat, totalOvers]
 *             properties:
 *               name:         { type: string, example: IPL 2025 }
 *               description:  { type: string }
 *               format:       { type: string, enum: [league, knockout, group_knockout, round_robin, double_elimination] }
 *               matchFormat:  { type: string, enum: [T10, T20, ODI, TEST, CUSTOM] }
 *               totalOvers:   { type: integer, example: 20 }
 *               maxTeams:     { type: integer, example: 8 }
 *               isPublic:     { type: boolean }
 *               entryFee:     { type: number }
 *               prizeMoney:   { type: number }
 *               startDate:    { type: string, format: date-time }
 *               endDate:      { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Tournament created (status = draft)
 */
router.post('/', authenticate, adminOnly, validate(createSchema), createTournament);

/**
 * @swagger
 * /api/v1/admin/tournaments/{id}:
 *   get:
 *     summary: Get tournament details including teams and fixtures
 *     tags: [Admin - Tournaments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Tournament details
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id', authenticate, adminOnly, getTournamentById);

/**
 * @swagger
 * /api/v1/admin/tournaments/{id}:
 *   put:
 *     summary: Update tournament details
 *     tags: [Admin - Tournaments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Tournament'
 *     responses:
 *       200:
 *         description: Tournament updated
 */
router.put('/:id', authenticate, adminOnly, validate(updateSchema), updateTournament);

/**
 * @swagger
 * /api/v1/admin/tournaments/{id}/teams:
 *   post:
 *     summary: Add a team to the tournament
 *     tags: [Admin - Tournaments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:      { type: string, example: Mumbai Indians }
 *               shortName: { type: string, example: MI }
 *               captain:   { type: string, description: User ID }
 *               color:     { type: string, example: '#004BA0' }
 *               players:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:         { type: string }
 *                     user:         { type: string }
 *                     isRegistered: { type: boolean }
 *     responses:
 *       200:
 *         description: Team added
 */
router.post('/:id/teams', authenticate, adminOnly, validate(addTeamSchema), addTeam);

/**
 * @swagger
 * /api/v1/admin/tournaments/{id}/teams/{teamId}:
 *   delete:
 *     summary: Remove a team from the tournament
 *     tags: [Admin - Tournaments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Team removed
 */
router.delete('/:id/teams/:teamId', authenticate, adminOnly, removeTeam);

/**
 * @swagger
 * /api/v1/admin/tournaments/{id}/generate-fixtures:
 *   post:
 *     summary: Auto-generate match fixtures based on the tournament format
 *     description: Generates round-robin, knockout, or group-stage fixtures. Requires at least minTeams registered.
 *     tags: [Admin - Tournaments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Fixtures generated
 *       400:
 *         description: Insufficient teams or fixtures already exist
 */
router.post('/:id/generate-fixtures', authenticate, adminOnly, generateFixtures);

/**
 * @swagger
 * /api/v1/admin/tournaments/{id}/start:
 *   post:
 *     summary: Start the tournament (status → in_progress)
 *     tags: [Admin - Tournaments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Tournament started
 */
router.post('/:id/start', authenticate, adminOnly, startTournament);

/**
 * @swagger
 * /api/v1/admin/tournaments/{id}/complete:
 *   post:
 *     summary: Mark the tournament as completed
 *     tags: [Admin - Tournaments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Tournament completed
 */
router.post('/:id/complete', authenticate, adminOnly, completeTournament);

/**
 * @swagger
 * /api/v1/admin/tournaments/{id}/cancel:
 *   post:
 *     summary: Cancel a tournament
 *     tags: [Admin - Tournaments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Tournament cancelled
 */
router.post('/:id/cancel', authenticate, adminOnly, cancelTournament);

/**
 * @swagger
 * /api/v1/admin/tournaments/{id}/fixtures/{fixtureId}:
 *   put:
 *     summary: Update a fixture result
 *     tags: [Admin - Tournaments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *       - in: path
 *         name: fixtureId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:        { type: string, enum: [scheduled, in_progress, completed, cancelled] }
 *               winnerId:      { type: string, nullable: true }
 *               resultSummary: { type: string }
 *               matchId:       { type: string }
 *               matchStats:
 *                 type: object
 *                 properties:
 *                   teamARuns:  { type: number }
 *                   teamAOvers: { type: number }
 *                   teamBRuns:  { type: number }
 *                   teamBOvers: { type: number }
 *     responses:
 *       200:
 *         description: Fixture result updated
 */
router.put('/:id/fixtures/:fixtureId', authenticate, adminOnly, validate(fixtureResultSchema), updateFixtureResult);

/**
 * @swagger
 * /api/v1/admin/tournaments/{id}/points-table:
 *   get:
 *     summary: Get the tournament points table / standings
 *     tags: [Admin - Tournaments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Points table with team standings
 */
router.get('/:id/points-table', authenticate, adminOnly, getPointsTable);

module.exports = router;
