const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, buildPaginationResponse } = require('../utils/pagination');
const { assignPlan, getUserSubscription, expireOverdueSubscriptions } = require('../services/subscriptionService');
const { logAction } = require('../services/auditService');
const logger = require('../config/logger');

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC / USER ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Get all active subscription plans
 * @route   GET /api/v1/subscriptions/plans
 * @access  Public
 */
const getPlans = asyncHandler(async (req, res) => {
  const plans = await SubscriptionPlan.find({ isActive: true })
    .sort({ displayOrder: 1 })
    .lean();

  ApiResponse.success(res, { plans });
});

/**
 * @desc    Get current user's active subscription
 * @route   GET /api/v1/subscriptions/my
 * @access  Private
 */
const getMySubscription = asyncHandler(async (req, res) => {
  const subscription = await getUserSubscription(req.user._id);

  if (!subscription) {
    return ApiResponse.success(res, {
      subscription: null,
      planSlug: req.user.subscriptionPlan || 'free',
      message: 'You are on the free plan'
    });
  }

  ApiResponse.success(res, { subscription });
});

/**
 * @desc    Get subscription history for current user
 * @route   GET /api/v1/subscriptions/history
 * @access  Private
 */
const getMySubscriptionHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);

  const [subscriptions, total] = await Promise.all([
    Subscription.find({ user: req.user._id })
      .populate('plan', 'name slug color badge')
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit).lean(),
    Subscription.countDocuments({ user: req.user._id })
  ]);

  ApiResponse.paginated(res, subscriptions, buildPaginationResponse(page, limit, total));
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Get all subscription plans (admin — includes inactive)
 * @route   GET /api/v1/admin/subscriptions/plans
 * @access  Admin
 */
const adminGetPlans = asyncHandler(async (req, res) => {
  const plans = await SubscriptionPlan.find().sort({ displayOrder: 1 }).lean();
  ApiResponse.success(res, { plans });
});

/**
 * @desc    Create a new subscription plan
 * @route   POST /api/v1/admin/subscriptions/plans
 * @access  Admin
 */
const createPlan = asyncHandler(async (req, res, next) => {
  const existing = await SubscriptionPlan.findOne({ slug: req.body.slug });
  if (existing) return next(ApiError.conflict(`Plan with slug "${req.body.slug}" already exists`));

  const plan = await SubscriptionPlan.create(req.body);

  await logAction(req, {
    action: 'plan_created', category: 'system',
    targetType: 'subscription_plan', targetId: plan._id, targetLabel: plan.name,
    description: `Subscription plan "${plan.name}" created`,
    severity: 'info'
  });

  ApiResponse.created(res, { plan }, 'Subscription plan created');
});

/**
 * @desc    Update a subscription plan
 * @route   PUT /api/v1/admin/subscriptions/plans/:id
 * @access  Admin
 */
const updatePlan = asyncHandler(async (req, res, next) => {
  const plan = await SubscriptionPlan.findById(req.params.id);
  if (!plan) return next(ApiError.notFound('Plan not found'));

  // Prevent slug change for built-in plans
  if (req.body.slug && req.body.slug !== plan.slug) {
    return next(ApiError.badRequest('Plan slug cannot be changed'));
  }

  Object.assign(plan, req.body);
  await plan.save();

  await logAction(req, {
    action: 'plan_updated', category: 'system',
    targetType: 'subscription_plan', targetId: plan._id, targetLabel: plan.name,
    description: `Subscription plan "${plan.name}" updated`,
    severity: 'info'
  });

  ApiResponse.success(res, { plan }, 'Plan updated');
});

/**
 * @desc    List all subscriptions with filters
 * @route   GET /api/v1/admin/subscriptions
 * @access  Admin
 */
const listSubscriptions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { status, planSlug, search } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (planSlug) filter.planSlug = planSlug;

  if (search) {
    // Lookup user IDs matching the search
    const regex = new RegExp(search, 'i');
    const matchingUsers = await User.find({
      $or: [{ username: regex }, { email: regex }, { fullName: regex }]
    }).select('_id').lean();
    filter.user = { $in: matchingUsers.map(u => u._id) };
  }

  const [subscriptions, total] = await Promise.all([
    Subscription.find(filter)
      .populate('user', 'username email fullName avatar')
      .populate('plan', 'name slug color badge')
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit).lean(),
    Subscription.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, subscriptions, buildPaginationResponse(page, limit, total));
});

/**
 * @desc    Get subscription details
 * @route   GET /api/v1/admin/subscriptions/:id
 * @access  Admin
 */
const getSubscription = asyncHandler(async (req, res, next) => {
  const subscription = await Subscription.findById(req.params.id)
    .populate('user', 'username email fullName avatar subscriptionPlan')
    .populate('plan', 'name slug features price color badge')
    .populate('enterprise', 'name slug logo')
    .populate('grantedBy', 'username email');

  if (!subscription) return next(ApiError.notFound('Subscription not found'));

  ApiResponse.success(res, { subscription });
});

/**
 * @desc    Manually assign / upgrade a user's subscription plan (admin)
 * @route   POST /api/v1/admin/subscriptions/assign
 * @access  Admin
 */
const adminAssignPlan = asyncHandler(async (req, res, next) => {
  const {
    userId, planSlug, billingCycle = 'monthly',
    durationMonths = 1, notes = '', paymentRecord
  } = req.body;

  const user = await User.findById(userId);
  if (!user) return next(ApiError.notFound('User not found'));

  const subscription = await assignPlan({
    userId,
    planSlug,
    billingCycle,
    durationMonths,
    grantedByAdmin: true,
    adminId: req.user._id,
    paymentRecord: paymentRecord || null,
    notes
  });

  await logAction(req, {
    action: 'subscription_assigned', category: 'users',
    targetType: 'user', targetId: userId, targetLabel: user.username,
    description: `Admin assigned "${planSlug}" plan to ${user.email}`,
    severity: 'info'
  });

  ApiResponse.success(res, { subscription }, `Plan "${planSlug}" assigned to ${user.username}`);
});

/**
 * @desc    Cancel a subscription
 * @route   PUT /api/v1/admin/subscriptions/:id/cancel
 * @access  Admin
 */
const cancelSubscription = asyncHandler(async (req, res, next) => {
  const subscription = await Subscription.findById(req.params.id).populate('user', 'username email');
  if (!subscription) return next(ApiError.notFound('Subscription not found'));

  if (subscription.status === 'cancelled') {
    return next(ApiError.badRequest('Subscription is already cancelled'));
  }

  subscription.status = 'cancelled';
  subscription.cancelledAt = new Date();
  subscription.cancellationReason = req.body.reason || 'Cancelled by admin';
  await subscription.save();

  // Downgrade user to free
  await User.findByIdAndUpdate(subscription.user._id, { subscriptionPlan: 'free' });

  await logAction(req, {
    action: 'subscription_cancelled', category: 'users',
    targetType: 'subscription', targetId: subscription._id,
    targetLabel: subscription.user.username,
    description: `Subscription cancelled for ${subscription.user.email}`,
    severity: 'warning'
  });

  ApiResponse.success(res, null, 'Subscription cancelled');
});

/**
 * @desc    Get subscription analytics overview
 * @route   GET /api/v1/admin/subscriptions/analytics
 * @access  Admin
 */
const getSubscriptionAnalytics = asyncHandler(async (req, res) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalActive, totalExpired, totalCancelled,
    planDistribution, revenueEstimate,
    newSubscriptionsThisMonth, expiringThisWeek
  ] = await Promise.all([
    Subscription.countDocuments({ status: 'active' }),
    Subscription.countDocuments({ status: 'expired' }),
    Subscription.countDocuments({ status: 'cancelled' }),
    Subscription.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$planSlug', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    // Rough revenue estimate from payment history
    Subscription.aggregate([
      { $unwind: '$paymentHistory' },
      { $match: { 'paymentHistory.status': 'success' } },
      { $group: { _id: null, total: { $sum: '$paymentHistory.amount' } } }
    ]),
    Subscription.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    Subscription.countDocuments({
      status: 'active',
      endDate: { $ne: null, $gte: now, $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) }
    })
  ]);

  // Run expiry cleanup
  const expiredCount = await expireOverdueSubscriptions();

  ApiResponse.success(res, {
    totals: { totalActive, totalExpired, totalCancelled },
    planDistribution,
    revenueEstimate: revenueEstimate[0]?.total || 0,
    newSubscriptionsThisMonth,
    expiringThisWeek,
    overdueExpired: expiredCount
  });
});

/**
 * @desc    Delete a subscription plan
 * @route   DELETE /api/v1/admin/subscription-plans/:id
 * @access  Admin
 */
const deletePlan = asyncHandler(async (req, res, next) => {
  const plan = await SubscriptionPlan.findById(req.params.id);
  if (!plan) return next(ApiError.notFound('Plan not found'));

  const activeCount = await Subscription.countDocuments({
    plan: plan._id,
    status: { $in: ['active', 'trial'] }
  });
  if (activeCount > 0) {
    return next(ApiError.conflict(
      `Cannot delete plan with ${activeCount} active subscription(s). Deactivate the plan instead.`
    ));
  }

  await plan.deleteOne();
  ApiResponse.success(res, null, 'Plan deleted');
});

/**
 * @desc    Get active subscription for a specific user (admin)
 * @route   GET /api/v1/admin/subscriptions/user/:userId
 * @access  Admin
 */
const getUserSubscriptionByUserId = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({
    user: req.params.userId,
    status: { $in: ['active', 'trial'] }
  })
    .populate('plan', 'name slug color badge features price')
    .lean();

  ApiResponse.success(res, { subscription });
});

module.exports = {
  getPlans, getMySubscription, getMySubscriptionHistory,
  adminGetPlans, createPlan, updatePlan, deletePlan,
  listSubscriptions, getSubscription, getUserSubscriptionByUserId,
  adminAssignPlan, cancelSubscription, getSubscriptionAnalytics
};
