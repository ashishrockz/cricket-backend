const router = require('express').Router();
const {
  getDashboard, listUsers, getUserDetails, updateUser, deleteUser,
  listMatches, listRooms, abandonMatch, getSystemStats,
  banUser, unbanUser, activateUser, deactivateUser,
  bulkUserAction, exportUsers, exportMatches, exportSubscriptions
} = require('../controllers/adminController');
const { authenticate, adminOnly, superAdminOnly } = require('../middlewares/auth');
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

// ─── Export routes (super_admin only) ────────────────────────────────────────
router.get('/export/users',          superAdminOnly, exportUsers);
router.get('/export/matches',        superAdminOnly, exportMatches);
router.get('/export/subscriptions',  superAdminOnly, exportSubscriptions);

// ─── User management ──────────────────────────────────────────────────────────
// Bulk action must be before /:id to avoid route conflict
router.post('/users/bulk',        bulkUserAction);
router.get('/users',              validate(adminValidators.listUsers), listUsers);
router.get('/users/:id',          getUserDetails);
router.put('/users/:id',          validate(adminValidators.updateUser), updateUser);
router.patch('/users/:id',        validate(adminValidators.updateUser), updateUser);
router.delete('/users/:id',       superAdminOnly, deleteUser);
router.post('/users/:id/ban',     banUser);
router.post('/users/:id/unban',   unbanUser);
router.post('/users/:id/activate',   activateUser);
router.post('/users/:id/deactivate', deactivateUser);

// ─── Match & Room management ──────────────────────────────────────────────────
router.get('/matches', validate(adminValidators.listMatches), listMatches);
router.get('/rooms', listRooms);
router.post('/matches/:id/abandon', abandonMatch);

// ─── Enterprise management ────────────────────────────────────────────────────
router.use('/enterprises', adminEnterpriseRoutes);

// ─── Ad management ────────────────────────────────────────────────────────────
router.use('/ads', adminAdRoutes);

// ─── Subscription management (admin portion) ─────────────────────────────────
const subCtrl = require('../controllers/subscriptionController');
// /subscription-plans aliases (portal-friendly URLs)
router.get('/subscription-plans',        subCtrl.adminGetPlans);
router.post('/subscription-plans',       superAdminOnly, subCtrl.createPlan);
router.put('/subscription-plans/:id',    superAdminOnly, subCtrl.updatePlan);
router.delete('/subscription-plans/:id', superAdminOnly, subCtrl.deletePlan);
// /subscriptions/* — static paths first
router.get('/subscriptions/analytics',   subCtrl.getSubscriptionAnalytics);
router.get('/subscriptions/plans/all',   subCtrl.adminGetPlans);
router.post('/subscriptions/plans',      superAdminOnly, subCtrl.createPlan);
router.put('/subscriptions/plans/:id',   superAdminOnly, subCtrl.updatePlan);
router.get('/subscriptions',             subCtrl.listSubscriptions);
router.post('/subscriptions/assign',     subCtrl.adminAssignPlan);
router.get('/subscriptions/user/:userId', subCtrl.getUserSubscriptionByUserId);
router.get('/subscriptions/:id',         subCtrl.getSubscription);
router.put('/subscriptions/:id/cancel',  subCtrl.cancelSubscription);
router.post('/subscriptions/:id/cancel', subCtrl.cancelSubscription);

module.exports = router;
