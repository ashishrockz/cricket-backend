const AuditLog = require('../models/AuditLog');
const Report = require('../models/Report');
const User = require('../models/User');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, buildPaginationResponse } = require('../utils/pagination');
const { logAction } = require('../services/auditService');

// =============================================
// AUDIT LOGS
// =============================================

/** GET /api/v1/admin/audit-logs */
const getAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { category, action, severity, actorId, startDate, endDate } = req.query;

  const filter = {};
  if (category) filter.category = category;
  if (action) filter.action = action;
  if (severity) filter.severity = severity;
  if (actorId) filter.actor = actorId;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const [logs, totalDocs] = await Promise.all([
    AuditLog.find(filter)
      .populate('actor', 'username fullName email avatar')
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, logs, buildPaginationResponse(page, limit, totalDocs));
});

/** GET /api/v1/admin/audit-logs/stats */
const getAuditStats = asyncHandler(async (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalLogs, byCategory, bySeverity, recentTrend] = await Promise.all([
    AuditLog.countDocuments(),
    AuditLog.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    AuditLog.aggregate([
      { $group: { _id: '$severity', count: { $sum: 1 } } }
    ]),
    AuditLog.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])
  ]);

  ApiResponse.success(res, { totalLogs, byCategory, bySeverity, recentTrend });
});

// =============================================
// REPORTS / FLAGS
// =============================================

/** GET /api/v1/admin/reports */
const getReports = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { status, priority, reason, targetType } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (reason) filter.reason = reason;
  if (targetType) filter.targetType = targetType;

  const [reports, totalDocs] = await Promise.all([
    Report.find(filter)
      .populate('reporter', 'username fullName avatar')
      .populate('assignedTo', 'username fullName')
      .populate('resolution.resolvedBy', 'username fullName')
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip).limit(limit).lean(),
    Report.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, reports, buildPaginationResponse(page, limit, totalDocs));
});

/** GET /api/v1/admin/reports/stats */
const getReportStats = asyncHandler(async (req, res) => {
  const [total, byStatus, byPriority, byReason] = await Promise.all([
    Report.countDocuments(),
    Report.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Report.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
    Report.aggregate([
      { $match: { status: { $in: ['pending', 'under_review'] } } },
      { $group: { _id: '$reason', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ])
  ]);

  const open = byStatus.filter(s => ['pending', 'under_review', 'escalated'].includes(s._id))
    .reduce((sum, s) => sum + s.count, 0);

  ApiResponse.success(res, { total, open, byStatus, byPriority, byReason });
});

/** GET /api/v1/admin/reports/:id */
const getReportById = asyncHandler(async (req, res, next) => {
  const report = await Report.findById(req.params.id)
    .populate('reporter', 'username fullName email avatar')
    .populate('assignedTo', 'username fullName')
    .populate('resolution.resolvedBy', 'username fullName');

  if (!report) return next(ApiError.notFound('Report not found'));
  ApiResponse.success(res, { report });
});

/** PUT /api/v1/admin/reports/:id — update status, assign, resolve */
const updateReport = asyncHandler(async (req, res, next) => {
  const { status, priority, assignedTo, resolutionAction, resolutionNotes } = req.body;

  const report = await Report.findById(req.params.id);
  if (!report) return next(ApiError.notFound('Report not found'));

  const previous = { status: report.status, priority: report.priority };

  if (status) report.status = status;
  if (priority) report.priority = priority;
  if (assignedTo) report.assignedTo = assignedTo;

  if (resolutionAction) {
    report.resolution = {
      action: resolutionAction,
      notes: resolutionNotes || null,
      resolvedBy: req.user._id,
      resolvedAt: new Date()
    };
    if (!status) report.status = 'resolved';
  }

  await report.save();

  // If resolved with ban, actually ban the user
  if (resolutionAction === 'user_banned' && report.targetType === 'user') {
    await User.findByIdAndUpdate(report.targetId, { isBanned: true, refreshToken: null });
    await logAction(req, {
      action: 'user_banned',
      category: 'users',
      targetType: 'user',
      targetId: report.targetId,
      description: `User banned via report resolution (Report #${report._id})`,
      severity: 'critical'
    });
  }

  await logAction(req, {
    action: 'report_reviewed',
    category: 'reports',
    targetType: 'report',
    targetId: report._id,
    description: `Report ${status || 'updated'}: ${report.reason}`,
    previousState: previous,
    newState: { status: report.status, priority: report.priority }
  });

  ApiResponse.success(res, { report }, 'Report updated');
});

/** POST /api/v1/reports — user submits a report (non-admin) */
const submitReport = asyncHandler(async (req, res, next) => {
  const { targetType, targetId, reason, description, evidence } = req.body;

  // Check for existing open report by same user
  const existing = await Report.findOne({
    reporter: req.user._id,
    targetType,
    targetId,
    status: { $in: ['pending', 'under_review'] }
  });
  if (existing) {
    return next(ApiError.conflict('You already have an open report for this item'));
  }

  let targetLabel = null;
  if (targetType === 'user') {
    const u = await User.findById(targetId);
    targetLabel = u ? u.username : null;
  }

  // Auto-set priority based on reason
  let priority = 'medium';
  if (['match_fixing', 'cheating'].includes(reason)) priority = 'high';
  if (['harassment', 'abusive_behavior'].includes(reason)) priority = 'high';

  const report = await Report.create({
    reporter: req.user._id,
    targetType,
    targetId,
    targetLabel,
    reason,
    description,
    evidence: evidence || [],
    priority
  });

  ApiResponse.created(res, { report }, 'Report submitted successfully');
});

module.exports = {
  getAuditLogs, getAuditStats,
  getReports, getReportStats, getReportById, updateReport, submitReport
};
