const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  actorEmail: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      // User actions
      'user_banned', 'user_unbanned', 'user_deleted', 'user_role_changed',
      'user_activated', 'user_deactivated',
      // Match actions
      'match_abandoned', 'match_deleted',
      // Room actions
      'room_cancelled', 'room_deleted',
      // Tournament actions
      'tournament_created', 'tournament_updated', 'tournament_cancelled',
      'tournament_started', 'tournament_completed',
      // Announcement actions
      'announcement_created', 'announcement_updated', 'announcement_deleted',
      'announcement_published', 'announcement_archived',
      // Notification actions
      'notification_sent', 'notification_bulk_sent',
      // Report actions
      'report_reviewed', 'report_resolved', 'report_dismissed',
      // System actions
      'settings_updated', 'maintenance_toggled', 'feature_flag_toggled',
      // Auth actions
      'admin_login', 'admin_logout', 'password_changed',
      // Generic
      'other'
    ],
    index: true
  },
  category: {
    type: String,
    enum: ['users', 'matches', 'rooms', 'tournaments', 'announcements', 'notifications', 'reports', 'system', 'auth'],
    required: true,
    index: true
  },
  targetType: {
    type: String,
    enum: ['user', 'match', 'room', 'tournament', 'announcement', 'report', 'system', null],
    default: null
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  targetLabel: {
    type: String,
    default: null,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  previousState: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  newState: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null,
    maxlength: 500
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });

// Static: create log entry
auditLogSchema.statics.log = async function (data) {
  return this.create(data);
};

// Static: get logs for a specific target
auditLogSchema.statics.getTargetHistory = async function (targetType, targetId, limit = 50) {
  return this.find({ targetType, targetId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('actor', 'username fullName email')
    .lean();
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
