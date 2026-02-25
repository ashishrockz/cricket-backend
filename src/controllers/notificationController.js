const Notification = require('../models/Notification');
const User = require('../models/User');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, buildPaginationResponse } = require('../utils/pagination');
const { logAction } = require('../services/auditService');
const { getIO } = require('../socket/socketManager');

/** POST /api/v1/admin/notifications/send — send to specific user */
const sendNotification = asyncHandler(async (req, res, next) => {
  const { recipientId, title, body, type, actionUrl, imageUrl } = req.body;
  const user = await User.findById(recipientId);
  if (!user) return next(ApiError.notFound('Recipient not found'));

  const notification = await Notification.create({
    recipient: recipientId, title, body,
    type: type || 'custom',
    actionUrl, imageUrl,
    sentBy: req.user._id,
    deliveryStatus: 'sent',
    deliveredAt: new Date()
  });

  try {
    const io = getIO();
    io.to(`user:${recipientId}`).emit('notification', { id: notification._id, title, body, type: notification.type, actionUrl, createdAt: notification.createdAt });
    notification.deliveryStatus = 'delivered';
    await notification.save();
  } catch { /* socket offline */ }

  await logAction(req, { action: 'notification_sent', category: 'notifications', targetType: 'user', targetId: recipientId, targetLabel: user.username, description: `Sent notification to ${user.username}: ${title}` });

  ApiResponse.created(res, { notification }, 'Notification sent');
});

/** POST /api/v1/admin/notifications/broadcast — send to segment */
const broadcastNotification = asyncHandler(async (req, res) => {
  const { title, body, type, audience, filter: audienceFilter, actionUrl, imageUrl } = req.body;

  // Build user query based on audience
  const userQuery = { isActive: true, isBanned: false };
  if (audience === 'inactive_users') {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    userQuery.lastLogin = { $lt: monthAgo };
    delete userQuery.isActive;
  } else if (audience === 'by_city' && audienceFilter?.city) {
    userQuery.city = audienceFilter.city;
  } else if (audience === 'by_role' && audienceFilter?.role) {
    userQuery.role = audienceFilter.role;
  }
  // 'all' and 'active_users' use default query

  const recipientCount = await User.countDocuments(userQuery);
  if (recipientCount === 0) {
    return ApiResponse.success(res, { recipientCount: 0 }, 'No matching users found');
  }

  // Create bulk notification record
  const notification = await Notification.create({
    isBulk: true, bulkAudience: audience,
    bulkFilter: audienceFilter || null,
    title, body, type: type || 'system',
    actionUrl, imageUrl,
    sentBy: req.user._id,
    deliveryStatus: 'sent', deliveredAt: new Date(),
    recipientCount
  });

  // Broadcast via Socket.IO
  try {
    const io = getIO();
    if (audience === 'all' || audience === 'active_users') {
      io.emit('notification', { id: notification._id, title, body, type: notification.type, actionUrl, isBulk: true, createdAt: notification.createdAt });
    } else {
      // For targeted audiences, fetch user IDs and emit individually
      const users = await User.find(userQuery).select('_id').lean();
      users.forEach(u => {
        io.to(`user:${u._id}`).emit('notification', { id: notification._id, title, body, type: notification.type, actionUrl, createdAt: notification.createdAt });
      });
    }
    notification.deliveryStatus = 'delivered';
    await notification.save();
  } catch { /* socket not ready */ }

  await logAction(req, { action: 'notification_bulk_sent', category: 'notifications', description: `Broadcast to ${audience} (${recipientCount} users): ${title}`, severity: 'warning', metadata: { audience, recipientCount } });

  ApiResponse.created(res, { notification, recipientCount }, 'Broadcast sent');
});

/** GET /api/v1/admin/notifications */
const listNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { type, isBulk } = req.query;

  const filter = {};
  if (type) filter.type = type;
  if (isBulk !== undefined) filter.isBulk = isBulk === 'true';

  const [notifications, totalDocs] = await Promise.all([
    Notification.find(filter)
      .populate('sentBy', 'username fullName')
      .populate('recipient', 'username fullName')
      .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, notifications, buildPaginationResponse(page, limit, totalDocs));
});

/** GET /api/v1/admin/notifications/stats */
const getNotificationStats = asyncHandler(async (req, res) => {
  const [total, byType, byStatus, recentBroadcasts] = await Promise.all([
    Notification.countDocuments(),
    Notification.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
    Notification.aggregate([{ $group: { _id: '$deliveryStatus', count: { $sum: 1 } } }]),
    Notification.find({ isBulk: true }).sort({ createdAt: -1 }).limit(5)
      .populate('sentBy', 'username fullName').lean()
  ]);

  const totalRecipients = await Notification.aggregate([
    { $match: { isBulk: true } },
    { $group: { _id: null, total: { $sum: '$recipientCount' } } }
  ]);

  ApiResponse.success(res, { total, byType, byStatus, recentBroadcasts, totalRecipientsReached: totalRecipients[0]?.total || 0 });
});

// ============================================
// USER-FACING NOTIFICATION APIs
// ============================================

/** GET /api/v1/notifications/me */
const getMyNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = {
    $or: [
      { recipient: req.user._id },
      { isBulk: true, bulkAudience: 'all' }
    ],
    ...(req.query.unreadOnly === 'true' ? { isRead: false } : {})
  };
  const [notifications, totalDocs] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter)
  ]);
  ApiResponse.paginated(res, notifications, buildPaginationResponse(page, limit, totalDocs));
});

/** GET /api/v1/notifications/unread-count */
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    $or: [{ recipient: req.user._id }, { isBulk: true, bulkAudience: 'all' }],
    isRead: false
  });
  ApiResponse.success(res, { count });
});

/** PATCH /api/v1/notifications/:id/read */
const markAsRead = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    $or: [{ recipient: req.user._id }, { isBulk: true }]
  });
  if (!notification) return next(ApiError.notFound('Notification not found'));
  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();
  ApiResponse.success(res, { notification }, 'Marked as read');
});

/** POST /api/v1/notifications/mark-all-read */
const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { $or: [{ recipient: req.user._id }, { isBulk: true, bulkAudience: 'all' }], isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  ApiResponse.success(res, null, 'All notifications marked as read');
});

module.exports = {
  sendNotification, broadcastNotification, listNotifications, getNotificationStats,
  getMyNotifications, getUnreadCount, markAsRead, markAllRead
};
