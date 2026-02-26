const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { ApiResponse, ApiError } = require('../utils/apiHelpers');
const { authenticate } = require('../middlewares/auth');
const { getPlayerCareerStats } = require('../services/statsService');
const User  = require('../models/User');
const Match = require('../models/Match');

/**
 * @swagger
 * /api/v1/stats/players/{userId}:
 *   get:
 *     summary: Get career statistics for any player
 *     description: Returns full career stats for the specified user — batting, bowling, fielding totals, match history summary, and milestones.
 *     tags: [Stats]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the player
 *     responses:
 *       200:
 *         description: Player career statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalRuns:       { type: integer, example: 1250 }
 *                         totalWickets:    { type: integer, example: 34 }
 *                         matchesPlayed:   { type: integer, example: 48 }
 *                         highestScore:    { type: integer, example: 98 }
 *                         fifties:         { type: integer, example: 7 }
 *                         hundreds:        { type: integer, example: 1 }
 *                         totalCatches:    { type: integer, example: 12 }
 *                         battingAverage:  { type: number, example: 31.25 }
 *                         bowlingAverage:  { type: number, example: 22.6 }
 *                         strikeRate:      { type: number, example: 128.5 }
 *                         economyRate:     { type: number, example: 7.8 }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/players/:userId', authenticate, asyncHandler(async (req, res, next) => {
  const stats = await getPlayerCareerStats(req.params.userId);
  if (!stats) return next(ApiError.notFound('Player not found'));
  ApiResponse.success(res, { stats });
}));

/**
 * @swagger
 * /api/v1/stats/me:
 *   get:
 *     summary: Get current user's own career statistics
 *     description: Returns the authenticated user's full career stats — same shape as /stats/players/{userId} but no ID param required.
 *     tags: [Stats]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current user's career statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalRuns:       { type: integer, example: 850 }
 *                         totalWickets:    { type: integer, example: 21 }
 *                         matchesPlayed:   { type: integer, example: 32 }
 *                         highestScore:    { type: integer, example: 76 }
 *                         fifties:         { type: integer, example: 4 }
 *                         hundreds:        { type: integer, example: 0 }
 *                         battingAverage:  { type: number, example: 28.3 }
 *                         bowlingAverage:  { type: number, example: 25.1 }
 *                         strikeRate:      { type: number, example: 122.4 }
 *                         economyRate:     { type: number, example: 8.1 }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const stats = await getPlayerCareerStats(req.user._id.toString());
  ApiResponse.success(res, { stats });
}));

/**
 * @swagger
 * /api/v1/stats/leaderboard:
 *   get:
 *     summary: Get the global player leaderboard
 *     description: Returns a ranked list of active players sorted by total runs (batting) or total wickets (bowling). Maximum 100 results.
 *     tags: [Stats]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [batting, bowling]
 *           default: batting
 *         description: Leaderboard category — batting sorts by total runs, bowling by total wickets
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Number of players to return (capped at 100)
 *     responses:
 *       200:
 *         description: Leaderboard rankings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [batting, bowling]
 *                       example: batting
 *                     players:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:           { type: string }
 *                           username:      { type: string, example: virat_18 }
 *                           fullName:      { type: string, example: Virat Kumar }
 *                           avatar:        { type: string, nullable: true }
 *                           city:          { type: string, example: Delhi }
 *                           stats:
 *                             type: object
 *                             properties:
 *                               totalRuns:     { type: integer, example: 2100 }
 *                               totalWickets:  { type: integer, example: 0 }
 *                               matchesPlayed: { type: integer, example: 65 }
 *                               highestScore:  { type: integer, example: 112 }
 *                               fifties:       { type: integer, example: 14 }
 *                               hundreds:      { type: integer, example: 2 }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/leaderboard', authenticate, asyncHandler(async (req, res) => {
  const type  = req.query.type || 'batting';
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  const sortField = type === 'bowling' ? 'stats.totalWickets' : 'stats.totalRuns';
  const players = await User.find({ isActive: true, isBanned: false })
    .select('username fullName avatar city stats.totalRuns stats.totalWickets stats.matchesPlayed stats.highestScore stats.fifties stats.hundreds')
    .sort({ [sortField]: -1 })
    .limit(limit)
    .lean();

  ApiResponse.success(res, { type, players });
}));

module.exports = router;
