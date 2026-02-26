const router = require('express').Router();
const { optionalAuthenticate } = require('../middlewares/auth');
const {
  listPublicTournaments,
  getLiveTournaments,
  getPublicTournament,
  getTournamentSchedule,
  getFixtureDetails,
  getPublicPointsTable,
  getTournamentTeams,
  getTournamentPublicStats
} = require('../controllers/publicTournamentController');

/**
 * @swagger
 * /api/v1/tournaments:
 *   get:
 *     summary: List public tournaments
 *     description: >
 *       Returns paginated list of public tournaments. By default returns only
 *       `registration_open` and `in_progress` tournaments — perfect for the home page.
 *       Pass `?status=completed` for past tournaments.
 *     tags: [Tournaments]
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - $ref: '#/components/parameters/SearchQuery'
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           example: registration_open,in_progress
 *         description: "Comma-separated statuses. Default: registration_open,in_progress. Options: draft, registration_open, in_progress, completed, cancelled"
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
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:          { type: string }
 *                       name:         { type: string, example: City T20 Championship 2025 }
 *                       code:         { type: string, example: CTC-48291 }
 *                       format:       { type: string, example: league }
 *                       matchFormat:  { type: string, example: T20 }
 *                       status:       { type: string, example: in_progress }
 *                       startDate:    { type: string, format: date-time }
 *                       endDate:      { type: string, format: date-time }
 *                       teamCount:    { type: integer, example: 8 }
 *                       maxTeams:     { type: integer, example: 8 }
 *                       organizer:
 *                         type: object
 *                         properties:
 *                           username: { type: string }
 *                           fullName: { type: string }
 *                           avatar:   { type: string, nullable: true }
 *                       entryFee:     { type: number, example: 500 }
 *                       prizeMoney:   { type: number, example: 10000 }
 *                       banner:       { type: string, nullable: true }
 *                 pagination: { $ref: '#/components/schemas/PaginationMeta' }
 */
router.get('/', optionalAuthenticate, listPublicTournaments);

/**
 * @swagger
 * /api/v1/tournaments/live:
 *   get:
 *     summary: Get live tournaments with ongoing match scores
 *     description: >
 *       Returns all in_progress tournaments. Each tournament includes
 *       its current/upcoming fixtures and live ball-by-ball scores for
 *       any match currently in_progress. Use this to power the "Live Now" widget.
 *     tags: [Tournaments]
 *     responses:
 *       200:
 *         description: Live tournaments with live fixture scores
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     total: { type: integer, example: 2 }
 *                     tournaments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:          { type: string }
 *                           name:         { type: string }
 *                           format:       { type: string }
 *                           currentRound: { type: integer }
 *                           liveFixtures:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 matchNumber: { type: integer }
 *                                 teamAName:   { type: string }
 *                                 teamBName:   { type: string }
 *                                 status:      { type: string }
 *                                 venue:       { type: string, nullable: true }
 *                                 liveScore:
 *                                   type: object
 *                                   nullable: true
 *                                   properties:
 *                                     status:  { type: string }
 *                                     innings:
 *                                       type: array
 *                                       items:
 *                                         type: object
 *                                         properties:
 *                                           inningsNumber: { type: integer }
 *                                           totalRuns:     { type: integer }
 *                                           totalWickets:  { type: integer }
 *                                           overs:         { type: string, example: "14.3" }
 *                                           target:        { type: integer, nullable: true }
 */
router.get('/live', getLiveTournaments);

/**
 * @swagger
 * /api/v1/tournaments/{id}:
 *   get:
 *     summary: Get tournament details
 *     description: >
 *       Full public tournament info — name, format, dates, venue, organizer,
 *       sponsors, awards. Does NOT include fixtures or points table (use
 *       /schedule and /points-table for those).
 *     tags: [Tournaments]
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Tournament details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournament: { $ref: '#/components/schemas/Tournament' }
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id', optionalAuthenticate, getPublicTournament);

/**
 * @swagger
 * /api/v1/tournaments/{id}/schedule:
 *   get:
 *     summary: Get the full fixture schedule grouped by round
 *     description: >
 *       Returns all fixtures for the tournament, grouped by round
 *       (Group Stage → Quarter-Final → Semi-Final → Final).
 *       Fixtures linked to an active match include a `liveScore` snapshot.
 *     tags: [Tournaments]
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *       - in: query
 *         name: round
 *         schema: { type: integer }
 *         description: Filter to a specific round number
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, in_progress, completed, cancelled]
 *         description: Filter fixtures by status
 *     responses:
 *       200:
 *         description: Schedule grouped by round
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:   { type: string }
 *                     tournamentName: { type: string }
 *                     format:         { type: string }
 *                     status:         { type: string }
 *                     currentRound:   { type: integer }
 *                     totalRounds:    { type: integer }
 *                     schedule:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           round:    { type: integer, example: 1 }
 *                           label:    { type: string, example: Group Stage }
 *                           fixtures:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 matchNumber:   { type: integer }
 *                                 teamAName:     { type: string }
 *                                 teamBName:     { type: string }
 *                                 status:        { type: string }
 *                                 scheduledDate: { type: string, format: date-time, nullable: true }
 *                                 venue:         { type: string, nullable: true }
 *                                 resultSummary: { type: string, nullable: true }
 *                                 winner:        { type: string, nullable: true }
 *                                 liveScore:     { type: object, nullable: true }
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id/schedule', optionalAuthenticate, getTournamentSchedule);

/**
 * @swagger
 * /api/v1/tournaments/{id}/fixtures/{fixtureId}:
 *   get:
 *     summary: Get a single fixture with full match scorecard
 *     description: >
 *       Returns fixture metadata plus the full match document if a match
 *       has been linked to this fixture. Includes innings scorecards,
 *       batting stats, bowling stats, and fall of wickets.
 *     tags: [Tournaments]
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *       - in: path
 *         name: fixtureId
 *         required: true
 *         schema: { type: string }
 *         description: The fixture's MongoDB sub-document ID
 *     responses:
 *       200:
 *         description: Fixture + match scorecard
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournament:
 *                       type: object
 *                       properties:
 *                         _id:    { type: string }
 *                         name:   { type: string }
 *                         code:   { type: string }
 *                         format: { type: string }
 *                     fixture:
 *                       type: object
 *                       properties:
 *                         matchNumber:   { type: integer }
 *                         roundLabel:    { type: string }
 *                         teamAName:     { type: string }
 *                         teamBName:     { type: string }
 *                         status:        { type: string }
 *                         resultSummary: { type: string, nullable: true }
 *                         venue:         { type: string, nullable: true }
 *                     match:
 *                       description: Full match document (null if not started)
 *                       nullable: true
 *                       type: object
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id/fixtures/:fixtureId', optionalAuthenticate, getFixtureDetails);

/**
 * @swagger
 * /api/v1/tournaments/{id}/points-table:
 *   get:
 *     summary: Get the tournament standings / points table
 *     description: >
 *       Returns teams ranked by points then net run rate.
 *       Only meaningful for league/round_robin/group_knockout formats.
 *     tags: [Tournaments]
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Sorted standings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:   { type: string }
 *                     tournamentName: { type: string }
 *                     format:         { type: string }
 *                     status:         { type: string }
 *                     pointsSystem:
 *                       type: object
 *                       properties:
 *                         win:      { type: integer, example: 2 }
 *                         loss:     { type: integer, example: 0 }
 *                         tie:      { type: integer, example: 1 }
 *                         noResult: { type: integer, example: 1 }
 *                     standings:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           position:   { type: integer, example: 1 }
 *                           teamName:   { type: string, example: Mumbai Strikers }
 *                           played:     { type: integer, example: 6 }
 *                           won:        { type: integer, example: 4 }
 *                           lost:       { type: integer, example: 2 }
 *                           tied:       { type: integer, example: 0 }
 *                           noResult:   { type: integer, example: 0 }
 *                           points:     { type: integer, example: 8 }
 *                           netRunRate: { type: number, example: 0.425 }
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id/points-table', optionalAuthenticate, getPublicPointsTable);

/**
 * @swagger
 * /api/v1/tournaments/{id}/teams:
 *   get:
 *     summary: Get tournament teams with squad details
 *     description: Returns all registered teams and their player rosters.
 *     tags: [Tournaments]
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Teams with squad
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:   { type: string }
 *                     tournamentName: { type: string }
 *                     teams:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:       { type: string }
 *                           name:      { type: string, example: Mumbai Strikers }
 *                           shortName: { type: string, example: MS }
 *                           color:     { type: string, example: '#004BA0' }
 *                           captain:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               username: { type: string }
 *                               fullName: { type: string }
 *                               avatar:   { type: string, nullable: true }
 *                           players:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 name:         { type: string }
 *                                 isRegistered: { type: boolean }
 *                                 user:
 *                                   type: object
 *                                   nullable: true
 *                                   properties:
 *                                     username: { type: string }
 *                                     fullName: { type: string }
 *                                     avatar:   { type: string, nullable: true }
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id/teams', optionalAuthenticate, getTournamentTeams);

/**
 * @swagger
 * /api/v1/tournaments/{id}/stats:
 *   get:
 *     summary: Get tournament statistics
 *     description: >
 *       Returns tournament-wide stats: total matches, runs, wickets, highest/lowest
 *       team scores, and derived top-10 batsmen and bowlers from all completed match innings.
 *     tags: [Tournaments]
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Tournament statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:   { type: string }
 *                     tournamentName: { type: string }
 *                     overview:
 *                       type: object
 *                       properties:
 *                         totalMatchesPlayed: { type: integer }
 *                         totalRunsScored:    { type: integer }
 *                         totalWicketsTaken:  { type: integer }
 *                         highestScore:
 *                           type: object
 *                           properties:
 *                             value: { type: integer }
 *                             team:  { type: string }
 *                             against: { type: string }
 *                     awards:
 *                       type: object
 *                       properties:
 *                         manOfTheTournament: { type: object, nullable: true }
 *                         bestBatsman:        { type: object, nullable: true }
 *                         bestBowler:         { type: object, nullable: true }
 *                     topBatsmen:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           playerName:  { type: string }
 *                           totalRuns:   { type: integer, example: 385 }
 *                           innings:     { type: integer }
 *                           highestScore:{ type: integer }
 *                           fours:       { type: integer }
 *                           sixes:       { type: integer }
 *                     topBowlers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           playerName:        { type: string }
 *                           totalWickets:      { type: integer, example: 14 }
 *                           totalRunsConceded: { type: integer }
 *                           innings:           { type: integer }
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id/stats', optionalAuthenticate, getTournamentPublicStats);

module.exports = router;
