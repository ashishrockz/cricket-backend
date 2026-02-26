const router = require('express').Router();
const { authenticate, adminOnly } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const Joi = require('joi');
const {
  sendNotification, broadcastNotification, listNotifications, getNotificationStats,
  getMyNotifications, getUnreadCount, markAsRead, markAllRead
} = require('../controllers/notificationController');

const sendSchema = Joi.object({
  recipientId: Joi.string().hex().length(24).required(),
  title:       Joi.string().min(3).max(200).required(),
  body:        Joi.string().min(3).max(1000).required(),
  type:        Joi.string().valid('system', 'match', 'tournament', 'friend', 'announcement', 'promotion', 'warning', 'custom'),
  actionUrl:   Joi.string().uri().max(500).allow(null, ''),
  imageUrl:    Joi.string().uri().max(500).allow(null, '')
});

const broadcastSchema = Joi.object({
  title:     Joi.string().min(3).max(200).required(),
  body:      Joi.string().min(3).max(1000).required(),
  type:      Joi.string().valid('system', 'match', 'tournament', 'announcement', 'promotion', 'warning', 'custom'),
  audience:  Joi.string().valid('all', 'active_users', 'inactive_users', 'by_city', 'by_role').required(),
  filter:    Joi.object({ city: Joi.string().max(100), role: Joi.string().valid('user', 'admin') }).allow(null),
  actionUrl: Joi.string().uri().max(500).allow(null, ''),
  imageUrl:  Joi.string().uri().max(500).allow(null, '')
});

// ─── User-facing ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/notifications/me:
 *   get:
 *     summary: Get current user's notification inbox
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Paginated notification list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Notification' }
 *                 pagination: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/me', authenticate, getMyNotifications);

/**
 * @swagger
 * /api/v1/notifications/unread-count:
 *   get:
 *     summary: Get the unread notification count for the current user
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     unreadCount: { type: integer, example: 3 }
 */
router.get('/unread-count', authenticate, getUnreadCount);

/**
 * @swagger
 * /api/v1/notifications/mark-all-read:
 *   post:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.post('/mark-all-read', authenticate, markAllRead);

/**
 * @swagger
 * /api/v1/notifications/{id}/read:
 *   patch:
 *     summary: Mark a single notification as read
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.patch('/:id/read', authenticate, markAsRead);

// ─── Admin-only ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/notifications:
 *   get:
 *     summary: List all notifications (admin)
 *     tags: [Admin - Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [system, match, tournament, friend, announcement, promotion, warning, custom]
 *       - in: query
 *         name: recipientId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated notification list
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/', authenticate, adminOnly, listNotifications);

/**
 * @swagger
 * /api/v1/notifications/stats:
 *   get:
 *     summary: Notification delivery statistics
 *     tags: [Admin - Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Notification stats — total sent, read rate, type breakdown
 */
router.get('/stats', authenticate, adminOnly, getNotificationStats);

/**
 * @swagger
 * /api/v1/notifications/send:
 *   post:
 *     summary: Send a notification to a specific user
 *     tags: [Admin - Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientId, title, body]
 *             properties:
 *               recipientId: { type: string, description: Target user ID }
 *               title:       { type: string, minLength: 3, maxLength: 200, example: Match Reminder }
 *               body:        { type: string, minLength: 3, maxLength: 1000, example: Your match starts in 1 hour! }
 *               type:
 *                 type: string
 *                 enum: [system, match, tournament, friend, announcement, promotion, warning, custom]
 *                 default: system
 *               actionUrl:   { type: string, format: uri, nullable: true }
 *               imageUrl:    { type: string, format: uri, nullable: true }
 *     responses:
 *       200:
 *         description: Notification sent
 *       404:
 *         description: Recipient not found
 */
router.post('/send', authenticate, adminOnly, validate(sendSchema), sendNotification);

/**
 * @swagger
 * /api/v1/notifications/broadcast:
 *   post:
 *     summary: Broadcast a notification to a filtered audience
 *     tags: [Admin - Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, body, audience]
 *             properties:
 *               title:    { type: string, example: New Feature Alert }
 *               body:     { type: string, example: Check out the new tournament mode! }
 *               type:     { type: string, enum: [system, match, tournament, announcement, promotion, warning, custom] }
 *               audience:
 *                 type: string
 *                 enum: [all, active_users, inactive_users, by_city, by_role]
 *                 description: "'all' sends to every user; 'by_city' and 'by_role' require a filter object"
 *               filter:
 *                 type: object
 *                 properties:
 *                   city: { type: string, example: Mumbai }
 *                   role: { type: string, enum: [user, admin] }
 *               actionUrl: { type: string, format: uri }
 *     responses:
 *       200:
 *         description: Broadcast queued — returns recipient count
 */
router.post('/broadcast', authenticate, adminOnly, validate(broadcastSchema), broadcastNotification);

module.exports = router;
