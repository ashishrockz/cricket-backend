const User = require('../models/User');
const Room = require('../models/Room');
const Match = require('../models/Match');
const ScoreEvent = require('../models/ScoreEvent');
const Friendship = require('../models/Friendship');
const Subscription = require('../models/Subscription');
const Enterprise = require('../models/Enterprise');
const Ad = require('../models/Ad');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, buildPaginationResponse } = require('../utils/pagination');
const logger = require('../config/logger');
const { logAction } = require('../services/auditService');

/**
 * @desc    Get admin dashboard stats
 * @route   GET /api/v1/admin/dashboard
 * @access  Admin
 */
const getDashboard = asyncHandler(async (req, res) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers, activeUsers, bannedUsers,
    newUsersThisMonth, newUsersThisWeek,
    totalRooms, liveRooms,
    totalMatches, liveMatches, completedMatches,
    totalScoreEvents,
    totalFriendships,
    activeSubscriptions, enterpriseCount, activeAds,
    subscriptionDistribution
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true, isBanned: false }),
    User.countDocuments({ isBanned: true }),
    User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
    Room.countDocuments(),
    Room.countDocuments({ status: 'live' }),
    Match.countDocuments(),
    Match.countDocuments({ status: 'in_progress' }),
    Match.countDocuments({ status: 'completed' }),
    ScoreEvent.countDocuments({ isUndone: false }),
    Friendship.countDocuments({ status: 'accepted' }),
    Subscription.countDocuments({ status: 'active', planSlug: { $ne: 'free' } }),
    Enterprise.countDocuments({ isActive: true }),
    Ad.countDocuments({ status: 'active' }),
    User.aggregate([
      { $group: { _id: '$subscriptionPlan', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ])
  ]);

  // Match format distribution
  const formatDistribution = await Match.aggregate([
    { $group: { _id: '$format', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  // Recent signups trend (last 7 days)
  const signupTrend = await User.aggregate([
    { $match: { createdAt: { $gte: sevenDaysAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Recent matches trend (last 7 days)
  const matchTrend = await Match.aggregate([
    { $match: { createdAt: { $gte: sevenDaysAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  ApiResponse.success(res, {
    overview: {
      totalUsers, activeUsers, bannedUsers,
      newUsersThisMonth, newUsersThisWeek,
      totalRooms, liveRooms,
      totalMatches, liveMatches, completedMatches,
      totalScoreEvents, totalFriendships,
      activeSubscriptions, enterpriseCount, activeAds
    },
    subscriptionDistribution,
    formatDistribution,
    signupTrend,
    matchTrend
  });
});

/**
 * @desc    List all users with filtering & pagination
 * @route   GET /api/v1/admin/users
 * @access  Admin
 */
const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { search, role, isActive, isBanned, sortBy, sortOrder } = req.query;

  const filter = {};
  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [{ username: regex }, { email: regex }, { fullName: regex }];
  }
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (isBanned !== undefined) filter.isBanned = isBanned === 'true';

  const sort = {};
  sort[sortBy || 'createdAt'] = sortOrder === 'asc' ? 1 : -1;

  const [users, totalDocs] = await Promise.all([
    User.find(filter)
      .select('-refreshToken')
      .sort(sort)
      .skip(skip).limit(limit).lean(),
    User.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, users, buildPaginationResponse(page, limit, totalDocs));
});

/**
 * @desc    Get single user details (admin view)
 * @route   GET /api/v1/admin/users/:id
 * @access  Admin
 */
const getUserDetails = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('-refreshToken').lean();
  if (!user) return next(ApiError.notFound('User not found'));

  // Get user's match count and recent activity
  const [matchCount, roomCount, friendCount, recentMatches] = await Promise.all([
    Match.countDocuments({
      $or: [
        { 'teamA.players.user': user._id },
        { 'teamB.players.user': user._id },
        { createdBy: user._id }
      ]
    }),
    Room.countDocuments({ $or: [{ creator: user._id }, { 'members.user': user._id }] }),
    Friendship.countDocuments({
      $or: [{ requester: user._id }, { recipient: user._id }],
      status: 'accepted'
    }),
    Match.find({
      $or: [{ 'teamA.players.user': user._id }, { 'teamB.players.user': user._id }]
    }).select('teamA.name teamB.name status matchDate format result').sort({ matchDate: -1 }).limit(5).lean()
  ]);

  ApiResponse.success(res, {
    user,
    activity: { matchCount, roomCount, friendCount },
    recentMatches
  });
});

/**
 * @desc    Update user (ban/unban, activate/deactivate, change role)
 * @route   PUT /api/v1/admin/users/:id
 * @access  Admin
 */
const updateUser = asyncHandler(async (req, res, next) => {
  const { isActive, isBanned, role } = req.body;
  const targetUser = await User.findById(req.params.id);

  if (!targetUser) return next(ApiError.notFound('User not found'));

  // Prevent modifying super admins
  if (targetUser.role === 'super_admin' && req.user.role !== 'super_admin') {
    return next(ApiError.forbidden('Cannot modify a super admin'));
  }

  // Prevent self-demotion
  if (targetUser._id.toString() === req.user._id.toString() && role && role !== req.user.role) {
    return next(ApiError.badRequest('You cannot change your own role'));
  }

  if (isActive !== undefined) targetUser.isActive = isActive;
  if (isBanned !== undefined) {
    targetUser.isBanned = isBanned;
    if (isBanned) {
      targetUser.refreshToken = null; // Force re-login
      logger.info(`Admin ${req.user.email} banned user ${targetUser.email}`);
    } else {
      logger.info(`Admin ${req.user.email} unbanned user ${targetUser.email}`);
    }
  }
  if (role) targetUser.role = role;

  await targetUser.save();

  // Audit log
  let action = 'other';
  if (isBanned === true) action = 'user_banned';
  else if (isBanned === false) action = 'user_unbanned';
  else if (role) action = 'user_role_changed';
  else if (isActive === true) action = 'user_activated';
  else if (isActive === false) action = 'user_deactivated';

  await logAction(req, {
    action, category: 'users',
    targetType: 'user', targetId: targetUser._id, targetLabel: targetUser.username,
    description: `User ${targetUser.email} updated: ${action.replace('user_', '').replace('_', ' ')}`,
    severity: isBanned ? 'critical' : 'info'
  });

  ApiResponse.success(res, {
    user: {
      id: targetUser._id,
      username: targetUser.username,
      email: targetUser.email,
      role: targetUser.role,
      isActive: targetUser.isActive,
      isBanned: targetUser.isBanned
    }
  }, 'User updated successfully');
});

/**
 * @desc    Delete user (soft delete)
 * @route   DELETE /api/v1/admin/users/:id
 * @access  Admin
 */
const deleteUser = asyncHandler(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) return next(ApiError.notFound('User not found'));

  if (targetUser.role === 'super_admin') {
    return next(ApiError.forbidden('Cannot delete a super admin'));
  }

  targetUser.isActive = false;
  targetUser.isBanned = true;
  targetUser.refreshToken = null;
  targetUser.email = `deleted_${targetUser._id}@deleted.com`;
  targetUser.username = `deleted_${targetUser._id}`;
  await targetUser.save();

  logger.info(`Admin ${req.user.email} soft-deleted user ${req.params.id}`);

  await logAction(req, {
    action: 'user_deleted', category: 'users',
    targetType: 'user', targetId: targetUser._id, targetLabel: `deleted_${targetUser._id}`,
    description: `User soft-deleted by admin`,
    severity: 'critical'
  });

  ApiResponse.success(res, null, 'User deleted successfully');
});

/**
 * @desc    List all matches with filtering
 * @route   GET /api/v1/admin/matches
 * @access  Admin
 */
const listMatches = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { status, format, sortBy, sortOrder } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (format) filter.format = format;

  const sort = {};
  sort[sortBy || 'createdAt'] = sortOrder === 'asc' ? 1 : -1;

  const [matches, totalDocs] = await Promise.all([
    Match.find(filter)
      .populate('room', 'roomCode name')
      .populate('createdBy', 'username fullName')
      .select('teamA.name teamB.name format totalOvers status result matchDate createdAt')
      .sort(sort)
      .skip(skip).limit(limit).lean(),
    Match.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, matches, buildPaginationResponse(page, limit, totalDocs));
});

/**
 * @desc    List all rooms with filtering
 * @route   GET /api/v1/admin/rooms
 * @access  Admin
 */
const listRooms = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = {};

  if (req.query.status) filter.status = req.query.status;

  const [rooms, totalDocs] = await Promise.all([
    Room.find(filter)
      .populate('creator', 'username fullName')
      .populate('members.user', 'username fullName')
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit).lean(),
    Room.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, rooms, buildPaginationResponse(page, limit, totalDocs));
});

/**
 * @desc    Force cancel/abandon a match
 * @route   POST /api/v1/admin/matches/:id/abandon
 * @access  Admin
 */
const abandonMatch = asyncHandler(async (req, res, next) => {
  const match = await Match.findById(req.params.id);
  if (!match) return next(ApiError.notFound('Match not found'));

  if (match.status === 'completed' || match.status === 'abandoned') {
    return next(ApiError.badRequest(`Match is already ${match.status}`));
  }

  match.status = 'abandoned';
  match.completedAt = new Date();
  match.result = { winner: 'no_result', summary: 'Match abandoned by admin' };

  const room = await Room.findById(match.room);
  if (room) {
    room.status = 'completed';
    await room.save();
  }

  await match.save();
  logger.info(`Admin ${req.user.email} abandoned match ${match._id}`);

  await logAction(req, {
    action: 'match_abandoned', category: 'matches',
    targetType: 'match', targetId: match._id,
    description: `Match abandoned by admin`,
    severity: 'warning'
  });

  ApiResponse.success(res, { match }, 'Match abandoned');
});

/**
 * @desc    Get system health/stats
 * @route   GET /api/v1/admin/system
 * @access  Admin
 */
const getSystemStats = asyncHandler(async (req, res) => {
  const dbStats = await require('mongoose').connection.db.stats();

  ApiResponse.success(res, {
    database: {
      name: dbStats.db,
      collections: dbStats.collections,
      dataSize: `${(dbStats.dataSize / 1024 / 1024).toFixed(2)} MB`,
      indexSize: `${(dbStats.indexSize / 1024 / 1024).toFixed(2)} MB`,
      storageSize: `${(dbStats.storageSize / 1024 / 1024).toFixed(2)} MB`
    },
    server: {
      nodeVersion: process.version,
      uptime: `${(process.uptime() / 3600).toFixed(2)} hours`,
      memoryUsage: {
        rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`
      },
      environment: process.env.NODE_ENV
    }
  });
});

/**
 * @desc    Ban a user
 * @route   POST /api/v1/admin/users/:id/ban
 * @access  Admin
 */
const banUser = asyncHandler(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) return next(ApiError.notFound('User not found'));
  if (targetUser.role === 'super_admin' && req.user.role !== 'super_admin') {
    return next(ApiError.forbidden('Cannot modify a super admin'));
  }
  targetUser.isBanned = true;
  targetUser.refreshToken = null;
  await targetUser.save();
  await logAction(req, {
    action: 'user_banned', category: 'users',
    targetType: 'user', targetId: targetUser._id, targetLabel: targetUser.username,
    description: `User ${targetUser.email} banned by admin`,
    severity: 'critical'
  });
  ApiResponse.success(res, null, 'User banned');
});

/**
 * @desc    Unban a user
 * @route   POST /api/v1/admin/users/:id/unban
 * @access  Admin
 */
const unbanUser = asyncHandler(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) return next(ApiError.notFound('User not found'));
  targetUser.isBanned = false;
  await targetUser.save();
  await logAction(req, {
    action: 'user_unbanned', category: 'users',
    targetType: 'user', targetId: targetUser._id, targetLabel: targetUser.username,
    description: `User ${targetUser.email} unbanned by admin`,
    severity: 'info'
  });
  ApiResponse.success(res, null, 'User unbanned');
});

/**
 * @desc    Activate a user account
 * @route   POST /api/v1/admin/users/:id/activate
 * @access  Admin
 */
const activateUser = asyncHandler(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) return next(ApiError.notFound('User not found'));
  targetUser.isActive = true;
  await targetUser.save();
  ApiResponse.success(res, null, 'User activated');
});

/**
 * @desc    Deactivate a user account
 * @route   POST /api/v1/admin/users/:id/deactivate
 * @access  Admin
 */
const deactivateUser = asyncHandler(async (req, res, next) => {
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) return next(ApiError.notFound('User not found'));
  targetUser.isActive = false;
  await targetUser.save();
  ApiResponse.success(res, null, 'User deactivated');
});

module.exports = {
  getDashboard, listUsers, getUserDetails, updateUser, deleteUser,
  listMatches, listRooms, abandonMatch, getSystemStats,
  banUser, unbanUser, activateUser, deactivateUser
};
