const router = require('express').Router();
const { authenticate, adminOnly, optionalAuth } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const Joi = require('joi');
const {
  listAnnouncements, getAnnouncementById,
  createAnnouncement, updateAnnouncement,
  publishAnnouncement, archiveAnnouncement, deleteAnnouncement,
  getActiveAnnouncements
} = require('../controllers/announcementController');

const createSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  body: Joi.string().min(10).max(5000).required(),
  type: Joi.string().valid('info', 'warning', 'update', 'maintenance', 'promotion', 'event'),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent'),
  audience: Joi.string().valid('all', 'active_users', 'new_users', 'premium_users', 'specific_city'),
  audienceFilter: Joi.object({ cities: Joi.array().items(Joi.string()), minMatches: Joi.number(), registeredAfter: Joi.date() }),
  scheduledAt: Joi.date().allow(null),
  expiresAt: Joi.date().allow(null),
  isPinned: Joi.boolean(),
  showAsBanner: Joi.boolean(),
  actionUrl: Joi.string().uri().max(500).allow(null, ''),
  actionLabel: Joi.string().max(50).allow(null, '')
});

const updateSchema = createSchema.fork(['title', 'body'], s => s.optional());

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/announcements/active:
 *   get:
 *     summary: Get currently active/published announcements (public)
 *     description: Returns announcements visible to users — published, not expired, and matching their audience. No auth required; pass token for audience personalisation.
 *     tags: [Announcements]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Active announcements
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Announcement' }
 */
router.get('/active', optionalAuth, getActiveAnnouncements);

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/announcements:
 *   get:
 *     summary: List all announcements (admin)
 *     tags: [Admin - Announcements]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, published, archived] }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [info, warning, update, maintenance, promotion, event] }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [low, normal, high, urgent] }
 *     responses:
 *       200:
 *         description: Paginated announcement list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Announcement' }
 *                 pagination: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/', authenticate, adminOnly, listAnnouncements);

/**
 * @swagger
 * /api/v1/announcements/{id}:
 *   get:
 *     summary: Get a single announcement by ID (admin)
 *     tags: [Admin - Announcements]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Announcement details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Announcement' }
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id', authenticate, adminOnly, getAnnouncementById);

/**
 * @swagger
 * /api/v1/announcements:
 *   post:
 *     summary: Create a new announcement (saved as draft)
 *     tags: [Admin - Announcements]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, body]
 *             properties:
 *               title:       { type: string, minLength: 3, maxLength: 200, example: App Maintenance Notice }
 *               body:        { type: string, minLength: 10, maxLength: 5000 }
 *               type:        { type: string, enum: [info, warning, update, maintenance, promotion, event], default: info }
 *               priority:    { type: string, enum: [low, normal, high, urgent], default: normal }
 *               audience:    { type: string, enum: [all, active_users, new_users, premium_users, specific_city], default: all }
 *               isPinned:    { type: boolean, default: false }
 *               showAsBanner:{ type: boolean, default: false }
 *               scheduledAt: { type: string, format: date-time, nullable: true }
 *               expiresAt:   { type: string, format: date-time, nullable: true }
 *               actionUrl:   { type: string, format: uri, nullable: true }
 *               actionLabel: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Announcement created (status = draft)
 */
router.post('/', authenticate, adminOnly, validate(createSchema), createAnnouncement);

/**
 * @swagger
 * /api/v1/announcements/{id}:
 *   put:
 *     summary: Update an announcement
 *     description: Only draft announcements can be fully edited. Published announcements allow limited edits.
 *     tags: [Admin - Announcements]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Announcement'
 *     responses:
 *       200:
 *         description: Announcement updated
 */
router.put('/:id', authenticate, adminOnly, validate(updateSchema), updateAnnouncement);

/**
 * @swagger
 * /api/v1/announcements/{id}/publish:
 *   post:
 *     summary: Publish a draft announcement (makes it visible to users)
 *     tags: [Admin - Announcements]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Announcement published
 *       400:
 *         description: Announcement is not in draft status
 */
router.post('/:id/publish', authenticate, adminOnly, publishAnnouncement);

/**
 * @swagger
 * /api/v1/announcements/{id}/archive:
 *   post:
 *     summary: Archive an announcement (hides it from users)
 *     tags: [Admin - Announcements]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Announcement archived
 */
router.post('/:id/archive', authenticate, adminOnly, archiveAnnouncement);

/**
 * @swagger
 * /api/v1/announcements/{id}:
 *   delete:
 *     summary: Permanently delete an announcement
 *     tags: [Admin - Announcements]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Announcement deleted
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete('/:id', authenticate, adminOnly, deleteAnnouncement);

module.exports = router;
