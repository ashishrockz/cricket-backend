const Announcement = require('../models/Announcement');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, buildPaginationResponse } = require('../utils/pagination');
const { logAction } = require('../services/auditService');
const { getIO } = require('../socket/socketManager');

const listAnnouncements = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { status, type, priority } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (priority) filter.priority = priority;

  const [announcements, totalDocs] = await Promise.all([
    Announcement.find(filter).populate('createdBy', 'username fullName')
      .sort({ isPinned: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Announcement.countDocuments(filter)
  ]);
  ApiResponse.paginated(res, announcements, buildPaginationResponse(page, limit, totalDocs));
});

const getAnnouncementById = asyncHandler(async (req, res, next) => {
  const a = await Announcement.findById(req.params.id).populate('createdBy', 'username fullName email');
  if (!a) return next(ApiError.notFound('Announcement not found'));
  ApiResponse.success(res, { announcement: a });
});

const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, body, type, priority, audience, audienceFilter, scheduledAt, expiresAt, isPinned, showAsBanner, actionUrl, actionLabel } = req.body;
  const announcement = await Announcement.create({
    title, body, type, priority, audience,
    audienceFilter: audienceFilter || {},
    scheduledAt: scheduledAt || null, expiresAt: expiresAt || null,
    isPinned: isPinned || false, showAsBanner: showAsBanner || false,
    actionUrl, actionLabel, createdBy: req.user._id
  });
  await logAction(req, { action: 'announcement_created', category: 'announcements', targetType: 'announcement', targetId: announcement._id, targetLabel: title, description: `Created announcement: ${title}` });
  ApiResponse.created(res, { announcement }, 'Announcement created');
});

const updateAnnouncement = asyncHandler(async (req, res, next) => {
  const a = await Announcement.findById(req.params.id);
  if (!a) return next(ApiError.notFound('Announcement not found'));
  const fields = ['title', 'body', 'type', 'priority', 'audience', 'audienceFilter', 'scheduledAt', 'expiresAt', 'isPinned', 'showAsBanner', 'actionUrl', 'actionLabel'];
  fields.forEach(f => { if (req.body[f] !== undefined) a[f] = req.body[f]; });
  a.updatedBy = req.user._id;
  await a.save();
  await logAction(req, { action: 'announcement_updated', category: 'announcements', targetType: 'announcement', targetId: a._id, description: `Updated: ${a.title}` });
  ApiResponse.success(res, { announcement: a }, 'Announcement updated');
});

const publishAnnouncement = asyncHandler(async (req, res, next) => {
  const a = await Announcement.findById(req.params.id);
  if (!a) return next(ApiError.notFound('Announcement not found'));
  if (a.status === 'published') return next(ApiError.badRequest('Already published'));
  a.status = 'published';
  a.publishedAt = new Date();
  await a.save();
  try {
    const io = getIO();
    io.emit('announcement', { id: a._id, title: a.title, body: a.body, type: a.type, priority: a.priority, showAsBanner: a.showAsBanner, actionUrl: a.actionUrl, actionLabel: a.actionLabel, publishedAt: a.publishedAt });
  } catch { /* socket not ready */ }
  await logAction(req, { action: 'announcement_published', category: 'announcements', targetType: 'announcement', targetId: a._id, description: `Published: ${a.title}`, severity: 'warning' });
  ApiResponse.success(res, { announcement: a }, 'Announcement published');
});

const archiveAnnouncement = asyncHandler(async (req, res, next) => {
  const a = await Announcement.findById(req.params.id);
  if (!a) return next(ApiError.notFound('Announcement not found'));
  a.status = 'archived';
  await a.save();
  await logAction(req, { action: 'announcement_archived', category: 'announcements', targetType: 'announcement', targetId: a._id, description: `Archived: ${a.title}` });
  ApiResponse.success(res, { announcement: a }, 'Announcement archived');
});

const deleteAnnouncement = asyncHandler(async (req, res, next) => {
  const a = await Announcement.findById(req.params.id);
  if (!a) return next(ApiError.notFound('Announcement not found'));
  await a.deleteOne();
  await logAction(req, { action: 'announcement_deleted', category: 'announcements', targetType: 'announcement', targetId: a._id, targetLabel: a.title, description: `Deleted: ${a.title}`, severity: 'warning' });
  ApiResponse.noContent(res);
});

const getActiveAnnouncements = asyncHandler(async (req, res) => {
  const now = new Date();
  const announcements = await Announcement.find({
    status: 'published',
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
  }).select('title body type priority isPinned showAsBanner actionUrl actionLabel publishedAt')
    .sort({ isPinned: -1, publishedAt: -1 }).limit(10).lean();
  ApiResponse.success(res, { announcements });
});

module.exports = { listAnnouncements, getAnnouncementById, createAnnouncement, updateAnnouncement, publishAnnouncement, archiveAnnouncement, deleteAnnouncement, getActiveAnnouncements };
