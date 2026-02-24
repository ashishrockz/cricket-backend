const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  targetType: {
    type: String,
    enum: ['user', 'match', 'room', 'chat_message'],
    required: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  targetLabel: {
    type: String,
    maxlength: 200
  },
  reason: {
    type: String,
    required: true,
    enum: [
      'abusive_behavior', 'cheating', 'match_fixing',
      'fake_scoring', 'harassment', 'spam',
      'inappropriate_content', 'impersonation',
      'unfair_play', 'other'
    ]
  },
  description: {
    type: String,
    required: [true, 'Please describe the issue'],
    minlength: [10, 'Description must be at least 10 characters'],
    maxlength: [2000, 'Description cannot exceed 2000 characters'],
    trim: true
  },
  evidence: [{
    type: { type: String, enum: ['screenshot_url', 'match_id', 'text'], required: true },
    value: { type: String, required: true, maxlength: 1000 }
  }],
  status: {
    type: String,
    enum: ['pending', 'under_review', 'resolved', 'dismissed', 'escalated'],
    default: 'pending',
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolution: {
    action: {
      type: String,
      enum: ['no_action', 'warning_issued', 'user_banned', 'match_voided', 'content_removed', null],
      default: null
    },
    notes: { type: String, maxlength: 2000, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null }
  },
  isAutoFlagged: {
    type: Boolean,
    default: false
  },
  flagScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, {
  timestamps: true
});

// Indexes
reportSchema.index({ status: 1, priority: -1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1 });
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ assignedTo: 1, status: 1 });

// Prevent duplicate reports from same user for same target
reportSchema.index(
  { reporter: 1, targetType: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'under_review'] } } }
);

// Virtual: is open
reportSchema.virtual('isOpen').get(function () {
  return ['pending', 'under_review', 'escalated'].includes(this.status);
});

module.exports = mongoose.model('Report', reportSchema);
