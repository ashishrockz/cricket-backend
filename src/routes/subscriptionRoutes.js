const router = require('express').Router();
const {
  getPlans, getMySubscription, getMySubscriptionHistory,
  adminGetPlans, createPlan, updatePlan,
  listSubscriptions, getSubscription,
  adminAssignPlan, cancelSubscription, getSubscriptionAnalytics
} = require('../controllers/subscriptionController');
const { authenticate } = require('../middlewares/auth');
const { authorize } = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Subscriptions
 *   description: Subscription plan management
 */

// ─── Public ───────────────────────────────────────────────────────────────────
router.get('/plans', getPlans);

// ─── Authenticated user ───────────────────────────────────────────────────────
router.use(authenticate);
router.get('/my', getMySubscription);
router.get('/history', getMySubscriptionHistory);

// ─── Admin ────────────────────────────────────────────────────────────────────
router.use(authorize('admin', 'super_admin'));
router.get('/analytics', getSubscriptionAnalytics);
router.get('/', listSubscriptions);
router.post('/assign', adminAssignPlan);
router.get('/plans/all', adminGetPlans);
router.post('/plans', createPlan);
router.put('/plans/:id', updatePlan);
router.get('/:id', getSubscription);
router.put('/:id/cancel', cancelSubscription);

module.exports = router;
