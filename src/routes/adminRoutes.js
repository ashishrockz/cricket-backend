const router = require('express').Router();
const {
  getDashboard, listUsers, getUserDetails, updateUser, deleteUser,
  listMatches, listRooms, abandonMatch, getSystemStats
} = require('../controllers/adminController');
const { authenticate, adminOnly } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { adminValidators } = require('../validators');

// Sub-routers for new features
const adminEnterpriseRoutes = require('./adminEnterpriseRoutes');
const adminAdRoutes = require('./adminAdRoutes');
const subscriptionRoutes = require('./subscriptionRoutes');

// All admin routes require authentication + admin role
router.use(authenticate);
router.use(adminOnly);

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin panel endpoints (requires admin role)
 */

// ─── Core admin routes ────────────────────────────────────────────────────────
router.get('/dashboard', getDashboard);
router.get('/system', getSystemStats);

// ─── User management ──────────────────────────────────────────────────────────
router.get('/users', validate(adminValidators.listUsers), listUsers);
router.get('/users/:id', getUserDetails);
router.put('/users/:id', validate(adminValidators.updateUser), updateUser);
router.delete('/users/:id', deleteUser);

// ─── Match & Room management ──────────────────────────────────────────────────
router.get('/matches', validate(adminValidators.listMatches), listMatches);
router.get('/rooms', listRooms);
router.post('/matches/:id/abandon', abandonMatch);

// ─── Enterprise management ────────────────────────────────────────────────────
router.use('/enterprises', adminEnterpriseRoutes);

// ─── Ad management ────────────────────────────────────────────────────────────
router.use('/ads', adminAdRoutes);

// ─── Subscription management (admin portion) ─────────────────────────────────
// Note: subscriptionRoutes handles its own auth internally, we layer admin auth on top
router.get('/subscriptions/analytics', require('../controllers/subscriptionController').getSubscriptionAnalytics);
router.get('/subscriptions/plans/all', require('../controllers/subscriptionController').adminGetPlans);
router.post('/subscriptions/plans', require('../controllers/subscriptionController').createPlan);
router.put('/subscriptions/plans/:id', require('../controllers/subscriptionController').updatePlan);
router.get('/subscriptions', require('../controllers/subscriptionController').listSubscriptions);
router.get('/subscriptions/:id', require('../controllers/subscriptionController').getSubscription);
router.post('/subscriptions/assign', require('../controllers/subscriptionController').adminAssignPlan);
router.put('/subscriptions/:id/cancel', require('../controllers/subscriptionController').cancelSubscription);

module.exports = router;
