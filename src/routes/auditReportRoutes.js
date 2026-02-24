const router = require('express').Router();
const { authenticate, adminOnly } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const Joi = require('joi');
const {
  getAuditLogs, getAuditStats,
  getReports, getReportStats, getReportById, updateReport, submitReport
} = require('../controllers/auditReportController');

// ============================================
// Validators
// ============================================
const updateReportSchema = Joi.object({
  status: Joi.string().valid('pending', 'under_review', 'resolved', 'dismissed', 'escalated'),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical'),
  assignedTo: Joi.string().hex().length(24),
  resolutionAction: Joi.string().valid('no_action', 'warning_issued', 'user_banned', 'match_voided', 'content_removed'),
  resolutionNotes: Joi.string().max(2000)
});

const submitReportSchema = Joi.object({
  targetType: Joi.string().valid('user', 'match', 'room', 'chat_message').required(),
  targetId: Joi.string().hex().length(24).required(),
  reason: Joi.string().valid('abusive_behavior', 'cheating', 'match_fixing', 'fake_scoring', 'harassment', 'spam', 'inappropriate_content', 'impersonation', 'unfair_play', 'other').required(),
  description: Joi.string().min(10).max(2000).required(),
  evidence: Joi.array().items(Joi.object({
    type: Joi.string().valid('screenshot_url', 'match_id', 'text').required(),
    value: Joi.string().max(1000).required()
  })).max(5)
});

// ============================================
// AUDIT LOG ROUTES (Admin only)
// ============================================

/**
 * @swagger
 * /api/v1/admin/audit-logs:
 *   get:
 *     tags: [Audit & Reports]
 *     summary: Get audit logs
 *     security: [{ BearerAuth: [] }]
 */
router.get('/audit-logs', authenticate, adminOnly, getAuditLogs);

/**
 * @swagger
 * /api/v1/admin/audit-logs/stats:
 *   get:
 *     tags: [Audit & Reports]
 *     summary: Get audit log statistics
 */
router.get('/audit-logs/stats', authenticate, adminOnly, getAuditStats);

// ============================================
// REPORT ROUTES
// ============================================

/**
 * @swagger
 * /api/v1/admin/reports:
 *   get:
 *     tags: [Audit & Reports]
 *     summary: Get all reports (admin)
 */
router.get('/reports', authenticate, adminOnly, getReports);

/**
 * @swagger
 * /api/v1/admin/reports/stats:
 *   get:
 *     tags: [Audit & Reports]
 *     summary: Get report statistics
 */
router.get('/reports/stats', authenticate, adminOnly, getReportStats);

/**
 * @swagger
 * /api/v1/admin/reports/{id}:
 *   get:
 *     tags: [Audit & Reports]
 *     summary: Get report by ID
 */
router.get('/reports/:id', authenticate, adminOnly, getReportById);

/**
 * @swagger
 * /api/v1/admin/reports/{id}:
 *   put:
 *     tags: [Audit & Reports]
 *     summary: Update report status/resolution
 */
router.put('/reports/:id', authenticate, adminOnly, validate(updateReportSchema), updateReport);

// ============================================
// USER REPORT SUBMISSION (non-admin)
// ============================================

/**
 * @swagger
 * /api/v1/reports:
 *   post:
 *     tags: [Reports]
 *     summary: Submit a report (any authenticated user)
 */
router.post('/user-report', authenticate, validate(submitReportSchema), submitReport);

module.exports = router;
