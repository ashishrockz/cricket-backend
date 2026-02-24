const Ad = require('../models/Ad');
const User = require('../models/User');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, buildPaginationResponse } = require('../utils/pagination');
const { logAction } = require('../services/auditService');
const logger = require('../config/logger');

// Plans that see ads (enterprise and pro users are ad-free)
const AD_ELIGIBLE_PLANS = ['free', 'basic'];

// ─────────────────────────────────────────────────────────────────────────────
// USER / MOBILE ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Get ads for a specific placement (mobile app consumption)
 * @route   GET /api/v1/ads/placement/:placement
 * @access  Private (optional auth — unauthed gets all ads for placement)
 */
const getAdsForPlacement = asyncHandler(async (req, res) => {
  const { placement } = req.params;
  const now = new Date();

  // If user is on a premium plan, return empty (no ads)
  if (req.user) {
    const plan = req.user.subscriptionPlan || 'free';
    if (!AD_ELIGIBLE_PLANS.includes(plan)) {
      return ApiResponse.success(res, { ads: [], message: 'Ad-free experience' });
    }
  }

  const filter = {
    status: 'active',
    placement,
    'schedule.startDate': { $lte: now },
    'schedule.endDate': { $gte: now }
  };

  // Target by plan
  if (req.user) {
    const plan = req.user.subscriptionPlan || 'free';
    filter['targeting.planTypes'] = { $in: [plan, undefined] };
  }

  const currentDay = now.getDay(); // 0=Sun...6=Sat
  const currentHour = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  let ads = await Ad.find(filter)
    .select('-recentImpressions -rejectionReason -budget -createdBy -reviewedBy')
    .sort({ priority: -1, 'stats.ctr': -1 })
    .limit(5)
    .lean();

  // Filter by day of week and time (in-memory, usually small set)
  ads = ads.filter(ad => {
    if (ad.schedule.daysOfWeek && ad.schedule.daysOfWeek.length > 0) {
      if (!ad.schedule.daysOfWeek.includes(currentDay)) return false;
    }
    if (ad.schedule.startTime && currentHour < ad.schedule.startTime) return false;
    if (ad.schedule.endTime && currentHour > ad.schedule.endTime) return false;
    return true;
  });

  // Record impression (non-blocking)
  if (ads.length > 0) {
    const adIds = ads.map(a => a._id);
    Ad.updateMany({ _id: { $in: adIds } }, {
      $inc: { 'stats.impressions': 1 }
    }).catch(err => logger.error(`Ad impression update failed: ${err.message}`));
  }

  ApiResponse.success(res, { ads });
});

/**
 * @desc    Record an ad click
 * @route   POST /api/v1/ads/:id/click
 * @access  Private (optional auth)
 */
const recordClick = asyncHandler(async (req, res, next) => {
  const ad = await Ad.findById(req.params.id);
  if (!ad || ad.status !== 'active') return next(ApiError.notFound('Ad not found'));

  ad.stats.clicks += 1;
  ad.updateCTR();
  await ad.save();

  ApiResponse.success(res, { targetUrl: ad.targetUrl }, 'Click recorded');
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    List all ads (admin)
 * @route   GET /api/v1/admin/ads
 * @access  Admin
 */
const listAds = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { status, placement, type } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (placement) filter.placement = placement;
  if (type) filter.type = type;

  const [ads, total] = await Promise.all([
    Ad.find(filter)
      .populate('createdBy', 'username email')
      .populate('reviewedBy', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit).lean(),
    Ad.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, ads, buildPaginationResponse(page, limit, total));
});

/**
 * @desc    Get single ad details (admin)
 * @route   GET /api/v1/admin/ads/:id
 * @access  Admin
 */
const getAd = asyncHandler(async (req, res, next) => {
  const ad = await Ad.findById(req.params.id)
    .populate('createdBy', 'username email fullName')
    .populate('reviewedBy', 'username email');

  if (!ad) return next(ApiError.notFound('Ad not found'));

  ApiResponse.success(res, { ad });
});

/**
 * @desc    Create a new ad
 * @route   POST /api/v1/admin/ads
 * @access  Admin
 */
const createAd = asyncHandler(async (req, res, next) => {
  const adData = { ...req.body, createdBy: req.user._id };

  if (!adData.targeting?.planTypes || adData.targeting.planTypes.length === 0) {
    adData.targeting = { ...(adData.targeting || {}), planTypes: ['free', 'basic'] };
  }

  const ad = await Ad.create(adData);

  await logAction(req, {
    action: 'ad_created', category: 'system',
    targetType: 'ad', targetId: ad._id, targetLabel: ad.title,
    description: `Ad "${ad.title}" created for placement: ${ad.placement}`,
    severity: 'info'
  });

  ApiResponse.created(res, { ad }, 'Ad created successfully');
});

/**
 * @desc    Update ad details
 * @route   PUT /api/v1/admin/ads/:id
 * @access  Admin
 */
const updateAd = asyncHandler(async (req, res, next) => {
  const ad = await Ad.findById(req.params.id);
  if (!ad) return next(ApiError.notFound('Ad not found'));

  if (ad.status === 'active' && req.body.status === 'active') {
    // Cannot update an active ad without pausing it first — only allow status changes
    const allowedOnActive = ['status', 'priority'];
    const keys = Object.keys(req.body);
    const hasDisallowedFields = keys.some(k => !allowedOnActive.includes(k));
    if (hasDisallowedFields) {
      return next(ApiError.badRequest('Pause the ad before editing content. Only priority and status can be changed on active ads.'));
    }
  }

  Object.assign(ad, req.body);
  await ad.save();

  await logAction(req, {
    action: 'ad_updated', category: 'system',
    targetType: 'ad', targetId: ad._id, targetLabel: ad.title,
    description: `Ad "${ad.title}" updated`,
    severity: 'info'
  });

  ApiResponse.success(res, { ad }, 'Ad updated');
});

/**
 * @desc    Review and approve/reject an ad
 * @route   PUT /api/v1/admin/ads/:id/review
 * @access  Admin
 */
const reviewAd = asyncHandler(async (req, res, next) => {
  const ad = await Ad.findById(req.params.id);
  if (!ad) return next(ApiError.notFound('Ad not found'));

  const { approve, reason } = req.body;

  ad.status = approve ? 'active' : 'rejected';
  ad.rejectionReason = approve ? null : (reason || 'Rejected by admin');
  ad.reviewedBy = req.user._id;
  ad.reviewedAt = new Date();
  await ad.save();

  await logAction(req, {
    action: approve ? 'ad_approved' : 'ad_rejected',
    category: 'system',
    targetType: 'ad', targetId: ad._id, targetLabel: ad.title,
    description: `Ad "${ad.title}" ${approve ? 'approved' : 'rejected'}. ${reason ? `Reason: ${reason}` : ''}`,
    severity: approve ? 'info' : 'warning'
  });

  ApiResponse.success(res, { ad }, `Ad ${approve ? 'approved and activated' : 'rejected'}`);
});

/**
 * @desc    Delete an ad
 * @route   DELETE /api/v1/admin/ads/:id
 * @access  Admin
 */
const deleteAd = asyncHandler(async (req, res, next) => {
  const ad = await Ad.findById(req.params.id);
  if (!ad) return next(ApiError.notFound('Ad not found'));

  if (ad.status === 'active') {
    return next(ApiError.badRequest('Cannot delete an active ad. Pause it first.'));
  }

  await ad.deleteOne();

  await logAction(req, {
    action: 'ad_deleted', category: 'system',
    targetType: 'ad', targetId: ad._id, targetLabel: ad.title,
    description: `Ad "${ad.title}" deleted`,
    severity: 'warning'
  });

  ApiResponse.success(res, null, 'Ad deleted');
});

/**
 * @desc    Get ad performance analytics
 * @route   GET /api/v1/admin/ads/analytics
 * @access  Admin
 */
const getAdAnalytics = asyncHandler(async (req, res) => {
  const now = new Date();

  const [
    totalActive, totalPending, totalDraft, totalRejected,
    placementStats, typeStats, topPerformers
  ] = await Promise.all([
    Ad.countDocuments({ status: 'active' }),
    Ad.countDocuments({ status: 'pending_review' }),
    Ad.countDocuments({ status: 'draft' }),
    Ad.countDocuments({ status: 'rejected' }),
    Ad.aggregate([
      { $group: {
        _id: '$placement',
        count: { $sum: 1 },
        totalImpressions: { $sum: '$stats.impressions' },
        totalClicks: { $sum: '$stats.clicks' }
      }},
      { $sort: { totalImpressions: -1 } }
    ]),
    Ad.aggregate([
      { $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalImpressions: { $sum: '$stats.impressions' }
      }},
      { $sort: { totalImpressions: -1 } }
    ]),
    Ad.find({ status: 'active' })
      .select('title placement stats type')
      .sort({ 'stats.impressions': -1 })
      .limit(10)
      .lean()
  ]);

  const totalImpressions = await Ad.aggregate([
    { $group: { _id: null, total: { $sum: '$stats.impressions' } } }
  ]);
  const totalClicks = await Ad.aggregate([
    { $group: { _id: null, total: { $sum: '$stats.clicks' } } }
  ]);

  ApiResponse.success(res, {
    counts: { totalActive, totalPending, totalDraft, totalRejected },
    totals: {
      impressions: totalImpressions[0]?.total || 0,
      clicks: totalClicks[0]?.total || 0,
      ctr: totalImpressions[0]?.total > 0
        ? parseFloat(((totalClicks[0]?.total / totalImpressions[0]?.total) * 100).toFixed(2))
        : 0
    },
    placementStats,
    typeStats,
    topPerformers
  });
});

module.exports = {
  getAdsForPlacement, recordClick,
  listAds, getAd, createAd, updateAd, reviewAd, deleteAd, getAdAnalytics
};
