const User = require('../models/User');
const Match = require('../models/Match');
const { ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { MATCH_STATUS } = require('../config/constants');

// Helper: parse period query param into a Date cutoff
function getPeriodDate(period) {
  const now = new Date();
  const map = {
    '7d':  new Date(now - 7  * 24 * 60 * 60 * 1000),
    '30d': new Date(now - 30 * 24 * 60 * 60 * 1000),
    '90d': new Date(now - 90 * 24 * 60 * 60 * 1000),
    '6m':  new Date(now - 180 * 24 * 60 * 60 * 1000),
    '1y':  new Date(now - 365 * 24 * 60 * 60 * 1000),
  };
  return map[period] || null; // null → all_time
}

/**
 * @desc    Batting leaderboard
 * @route   GET /api/v1/admin/analytics/leaderboard/batting
 * @access  Private (Admin)
 */
const getBattingLeaderboard = asyncHandler(async (req, res) => {
  const { period = 'all_time', limit = 25 } = req.query;
  const maxLimit = Math.min(parseInt(limit, 10) || 25, 100);
  const since = getPeriodDate(period);

  // For all_time we use denormalised stats on User; for a time-bounded period
  // we aggregate from completed Match innings.
  if (!since) {
    const users = await User.find({ isActive: true, isBanned: false })
      .select('username fullName avatar stats city')
      .sort({ 'stats.totalRuns': -1 })
      .limit(maxLimit)
      .lean();

    const leaderboard = users.map((u, i) => ({
      rank: i + 1,
      userId: u._id,
      username: u.username,
      fullName: u.fullName,
      avatar: u.avatar,
      city: u.city,
      matchesPlayed: u.stats.matchesPlayed,
      runs: u.stats.totalRuns,
      highestScore: u.stats.highestScore,
      fifties: u.stats.fifties,
      hundreds: u.stats.hundreds,
      ballsFaced: u.stats.totalBallsFaced,
      strikeRate: u.stats.totalBallsFaced > 0
        ? ((u.stats.totalRuns / u.stats.totalBallsFaced) * 100).toFixed(2)
        : '0.00',
    }));

    return ApiResponse.success(res, { period, leaderboard }, 'Batting leaderboard fetched');
  }

  // Time-bounded: aggregate from Match documents
  const pipeline = [
    { $match: { status: MATCH_STATUS.COMPLETED, completedAt: { $gte: since } } },
    { $unwind: '$innings' },
    { $unwind: '$innings.battingStats' },
    { $match: { 'innings.battingStats.player': { $ne: null } } },
    {
      $group: {
        _id: '$innings.battingStats.player',
        playerName: { $first: '$innings.battingStats.playerName' },
        runs: { $sum: '$innings.battingStats.runs' },
        ballsFaced: { $sum: '$innings.battingStats.ballsFaced' },
        fours: { $sum: '$innings.battingStats.fours' },
        sixes: { $sum: '$innings.battingStats.sixes' },
        innings: { $sum: 1 },
      },
    },
    { $sort: { runs: -1 } },
    { $limit: maxLimit },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmpty: true } },
    {
      $project: {
        userId: '$_id',
        username: { $ifNull: ['$user.username', 'Guest'] },
        fullName: { $ifNull: ['$user.fullName', '$playerName'] },
        avatar: '$user.avatar',
        city: '$user.city',
        innings: 1,
        runs: 1,
        ballsFaced: 1,
        fours: 1,
        sixes: 1,
        strikeRate: {
          $cond: [
            { $gt: ['$ballsFaced', 0] },
            { $multiply: [{ $divide: ['$runs', '$ballsFaced'] }, 100] },
            0,
          ],
        },
      },
    },
  ];

  const rows = await Match.aggregate(pipeline);
  const leaderboard = rows.map((r, i) => ({ rank: i + 1, ...r }));

  ApiResponse.success(res, { period, leaderboard }, 'Batting leaderboard fetched');
});

/**
 * @desc    Bowling leaderboard
 * @route   GET /api/v1/admin/analytics/leaderboard/bowling
 * @access  Private (Admin)
 */
const getBowlingLeaderboard = asyncHandler(async (req, res) => {
  const { period = 'all_time', limit = 25 } = req.query;
  const maxLimit = Math.min(parseInt(limit, 10) || 25, 100);
  const since = getPeriodDate(period);

  if (!since) {
    const users = await User.find({ isActive: true, isBanned: false, 'stats.totalWickets': { $gt: 0 } })
      .select('username fullName avatar stats city')
      .sort({ 'stats.totalWickets': -1 })
      .limit(maxLimit)
      .lean();

    const leaderboard = users.map((u, i) => ({
      rank: i + 1,
      userId: u._id,
      username: u.username,
      fullName: u.fullName,
      avatar: u.avatar,
      city: u.city,
      wickets: u.stats.totalWickets,
      runsConceded: u.stats.totalRunsConceded,
      ballsBowled: u.stats.totalBallsBowled,
      economy: u.stats.totalBallsBowled > 0
        ? (u.stats.totalRunsConceded / (u.stats.totalBallsBowled / 6)).toFixed(2)
        : '0.00',
      bestBowling: u.stats.bestBowling,
    }));

    return ApiResponse.success(res, { period, leaderboard }, 'Bowling leaderboard fetched');
  }

  const pipeline = [
    { $match: { status: MATCH_STATUS.COMPLETED, completedAt: { $gte: since } } },
    { $unwind: '$innings' },
    { $unwind: '$innings.bowlingStats' },
    { $match: { 'innings.bowlingStats.player': { $ne: null } } },
    {
      $group: {
        _id: '$innings.bowlingStats.player',
        playerName: { $first: '$innings.bowlingStats.playerName' },
        wickets: { $sum: '$innings.bowlingStats.wickets' },
        runsConceded: { $sum: '$innings.bowlingStats.runsConceded' },
        overs: { $sum: '$innings.bowlingStats.overs' },
        balls: { $sum: '$innings.bowlingStats.balls' },
        maidens: { $sum: '$innings.bowlingStats.maidens' },
        wides: { $sum: '$innings.bowlingStats.wides' },
        noBalls: { $sum: '$innings.bowlingStats.noBalls' },
        dotBalls: { $sum: '$innings.bowlingStats.dotBalls' },
        innings: { $sum: 1 },
      },
    },
    { $sort: { wickets: -1, runsConceded: 1 } },
    { $limit: maxLimit },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmpty: true } },
    {
      $project: {
        userId: '$_id',
        username: { $ifNull: ['$user.username', 'Guest'] },
        fullName: { $ifNull: ['$user.fullName', '$playerName'] },
        avatar: '$user.avatar',
        city: '$user.city',
        innings: 1,
        wickets: 1,
        runsConceded: 1,
        overs: 1,
        balls: 1,
        maidens: 1,
        wides: 1,
        noBalls: 1,
        dotBalls: 1,
        economy: {
          $cond: [
            { $gt: [{ $add: ['$overs', { $divide: ['$balls', 6] }] }, 0] },
            { $divide: ['$runsConceded', { $add: ['$overs', { $divide: ['$balls', 6] }] }] },
            0,
          ],
        },
      },
    },
  ];

  const rows = await Match.aggregate(pipeline);
  const leaderboard = rows.map((r, i) => ({ rank: i + 1, ...r }));

  ApiResponse.success(res, { period, leaderboard }, 'Bowling leaderboard fetched');
});

/**
 * @desc    Match analytics
 * @route   GET /api/v1/admin/analytics/matches
 * @access  Private (Admin)
 */
const getMatchAnalytics = asyncHandler(async (req, res) => {
  const { period = 'all_time' } = req.query;
  const since = getPeriodDate(period);

  const matchFilter = { status: MATCH_STATUS.COMPLETED };
  if (since) matchFilter.completedAt = { $gte: since };

  // Total counts
  const [total, inProgress, notStarted] = await Promise.all([
    Match.countDocuments(matchFilter),
    Match.countDocuments({ status: MATCH_STATUS.IN_PROGRESS }),
    Match.countDocuments({ status: MATCH_STATUS.NOT_STARTED }),
  ]);

  // Format distribution
  const formatDist = await Match.aggregate([
    { $match: matchFilter },
    { $group: { _id: '$format', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // Average scores per innings
  const avgScores = await Match.aggregate([
    { $match: matchFilter },
    { $unwind: '$innings' },
    { $match: { 'innings.isCompleted': true } },
    {
      $group: {
        _id: null,
        avgRuns: { $avg: '$innings.totalRuns' },
        avgWickets: { $avg: '$innings.totalWickets' },
        avgOvers: { $avg: '$innings.totalOvers' },
        highestScore: { $max: '$innings.totalRuns' },
        lowestScore: { $min: '$innings.totalRuns' },
      },
    },
  ]);

  // Dismissal type distribution
  const dismissals = await Match.aggregate([
    { $match: matchFilter },
    { $unwind: '$innings' },
    { $unwind: '$innings.battingStats' },
    { $match: { 'innings.battingStats.isOut': true, 'innings.battingStats.dismissalType': { $ne: null } } },
    {
      $group: {
        _id: '$innings.battingStats.dismissalType',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  // Top venues
  const venues = await Match.aggregate([
    { $match: { ...matchFilter, venue: { $ne: null, $ne: '' } } },
    { $group: { _id: '$venue', matches: { $sum: 1 } } },
    { $sort: { matches: -1 } },
    { $limit: 10 },
  ]);

  // Win type distribution (runs vs wickets)
  const winTypes = await Match.aggregate([
    { $match: { ...matchFilter, 'result.winType': { $ne: null } } },
    { $group: { _id: '$result.winType', count: { $sum: 1 } } },
  ]);

  // Result distribution (team_a, team_b, draw, tie, no_result)
  const results = await Match.aggregate([
    { $match: { ...matchFilter, 'result.winner': { $ne: null } } },
    { $group: { _id: '$result.winner', count: { $sum: 1 } } },
  ]);

  ApiResponse.success(res, {
    period,
    summary: {
      total,
      inProgress,
      notStarted,
    },
    formatDistribution: formatDist.map(f => ({ format: f._id, count: f.count })),
    averageScores: avgScores[0] || {
      avgRuns: 0, avgWickets: 0, avgOvers: 0, highestScore: 0, lowestScore: 0,
    },
    dismissalTypes: dismissals.map(d => ({ type: d._id, count: d.count })),
    topVenues: venues.map(v => ({ venue: v._id, matches: v.matches })),
    winTypes: winTypes.map(w => ({ type: w._id, count: w.count })),
    resultDistribution: results.map(r => ({ winner: r._id, count: r.count })),
  }, 'Match analytics fetched');
});

/**
 * @desc    Platform analytics
 * @route   GET /api/v1/admin/analytics/platform
 * @access  Private (Admin)
 */
const getPlatformAnalytics = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek  = new Date(now - 7  * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [totalUsers, activeUsers, bannedUsers, dau, wau, mau] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isActive: true, isBanned: false }),
    User.countDocuments({ isBanned: true }),
    User.countDocuments({ lastLogin: { $gte: startOfDay } }),
    User.countDocuments({ lastLogin: { $gte: startOfWeek } }),
    User.countDocuments({ lastLogin: { $gte: startOfMonth } }),
  ]);

  // New signups over time (last 30 days, grouped by day)
  const signupTrend = await User.aggregate([
    { $match: { createdAt: { $gte: startOfMonth } } },
    {
      $group: {
        _id: {
          year:  { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day:   { $dayOfMonth: '$createdAt' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
  ]);

  // Playing-role demographics
  const roleDemographics = await User.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$playingRole', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // City distribution (top 10)
  const cityDistribution = await User.aggregate([
    { $match: { isActive: true, city: { $ne: null, $ne: '' } } },
    { $group: { _id: '$city', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  // Batting style distribution
  const battingStyleDist = await User.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$battingStyle', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // Bowling style distribution
  const bowlingStyleDist = await User.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$bowlingStyle', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // Match activity in last 30 days
  const matchActivity = await Match.aggregate([
    { $match: { createdAt: { $gte: startOfMonth } } },
    {
      $group: {
        _id: {
          year:  { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day:   { $dayOfMonth: '$createdAt' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
  ]);

  ApiResponse.success(res, {
    users: {
      total: totalUsers,
      active: activeUsers,
      banned: bannedUsers,
      dau,
      wau,
      mau,
    },
    signupTrend: signupTrend.map(s => ({
      date: `${s._id.year}-${String(s._id.month).padStart(2, '0')}-${String(s._id.day).padStart(2, '0')}`,
      count: s.count,
    })),
    demographics: {
      playingRoles: roleDemographics.map(r => ({ role: r._id, count: r.count })),
      battingStyles: battingStyleDist.map(b => ({ style: b._id, count: b.count })),
      bowlingStyles: bowlingStyleDist.map(b => ({ style: b._id, count: b.count })),
      cities: cityDistribution.map(c => ({ city: c._id, count: c.count })),
    },
    matchActivity: matchActivity.map(m => ({
      date: `${m._id.year}-${String(m._id.month).padStart(2, '0')}-${String(m._id.day).padStart(2, '0')}`,
      count: m.count,
    })),
  }, 'Platform analytics fetched');
});

module.exports = { getBattingLeaderboard, getBowlingLeaderboard, getMatchAnalytics, getPlatformAnalytics };
