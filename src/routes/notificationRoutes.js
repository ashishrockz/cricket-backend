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

// ---- User-facing ----
router.get('/me',             authenticate, getMyNotifications);
router.get('/unread-count',   authenticate, getUnreadCount);
router.post('/mark-all-read', authenticate, markAllRead);
router.patch('/:id/read',     authenticate, markAsRead);

// ---- Admin-only ----
router.get('/',           authenticate, adminOnly, listNotifications);
router.get('/stats',      authenticate, adminOnly, getNotificationStats);
router.post('/send',      authenticate, adminOnly, validate(sendSchema), sendNotification);
router.post('/broadcast', authenticate, adminOnly, validate(broadcastSchema), broadcastNotification);

module.exports = router;
