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

// Public — get active announcements
router.get('/active', optionalAuth, getActiveAnnouncements);

// Admin routes
router.get('/', authenticate, adminOnly, listAnnouncements);
router.get('/:id', authenticate, adminOnly, getAnnouncementById);
router.post('/', authenticate, adminOnly, validate(createSchema), createAnnouncement);
router.put('/:id', authenticate, adminOnly, validate(updateSchema), updateAnnouncement);
router.post('/:id/publish', authenticate, adminOnly, publishAnnouncement);
router.post('/:id/archive', authenticate, adminOnly, archiveAnnouncement);
router.delete('/:id', authenticate, adminOnly, deleteAnnouncement);

module.exports = router;
