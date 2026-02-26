const auditService = require('../services/auditService');

/**
 * Factory that returns an Express middleware which auto-logs admin actions
 * after a successful response (body.success === true).
 *
 * @param {string} action   - AuditLog action enum value (e.g. 'user_banned')
 * @param {string} category - AuditLog category enum value (e.g. 'users')
 * @param {object} opts     - Static overrides: { severity, targetType, getTargetId, getTargetLabel }
 *   getTargetId(req)    - fn to extract targetId from req (default: req.params.id)
 *   getTargetLabel(req) - fn to extract a human label (default: null)
 */
const createAuditMiddleware = (action, category, opts = {}) => {
  const {
    severity = 'info',
    targetType = null,
    getTargetId = (req) => req.params.id || null,
    getTargetLabel = () => null,
    getDescription = (req) => `Admin action: ${action}`,
  } = opts;

  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      // Only log on success responses
      if (body && body.success) {
        auditService.logAction(req, {
          action,
          category,
          targetType,
          targetId: getTargetId(req),
          targetLabel: getTargetLabel(req),
          description: getDescription(req),
          severity,
        }).catch(() => {}); // fire-and-forget, errors already handled inside logAction
      }
      return originalJson(body);
    };

    next();
  };
};

module.exports = { createAuditMiddleware };
