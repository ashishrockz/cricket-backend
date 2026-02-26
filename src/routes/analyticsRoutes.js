const router = require('express').Router();
const { authenticate, adminOnly } = require('../middlewares/auth');
const {
  getBattingLeaderboard, getBowlingLeaderboard,
  getMatchAnalytics, getPlatformAnalytics, getDashboardStats,
  getUserGrowth, getMatchActivitySummary, getRevenueSummary
} = require('../controllers/analyticsController');

/**
 * @swagger
 * /api/v1/admin/analytics/dashboard:
 *   get:
 *     summary: Analytics dashboard — users, matches, rooms, revenue, active subscriptions
 *     tags: [Admin - Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/dashboard', authenticate, adminOnly, getDashboardStats);

/**
 * @swagger
 * /api/v1/admin/analytics/leaderboard/batting:
 *   get:
 *     summary: Batting leaderboard — top scorers by period
 *     description: For `all_time` uses denormalized User.stats; for time-bounded periods aggregates from Match innings.
 *     tags: [Admin - Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PeriodQuery'
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25, minimum: 1, maximum: 100 }
 *     responses:
 *       200:
 *         description: Batting leaderboard
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     period: { type: string }
 *                     leaderboard:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           username: { type: string }
 *                           fullName: { type: string }
 *                           city: { type: string }
 *                           stats: { $ref: '#/components/schemas/UserStats' }
 */
router.get('/leaderboard/batting', authenticate, adminOnly, getBattingLeaderboard);

/**
 * @swagger
 * /api/v1/admin/analytics/leaderboard/bowling:
 *   get:
 *     summary: Bowling leaderboard — top wicket-takers by period
 *     tags: [Admin - Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PeriodQuery'
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25, minimum: 1, maximum: 100 }
 *     responses:
 *       200:
 *         description: Bowling leaderboard
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     period: { type: string }
 *                     leaderboard:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           username: { type: string }
 *                           fullName: { type: string }
 *                           stats:
 *                             type: object
 *                             properties:
 *                               totalWickets: { type: integer }
 *                               matchesPlayed: { type: integer }
 */
router.get('/leaderboard/bowling', authenticate, adminOnly, getBowlingLeaderboard);

/**
 * @swagger
 * /api/v1/admin/analytics/matches:
 *   get:
 *     summary: Match analytics — format distribution, avg scores, dismissals, venues, win types
 *     tags: [Admin - Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Match analytics
 */
router.get('/matches', authenticate, adminOnly, getMatchAnalytics);

/**
 * @swagger
 * /api/v1/admin/analytics/platform:
 *   get:
 *     summary: Platform analytics — DAU/WAU/MAU, signup trends, user demographics (cities, playing roles)
 *     tags: [Admin - Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Platform analytics
 */
router.get('/platform', authenticate, adminOnly, getPlatformAnalytics);

/**
 * @swagger
 * /api/v1/admin/analytics/user-growth:
 *   get:
 *     summary: Daily user signup counts over a time period
 *     tags: [Admin - Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PeriodQuery'
 *     responses:
 *       200:
 *         description: Daily signup trend
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
 *                       date:  { type: string, format: date, example: '2025-01-15' }
 *                       count: { type: integer, example: 12 }
 */
router.get('/user-growth', authenticate, adminOnly, getUserGrowth);

/**
 * @swagger
 * /api/v1/admin/analytics/match-activity:
 *   get:
 *     summary: Daily match creation counts over a time period
 *     tags: [Admin - Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PeriodQuery'
 *     responses:
 *       200:
 *         description: Daily match activity trend
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
 *                       date:  { type: string, format: date }
 *                       count: { type: integer }
 */
router.get('/match-activity', authenticate, adminOnly, getMatchActivitySummary);

/**
 * @swagger
 * /api/v1/admin/analytics/revenue:
 *   get:
 *     summary: Daily revenue from subscription payments over a time period
 *     tags: [Admin - Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PeriodQuery'
 *     responses:
 *       200:
 *         description: Revenue trend
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalRevenue: { type: number }
 *                     dailyRevenue:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:     { type: string, format: date }
 *                           revenue:  { type: number }
 *                           payments: { type: integer }
 */
router.get('/revenue', authenticate, adminOnly, getRevenueSummary);

module.exports = router;
