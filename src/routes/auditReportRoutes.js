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
// Mounted at /api/v1/admin/audit
// ============================================

/**
 * @swagger
 * /api/v1/admin/audit/audit-logs:
 *   get:
 *     summary: List all audit logs (admin)
 *     description: Returns paginated admin audit trail — every sensitive action taken by admins or the system. Filter by category, severity, actor, or date range.
 *     tags: [Admin - Audit & Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [user_management, match_management, subscription, announcement, system, authentication, report]
 *         description: Filter by action category
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *         description: Specific action name (e.g. ban_user, delete_match)
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [info, warning, critical]
 *         description: Filter by severity level
 *       - in: query
 *         name: actorEmail
 *         schema: { type: string }
 *         description: Filter by the admin's email who performed the action
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date-time }
 *         description: Start of date range (ISO 8601)
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date-time }
 *         description: End of date range (ISO 8601)
 *       - $ref: '#/components/parameters/SearchQuery'
 *     responses:
 *       200:
 *         description: Paginated audit log list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/AuditLog' }
 *                 pagination: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/audit-logs', authenticate, adminOnly, getAuditLogs);

/**
 * @swagger
 * /api/v1/admin/audit/audit-logs/stats:
 *   get:
 *     summary: Get audit log statistics
 *     description: Returns aggregate counts — total logs today, by category, by severity, most active admins.
 *     tags: [Admin - Audit & Reports]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Audit log statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalToday:      { type: integer, example: 42 }
 *                     totalThisWeek:   { type: integer, example: 310 }
 *                     criticalCount:   { type: integer, example: 5 }
 *                     byCategory:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           category: { type: string }
 *                           count:    { type: integer }
 *                     bySeverity:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           severity: { type: string }
 *                           count:    { type: integer }
 *                     topActors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           actorEmail: { type: string }
 *                           count:      { type: integer }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/audit-logs/stats', authenticate, adminOnly, getAuditStats);

// ============================================
// REPORT ROUTES (Admin only)
// Mounted at /api/v1/admin/audit
// ============================================

/**
 * @swagger
 * /api/v1/admin/audit/reports:
 *   get:
 *     summary: List all user-submitted reports (admin)
 *     description: Returns paginated reports submitted by users. Filter by status, priority, targetType, and reason.
 *     tags: [Admin - Audit & Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, under_review, resolved, dismissed, escalated]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *       - in: query
 *         name: targetType
 *         schema:
 *           type: string
 *           enum: [user, match, room, chat_message]
 *       - in: query
 *         name: reason
 *         schema:
 *           type: string
 *           enum: [abusive_behavior, cheating, match_fixing, fake_scoring, harassment, spam, inappropriate_content, impersonation, unfair_play, other]
 *     responses:
 *       200:
 *         description: Paginated report list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Report' }
 *                 pagination: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/reports', authenticate, adminOnly, getReports);

/**
 * @swagger
 * /api/v1/admin/audit/reports/stats:
 *   get:
 *     summary: Get report statistics
 *     description: Returns aggregate report counts — pending, under_review, resolved today, by reason, by targetType.
 *     tags: [Admin - Audit & Reports]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Report statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     pending:        { type: integer, example: 12 }
 *                     underReview:    { type: integer, example: 5 }
 *                     resolvedToday:  { type: integer, example: 3 }
 *                     totalThisWeek:  { type: integer, example: 47 }
 *                     byReason:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           reason: { type: string }
 *                           count:  { type: integer }
 *                     byTargetType:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           targetType: { type: string }
 *                           count:      { type: integer }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/reports/stats', authenticate, adminOnly, getReportStats);

/**
 * @swagger
 * /api/v1/admin/audit/reports/{id}:
 *   get:
 *     summary: Get a single report by ID (admin)
 *     description: Returns full report details including evidence items, reporter info, and resolution history.
 *     tags: [Admin - Audit & Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Report details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Report' }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/reports/:id', authenticate, adminOnly, getReportById);

/**
 * @swagger
 * /api/v1/admin/audit/reports/{id}:
 *   put:
 *     summary: Update report status or resolution (admin)
 *     description: Allows admins to change the status, assign to another admin, set priority, or record a resolution action and notes.
 *     tags: [Admin - Audit & Reports]
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
 *               status:
 *                 type: string
 *                 enum: [pending, under_review, resolved, dismissed, escalated]
 *                 example: resolved
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *               assignedTo:
 *                 type: string
 *                 description: Admin user ID to assign the report to
 *               resolutionAction:
 *                 type: string
 *                 enum: [no_action, warning_issued, user_banned, match_voided, content_removed]
 *                 example: warning_issued
 *               resolutionNotes:
 *                 type: string
 *                 maxLength: 2000
 *                 example: User has been issued a formal warning for abusive behaviour.
 *     responses:
 *       200:
 *         description: Report updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Report' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put('/reports/:id', authenticate, adminOnly, validate(updateReportSchema), updateReport);

// ============================================
// USER REPORT SUBMISSION (non-admin)
// Mounted at /api/v1/reports
// ============================================

/**
 * @swagger
 * /api/v1/reports/user-report:
 *   post:
 *     summary: Submit a report against a user, match, room, or message
 *     description: Any authenticated user can submit a report. The report enters the queue as 'pending' for admin review. Attach up to 5 evidence items.
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetType, targetId, reason, description]
 *             properties:
 *               targetType:
 *                 type: string
 *                 enum: [user, match, room, chat_message]
 *                 example: user
 *               targetId:
 *                 type: string
 *                 description: ObjectId of the entity being reported
 *                 example: 64f1a2b3c4d5e6f7a8b9c0d1
 *               reason:
 *                 type: string
 *                 enum: [abusive_behavior, cheating, match_fixing, fake_scoring, harassment, spam, inappropriate_content, impersonation, unfair_play, other]
 *                 example: cheating
 *               description:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 2000
 *                 example: This player was entering false scores during our match.
 *               evidence:
 *                 type: array
 *                 maxItems: 5
 *                 description: Optional supporting evidence — screenshots, match IDs, or text notes
 *                 items:
 *                   type: object
 *                   required: [type, value]
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [screenshot_url, match_id, text]
 *                       example: match_id
 *                     value:
 *                       type: string
 *                       maxLength: 1000
 *                       example: 64f1a2b3c4d5e6f7a8b9c0d2
 *     responses:
 *       201:
 *         description: Report submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string, example: Report submitted. Our team will review it shortly. }
 *                 data: { $ref: '#/components/schemas/Report' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/user-report', authenticate, validate(submitReportSchema), submitReport);

module.exports = router;
