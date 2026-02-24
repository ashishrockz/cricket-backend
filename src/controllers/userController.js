const User = require('../models/User');
const Match = require('../models/Match');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, buildPaginationResponse } = require('../utils/pagination');

/**
 * @desc    Get user profile by ID
 * @route   GET /api/v1/users/:id
 * @access  Private
 */
const getUserById = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('-refreshToken');
  if (!user) {
    return next(ApiError.notFound('User not found'));
  }
  ApiResponse.success(res, { user });
});

/**
 * @desc    Update current user profile
 * @route   PUT /api/v1/users/profile
 * @access  Private
 */
const updateProfile = asyncHandler(async (req, res) => {
  const allowedFields = ['fullName', 'phone', 'playingRole', 'battingStyle', 'bowlingStyle', 'city', 'bio'];
  const updates = {};

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true
  });

  ApiResponse.success(res, { user }, 'Profile updated successfully');
});

/**
 * @desc    Search users by username or full name
 * @route   GET /api/v1/users/search
 * @access  Private
 */
const searchUsers = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const { page, limit, skip } = paginate(req.query);

  const searchRegex = new RegExp(q, 'i');
  const filter = {
    _id: { $ne: req.user._id },
    isActive: true,
    isBanned: false,
    $or: [
      { username: searchRegex },
      { fullName: searchRegex }
    ]
  };

  const [users, totalDocs] = await Promise.all([
    User.find(filter)
      .select('username fullName avatar playingRole city stats.matchesPlayed')
      .skip(skip).limit(limit).lean(),
    User.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, users, buildPaginationResponse(page, limit, totalDocs), 'Users found');
});

/**
 * @desc    Get current user's match history
 * @route   GET /api/v1/users/match-history
 * @access  Private
 */
const getMatchHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const userId = req.user._id;

  const filter = {
    $or: [
      { 'teamA.players.user': userId },
      { 'teamB.players.user': userId },
      { createdBy: userId }
    ],
    status: { $in: ['completed', 'abandoned'] }
  };

  const [matches, totalDocs] = await Promise.all([
    Match.find(filter)
      .select('teamA.name teamB.name format totalOvers status result matchDate venue')
      .sort({ matchDate: -1 })
      .skip(skip).limit(limit).lean(),
    Match.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, matches, buildPaginationResponse(page, limit, totalDocs));
});

/**
 * @desc    Get user's detailed career stats
 * @route   GET /api/v1/users/:id/stats
 * @access  Private
 */
const getUserStats = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('username fullName stats avatar playingRole');
  if (!user) {
    return next(ApiError.notFound('User not found'));
  }

  const battingAverage = user.stats.matchesPlayed > 0
    ? (user.stats.totalRuns / user.stats.matchesPlayed).toFixed(2)
    : '0.00';

  const strikeRate = user.stats.totalBallsFaced > 0
    ? ((user.stats.totalRuns / user.stats.totalBallsFaced) * 100).toFixed(2)
    : '0.00';

  const bowlingAverage = user.stats.totalWickets > 0
    ? (user.stats.totalRunsConceded / user.stats.totalWickets).toFixed(2)
    : '0.00';

  const economyRate = user.stats.totalBallsBowled > 0
    ? ((user.stats.totalRunsConceded / (user.stats.totalBallsBowled / 6))).toFixed(2)
    : '0.00';

  ApiResponse.success(res, {
    user: {
      id: user._id,
      username: user.username,
      fullName: user.fullName,
      avatar: user.avatar,
      playingRole: user.playingRole
    },
    batting: {
      matches: user.stats.matchesPlayed,
      runs: user.stats.totalRuns,
      highestScore: user.stats.highestScore,
      average: parseFloat(battingAverage),
      strikeRate: parseFloat(strikeRate),
      fifties: user.stats.fifties,
      hundreds: user.stats.hundreds,
      ballsFaced: user.stats.totalBallsFaced
    },
    bowling: {
      wickets: user.stats.totalWickets,
      bestBowling: user.stats.bestBowling,
      average: parseFloat(bowlingAverage),
      economyRate: parseFloat(economyRate),
      ballsBowled: user.stats.totalBallsBowled,
      runsConceded: user.stats.totalRunsConceded
    },
    fielding: {
      catches: user.stats.totalCatches
    }
  });
});

module.exports = { getUserById, updateProfile, searchUsers, getMatchHistory, getUserStats };
