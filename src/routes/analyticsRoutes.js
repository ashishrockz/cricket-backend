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
 *     tags: [Analytics]
 *     summary: Dashboard summary — users, matches, rooms, subscriptions, revenue
 */
router.get('/dashboard', authenticate, adminOnly, getDashboardStats);

/**
 * @swagger
 * /api/v1/admin/analytics/leaderboard/batting:
 *   get:
 *     tags: [Analytics]
 *     summary: Batting leaderboard
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [7d, 30d, 90d, 6m, 1y, all_time] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25, max: 100 }
 */
router.get('/leaderboard/batting', authenticate, adminOnly, getBattingLeaderboard);

/**
 * @swagger
 * /api/v1/admin/analytics/leaderboard/bowling:
 *   get:
 *     tags: [Analytics]
 *     summary: Bowling leaderboard
 */
router.get('/leaderboard/bowling', authenticate, adminOnly, getBowlingLeaderboard);

/**
 * @swagger
 * /api/v1/admin/analytics/matches:
 *   get:
 *     tags: [Analytics]
 *     summary: Match analytics — format distribution, avg scores, dismissals, venues
 */
router.get('/matches', authenticate, adminOnly, getMatchAnalytics);

/**
 * @swagger
 * /api/v1/admin/analytics/platform:
 *   get:
 *     tags: [Analytics]
 *     summary: Platform analytics — DAU/WAU/MAU, signups, user demographics
 */
router.get('/platform', authenticate, adminOnly, getPlatformAnalytics);

router.get('/user-growth',    authenticate, adminOnly, getUserGrowth);
router.get('/match-activity', authenticate, adminOnly, getMatchActivitySummary);
router.get('/revenue',        authenticate, adminOnly, getRevenueSummary);

module.exports = router;
