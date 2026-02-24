const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

/**
 * Create an audit log entry. Call from any controller after an admin action.
 * @param {object} req - Express request (for actor, IP, user-agent)
 * @param {object} opts
 */
const logAction = async (req, {
  action, category, targetType = null, targetId = null, targetLabel = null,
  description, metadata = {}, previousState = null, newState = null,
  severity = 'info'
}) => {
  try {
    await AuditLog.create({
      actor: req.user._id,
      actorEmail: req.user.email,
      action,
      category,
      targetType,
      targetId,
      targetLabel,
      description,
      metadata,
      previousState,
      newState,
      ipAddress: req.ip || req.connection?.remoteAddress || null,
      userAgent: req.headers?.['user-agent'] || null,
      severity
    });
  } catch (err) {
    logger.error(`Audit log write failed: ${err.message}`);
  }
};

module.exports = { logAction };
