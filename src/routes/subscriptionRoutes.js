const router = require('express').Router();
const {
  getPlans, getMySubscription, getMySubscriptionHistory,
  adminGetPlans, createPlan, updatePlan,
  listSubscriptions, getSubscription,
  adminAssignPlan, cancelSubscription, getSubscriptionAnalytics
} = require('../controllers/subscriptionController');
const { authenticate } = require('../middlewares/auth');
const { authorize } = require('../middlewares/auth');

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/subscriptions/plans:
 *   get:
 *     summary: Get all active subscription plans (public)
 *     description: Returns plans with features visible to the user. Shows only active plans.
 *     tags: [Subscriptions]
 *     responses:
 *       200:
 *         description: List of active subscription plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/SubscriptionPlan' }
 */
router.get('/plans', getPlans);

// ─── Authenticated user ───────────────────────────────────────────────────────
router.use(authenticate);

/**
 * @swagger
 * /api/v1/subscriptions/my:
 *   get:
 *     summary: Get the current user's active subscription
 *     tags: [Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current subscription with plan features
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/UserSubscription' }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/my', getMySubscription);

/**
 * @swagger
 * /api/v1/subscriptions/history:
 *   get:
 *     summary: Get the current user's subscription history
 *     tags: [Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200:
 *         description: Subscription history list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/UserSubscription' }
 */
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
