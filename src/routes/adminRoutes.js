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

// ─── Dashboard & System ───────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/admin/dashboard:
 *   get:
 *     summary: Admin overview dashboard
 *     description: Returns total users, active matches, room count, revenue, recent signups, match trend, format distribution and subscription distribution.
 *     tags: [Admin - Dashboard]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/dashboard', getDashboard);

/**
 * @swagger
 * /api/v1/admin/system:
 *   get:
 *     summary: System health and live counts
 *     description: Returns server uptime, memory usage (raw bytes + MB), DB connection latency, and live counts of active matches, rooms, and total users.
 *     tags: [Admin - System]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: System stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     server:
 *                       type: object
 *                       properties:
 *                         uptimeSeconds: { type: number }
 *                         memory: { type: object, properties: { heapUsedMB: { type: number }, heapTotalMB: { type: number } } }
 *                     database:
 *                       type: object
 *                       properties:
 *                         latencyMs: { type: number }
 *                         dataSizeMB: { type: number }
 *                     live:
 *                       type: object
 *                       properties:
 *                         liveMatches: { type: integer }
 *                         activeRooms: { type: integer }
 *                         totalUsers: { type: integer }
 */
router.get('/system', getSystemStats);

// ─── Export routes (super_admin only) ────────────────────────────────────────

/**
 * @swagger
 * /api/v1/admin/export/users:
 *   get:
 *     summary: Export all users as CSV
 *     description: Downloads a CSV file containing all user records. Requires super_admin role.
 *     tags: [Admin - System]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/export/users', superAdminOnly, exportUsers);

/**
 * @swagger
 * /api/v1/admin/export/matches:
 *   get:
 *     summary: Export all matches as CSV
 *     description: Downloads a CSV file of all match records. Requires super_admin role.
 *     tags: [Admin - System]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/export/matches', superAdminOnly, exportMatches);

/**
 * @swagger
 * /api/v1/admin/export/subscriptions:
 *   get:
 *     summary: Export all subscriptions as CSV
 *     description: Downloads a CSV file of all subscription records. Requires super_admin role.
 *     tags: [Admin - System]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/export/subscriptions', superAdminOnly, exportSubscriptions);

// ─── User management ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/admin/users/bulk:
 *   post:
 *     summary: Bulk user action
 *     description: Apply ban, unban, activate, or deactivate to multiple users at once.
 *     tags: [Admin - Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action, userIds]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [ban, unban, activate, deactivate]
 *               userIds:
 *                 type: array
 *                 items: { type: string }
 *                 minItems: 1
 *     responses:
 *       200:
 *         description: Bulk action applied
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/users/bulk', bulkUserAction);

/**
 * @swagger
 * /api/v1/admin/users:
 *   get:
 *     summary: List all users with filters and pagination
 *     tags: [Admin - Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - $ref: '#/components/parameters/SearchQuery'
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [user, admin, super_admin] }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *       - in: query
 *         name: isBanned
 *         schema: { type: boolean }
 *       - in: query
 *         name: subscriptionPlan
 *         schema: { type: string, example: free }
 *     responses:
 *       200:
 *         description: Paginated user list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/UserProfile' }
 *                 pagination: { $ref: '#/components/schemas/PaginationMeta' }
 */
router.get('/users', validate(adminValidators.listUsers), listUsers);

/**
 * @swagger
 * /api/v1/admin/users/{id}:
 *   get:
 *     summary: Get user details with activity and recent matches
 *     tags: [Admin - Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: User detail with activity stats and recent matches
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/users/:id', getUserDetails);

/**
 * @swagger
 * /api/v1/admin/users/{id}:
 *   patch:
 *     summary: Update user fields (isActive, isBanned, role)
 *     description: Can change `isActive`, `isBanned`, and `role`. Cannot modify a super_admin. Cannot change own role.
 *     tags: [Admin - Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive: { type: boolean }
 *               isBanned: { type: boolean }
 *               role:
 *                 type: string
 *                 enum: [user, admin, super_admin]
 *     responses:
 *       200:
 *         description: User updated
 *       403:
 *         description: Cannot modify a super_admin or change own role
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put('/users/:id', validate(adminValidators.updateUser), updateUser);
router.patch('/users/:id', validate(adminValidators.updateUser), updateUser);

/**
 * @swagger
 * /api/v1/admin/users/{id}:
 *   delete:
 *     summary: Soft-delete a user (super_admin only)
 *     tags: [Admin - Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: User deleted
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete('/users/:id', superAdminOnly, deleteUser);

/**
 * @swagger
 * /api/v1/admin/users/{id}/ban:
 *   post:
 *     summary: Ban a user
 *     tags: [Admin - Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: User banned
 */
router.post('/users/:id/ban', banUser);

/**
 * @swagger
 * /api/v1/admin/users/{id}/unban:
 *   post:
 *     summary: Unban a user
 *     tags: [Admin - Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: User unbanned
 */
router.post('/users/:id/unban', unbanUser);

/**
 * @swagger
 * /api/v1/admin/users/{id}/activate:
 *   post:
 *     summary: Activate a deactivated user account
 *     tags: [Admin - Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: User activated
 */
router.post('/users/:id/activate', activateUser);

/**
 * @swagger
 * /api/v1/admin/users/{id}/deactivate:
 *   post:
 *     summary: Deactivate a user account
 *     tags: [Admin - Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: User deactivated
 */
router.post('/users/:id/deactivate', deactivateUser);

// ─── Match & Room management ──────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/admin/matches:
 *   get:
 *     summary: List all matches with filters
 *     tags: [Admin - Matches & Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [not_started, toss_done, in_progress, innings_break, completed, abandoned]
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [T10, T20, ODI, TEST, CUSTOM]
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Paginated match list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/MatchSummary' }
 *                 pagination: { $ref: '#/components/schemas/PaginationMeta' }
 */
router.get('/matches', validate(adminValidators.listMatches), listMatches);

/**
 * @swagger
 * /api/v1/admin/rooms:
 *   get:
 *     summary: List all rooms
 *     tags: [Admin - Matches & Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [waiting, active, completed, cancelled]
 *     responses:
 *       200:
 *         description: Paginated room list
 */
router.get('/rooms', listRooms);

/**
 * @swagger
 * /api/v1/admin/matches/{id}/abandon:
 *   post:
 *     summary: Abandon an in-progress match
 *     tags: [Admin - Matches & Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Match abandoned
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post('/matches/:id/abandon', abandonMatch);

// ─── Enterprise management ────────────────────────────────────────────────────
router.use('/enterprises', adminEnterpriseRoutes);

// ─── Ad management ────────────────────────────────────────────────────────────
router.use('/ads', adminAdRoutes);

// ─── Subscription management (admin portion) ─────────────────────────────────
const subCtrl = require('../controllers/subscriptionController');

/**
 * @swagger
 * /api/v1/admin/subscription-plans:
 *   get:
 *     summary: Get all subscription plans including inactive
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Array of all plans
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
router.get('/subscription-plans', subCtrl.adminGetPlans);

/**
 * @swagger
 * /api/v1/admin/subscription-plans:
 *   post:
 *     summary: Create a new subscription plan (super_admin only)
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, slug, price, features]
 *             properties:
 *               name:     { type: string, example: Pro }
 *               slug:     { type: string, example: pro }
 *               type:     { type: string, enum: [individual, enterprise] }
 *               price:
 *                 type: object
 *                 properties:
 *                   monthly:  { type: number, example: 299 }
 *                   annual:   { type: number, example: 2999 }
 *                   currency: { type: string, example: INR }
 *               features:
 *                 $ref: '#/components/schemas/PlanFeatures'
 *     responses:
 *       201:
 *         description: Plan created
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post('/subscription-plans', superAdminOnly, subCtrl.createPlan);

/**
 * @swagger
 * /api/v1/admin/subscription-plans/{id}:
 *   put:
 *     summary: Update a subscription plan (super_admin only)
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SubscriptionPlan'
 *     responses:
 *       200:
 *         description: Plan updated
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put('/subscription-plans/:id', superAdminOnly, subCtrl.updatePlan);

/**
 * @swagger
 * /api/v1/admin/subscription-plans/{id}:
 *   delete:
 *     summary: Delete a subscription plan (super_admin only)
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Plan deleted
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete('/subscription-plans/:id', superAdminOnly, subCtrl.deletePlan);

/**
 * @swagger
 * /api/v1/admin/subscriptions/analytics:
 *   get:
 *     summary: Subscription analytics — revenue, churn, plan distribution
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription analytics data
 */
router.get('/subscriptions/analytics', subCtrl.getSubscriptionAnalytics);

/**
 * @swagger
 * /api/v1/admin/subscriptions/plans/all:
 *   get:
 *     summary: Get all plans including inactive (alias)
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All plans
 */
router.get('/subscriptions/plans/all', subCtrl.adminGetPlans);

/**
 * @swagger
 * /api/v1/admin/subscriptions/plans:
 *   post:
 *     summary: Create a subscription plan via /subscriptions path (super_admin only)
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SubscriptionPlan'
 *     responses:
 *       201:
 *         description: Plan created
 */
router.post('/subscriptions/plans', superAdminOnly, subCtrl.createPlan);

/**
 * @swagger
 * /api/v1/admin/subscriptions/plans/{id}:
 *   put:
 *     summary: Update a subscription plan via /subscriptions path (super_admin only)
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SubscriptionPlan'
 *     responses:
 *       200:
 *         description: Plan updated
 */
router.put('/subscriptions/plans/:id', superAdminOnly, subCtrl.updatePlan);

/**
 * @swagger
 * /api/v1/admin/subscriptions:
 *   get:
 *     summary: List all user subscriptions
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, expired, cancelled, pending] }
 *       - in: query
 *         name: planSlug
 *         schema: { type: string }
 *       - $ref: '#/components/parameters/SearchQuery'
 *     responses:
 *       200:
 *         description: Paginated subscription list
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
router.get('/subscriptions', subCtrl.listSubscriptions);

/**
 * @swagger
 * /api/v1/admin/subscriptions/assign:
 *   post:
 *     summary: Manually assign a subscription plan to a user
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, planSlug]
 *             properties:
 *               userId:      { type: string }
 *               planSlug:    { type: string, example: pro }
 *               billingCycle:{ type: string, enum: [monthly, annual, lifetime], default: monthly }
 *               durationDays:{ type: integer, example: 30 }
 *     responses:
 *       200:
 *         description: Plan assigned
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post('/subscriptions/assign', subCtrl.adminAssignPlan);

/**
 * @swagger
 * /api/v1/admin/subscriptions/user/{userId}:
 *   get:
 *     summary: Get a user's current subscription by user ID
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User subscription
 */
router.get('/subscriptions/user/:userId', subCtrl.getUserSubscriptionByUserId);

/**
 * @swagger
 * /api/v1/admin/subscriptions/{id}:
 *   get:
 *     summary: Get a subscription by its ID
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Subscription record
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/subscriptions/:id', subCtrl.getSubscription);

/**
 * @swagger
 * /api/v1/admin/subscriptions/{id}/cancel:
 *   put:
 *     summary: Cancel a subscription
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Subscription cancelled
 */
router.put('/subscriptions/:id/cancel', subCtrl.cancelSubscription);
router.post('/subscriptions/:id/cancel', subCtrl.cancelSubscription);

module.exports = router;
