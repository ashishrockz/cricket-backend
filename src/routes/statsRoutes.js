const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { ApiResponse, ApiError } = require('../utils/apiHelpers');
const { authenticate } = require('../middlewares/auth');
const { getPlayerCareerStats } = require('../services/statsService');
const User  = require('../models/User');
const Match = require('../models/Match');

/** GET /api/v1/stats/players/:userId — career stats for any player */
router.get('/players/:userId', authenticate, asyncHandler(async (req, res, next) => {
  const stats = await getPlayerCareerStats(req.params.userId);
  if (!stats) return next(ApiError.notFound('Player not found'));
  ApiResponse.success(res, { stats });
}));

/** GET /api/v1/stats/me — current user's own career stats */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const stats = await getPlayerCareerStats(req.user._id.toString());
  ApiResponse.success(res, { stats });
}));

/** GET /api/v1/stats/leaderboard?type=batting|bowling&limit=20 */
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
