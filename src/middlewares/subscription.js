const { ApiError } = require('../utils/apiHelpers');
const { getPlanFeatures } = require('../services/subscriptionService');

/**
 * Middleware: require the authenticated user to have a specific plan feature enabled.
 *
 * Usage example:
 *   router.post('/tools/crr', authenticate, requireFeature('canUseTools'), handler);
 *
 * @param {string} featureName - Key from SubscriptionPlan.features (e.g. 'canUseTools', 'analyticsAccess')
 * @param {string} [errorMessage] - Optional custom error message
 */
const requireFeature = (featureName, errorMessage) => async (req, res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized('Authentication required'));
  }

  const planSlug = req.user.subscriptionPlan || 'free';

  // Admins and super_admins always bypass plan restrictions
  if (req.user.role === 'admin' || req.user.role === 'super_admin') {
    return next();
  }

  const features = await getPlanFeatures(planSlug);

  if (!features || !features[featureName]) {
    const defaultMessages = {
      canUseTools: 'Cricket tools are available on Basic plan and above. Please upgrade your subscription.',
      canUploadLogo: 'Logo upload is available on Basic plan and above. Please upgrade your subscription.',
      canManageAcademy: 'Academy management requires the Enterprise plan. Please upgrade your subscription.',
      analyticsAccess: 'Advanced analytics is available on Pro plan and above. Please upgrade your subscription.',
      exportData: 'Data export is available on Pro plan and above. Please upgrade your subscription.',
      apiAccess: 'API access is available on Enterprise plan only. Please contact us to upgrade.'
    };

    const message = errorMessage || defaultMessages[featureName] ||
      `Your current plan (${planSlug}) does not include access to this feature. Please upgrade.`;

    return next(ApiError.forbidden(message));
  }

  next();
};

/**
 * Middleware: require a minimum subscription plan tier.
 *
 * @param {'free'|'basic'|'pro'|'enterprise'} minPlan - Minimum required plan
 */
const requirePlan = (minPlan) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized('Authentication required'));

  // Admins bypass plan restrictions
  if (req.user.role === 'admin' || req.user.role === 'super_admin') return next();

  const planOrder = ['free', 'basic', 'pro', 'enterprise'];
  const userPlanIndex = planOrder.indexOf(req.user.subscriptionPlan || 'free');
  const requiredPlanIndex = planOrder.indexOf(minPlan);

  if (userPlanIndex < requiredPlanIndex) {
    return next(ApiError.forbidden(
      `This feature requires the ${minPlan.charAt(0).toUpperCase() + minPlan.slice(1)} plan or higher. Please upgrade your subscription.`
    ));
  }

  next();
};

/**
 * Middleware: attach plan features to req.planFeatures for conditional logic in controllers.
 */
const attachPlanFeatures = async (req, res, next) => {
  if (!req.user) return next();

  try {
    const features = await getPlanFeatures(req.user.subscriptionPlan || 'free');
    req.planFeatures = features || {};
  } catch {
    req.planFeatures = {};
  }

  next();
};

module.exports = { requireFeature, requirePlan, attachPlanFeatures };
