const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const logger = require('../config/logger');
const { sendSubscriptionEmail } = require('./emailService');

// Simple in-memory cache for plan features (avoids a DB hit on every request)
const planFeaturesCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Seed the default subscription plans if they don't exist
 */
const seedSubscriptionPlans = async () => {
  const count = await SubscriptionPlan.countDocuments();
  if (count > 0) return;

  const plans = [
    {
      name: 'Free',
      slug: 'free',
      type: 'individual',
      // maxRooms = max matches/rooms creatable per calendar month (1 room = 1 match)
      description: 'Get started with basic cricket scoring. Create up to 3 matches per month for free.',
      price: { monthly: 0, annual: 0, currency: 'INR' },
      features: {
        maxRooms: 3,
        maxPlayersPerRoom: 22,
        maxTournaments: 0,
        canUseTools: false,
        canUploadLogo: false,
        adsEnabled: true,
        canManageAcademy: false,
        maxAcademyMembers: 0,
        analyticsAccess: false,
        prioritySupport: false,
        customBranding: false,
        apiAccess: false,
        exportData: false
      },
      displayOrder: 1,
      color: '#6c757d'
    },
    {
      name: 'Basic',
      slug: 'basic',
      type: 'individual',
      description: 'Up to 10 matches per month, cricket tools, and team logo uploads.',
      price: { monthly: 99, annual: 999, currency: 'INR' },
      features: {
        maxRooms: 10,
        maxPlayersPerRoom: 22,
        maxTournaments: 2,
        canUseTools: true,
        canUploadLogo: true,
        adsEnabled: true,
        canManageAcademy: false,
        maxAcademyMembers: 0,
        analyticsAccess: false,
        prioritySupport: false,
        customBranding: false,
        apiAccess: false,
        exportData: false
      },
      displayOrder: 2,
      badge: 'Popular',
      color: '#0d6efd'
    },
    {
      name: 'Pro',
      slug: 'pro',
      type: 'individual',
      description: 'Unlimited matches, advanced analytics, and a completely ad-free experience.',
      price: { monthly: 299, annual: 2999, currency: 'INR' },
      features: {
        maxRooms: -1,        // unlimited matches per month
        maxPlayersPerRoom: 22,
        maxTournaments: 10,
        canUseTools: true,
        canUploadLogo: true,
        adsEnabled: false,
        canManageAcademy: false,
        maxAcademyMembers: 0,
        analyticsAccess: true,
        prioritySupport: true,
        customBranding: false,
        apiAccess: false,
        exportData: true
      },
      displayOrder: 3,
      badge: 'Best Value',
      color: '#198754'
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      type: 'enterprise',
      description: 'Full-featured solution for cricket academies and clubs. Unlimited matches, academy management, and API access.',
      price: { monthly: 999, annual: 9999, currency: 'INR' },
      features: {
        maxRooms: -1,        // unlimited matches per month
        maxPlayersPerRoom: 30,
        maxTournaments: -1,
        canUseTools: true,
        canUploadLogo: true,
        adsEnabled: false,
        canManageAcademy: true,
        maxAcademyMembers: 500,
        analyticsAccess: true,
        prioritySupport: true,
        customBranding: true,
        apiAccess: true,
        exportData: true
      },
      displayOrder: 4,
      color: '#6f42c1'
    }
  ];

  await SubscriptionPlan.insertMany(plans);
  logger.info('Subscription plans seeded successfully');
};

/**
 * Assign a free subscription to a newly registered user
 */
const assignFreePlan = async (userId) => {
  const freePlan = await SubscriptionPlan.findOne({ slug: 'free' });
  if (!freePlan) {
    logger.warn('Free subscription plan not found; skipping auto-assign');
    return null;
  }

  const subscription = await Subscription.create({
    user: userId,
    plan: freePlan._id,
    planSlug: 'free',
    status: 'active',
    billingCycle: 'free',
    startDate: new Date(),
    endDate: null,
    autoRenew: false
  });

  await User.findByIdAndUpdate(userId, {
    subscription: subscription._id,
    subscriptionPlan: 'free'
  });

  return subscription;
};

/**
 * Upgrade or change a user's subscription plan (admin or payment flow)
 */
const assignPlan = async ({
  userId,
  planSlug,
  billingCycle = 'monthly',
  durationMonths = 1,
  grantedByAdmin = false,
  adminId = null,
  paymentRecord = null,
  notes = ''
}) => {
  const plan = await SubscriptionPlan.findOne({ slug: planSlug, isActive: true });
  if (!plan) throw new Error(`Plan "${planSlug}" not found or inactive`);

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  // Calculate end date
  let endDate = null;
  if (billingCycle !== 'free' && billingCycle !== 'lifetime') {
    const months = billingCycle === 'annual' ? 12 : durationMonths;
    endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);
  }

  // Expire old active subscription
  if (user.subscription) {
    await Subscription.findByIdAndUpdate(user.subscription, {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancellationReason: 'Upgraded to new plan'
    });
  }

  const subscriptionData = {
    user: userId,
    plan: plan._id,
    planSlug,
    status: 'active',
    billingCycle,
    startDate: new Date(),
    endDate,
    autoRenew: !grantedByAdmin,
    grantedByAdmin,
    grantedBy: adminId,
    notes
  };

  if (paymentRecord) {
    subscriptionData.paymentHistory = [paymentRecord];
  }

  const subscription = await Subscription.create(subscriptionData);

  await User.findByIdAndUpdate(userId, {
    subscription: subscription._id,
    subscriptionPlan: planSlug
  });

  // Send confirmation email (non-blocking)
  sendSubscriptionEmail({
    email: user.email,
    userName: user.fullName || user.username,
    planName: plan.name,
    endDate
  }).catch(err => logger.error(`Subscription email failed: ${err.message}`));

  logger.info(`User ${user.email} assigned to ${planSlug} plan`);
  return subscription;
};

/**
 * Get the active subscription with plan details for a user
 */
const getUserSubscription = async (userId) => {
  const subscription = await Subscription.findOne({
    user: userId,
    status: { $in: ['active', 'trial'] }
  }).populate('plan').sort({ createdAt: -1 });

  return subscription;
};

/**
 * Get plan features for a given planSlug (cached for 5 minutes)
 */
const getPlanFeatures = async (planSlug) => {
  const cached = planFeaturesCache.get(planSlug);
  if (cached && Date.now() < cached.expiresAt) return cached.features;

  const plan = await SubscriptionPlan.findOne({ slug: planSlug }).lean();
  const features = plan ? plan.features : null;

  if (features) {
    planFeaturesCache.set(planSlug, { features, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return features;
};

/**
 * Check if user has access to a specific feature
 */
const hasFeature = async (userId, featureName) => {
  const user = await User.findById(userId).select('subscriptionPlan');
  if (!user) return false;
  const features = await getPlanFeatures(user.subscriptionPlan || 'free');
  if (!features) return false;
  return features[featureName] === true;
};

/**
 * Expire subscriptions that have passed their end date (run via cron or startup)
 */
const expireOverdueSubscriptions = async () => {
  const result = await Subscription.updateMany(
    {
      status: 'active',
      endDate: { $ne: null, $lt: new Date() }
    },
    { $set: { status: 'expired' } }
  );

  if (result.modifiedCount > 0) {
    // Downgrade expired users to free
    const expiredSubs = await Subscription.find({ status: 'expired' })
      .select('user planSlug')
      .lean();

    const expiredUserIds = expiredSubs.map(s => s.user);

    await User.updateMany(
      { _id: { $in: expiredUserIds }, subscriptionPlan: { $ne: 'free' } },
      { $set: { subscriptionPlan: 'free' } }
    );

    logger.info(`Expired ${result.modifiedCount} subscriptions and downgraded users to free plan`);
  }

  return result.modifiedCount;
};

module.exports = {
  seedSubscriptionPlans,
  assignFreePlan,
  assignPlan,
  getUserSubscription,
  getPlanFeatures,
  hasFeature,
  expireOverdueSubscriptions
};
