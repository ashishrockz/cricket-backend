const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  isBulk: { type: Boolean, default: false },
  bulkAudience: {
    type: String,
    enum: ['all', 'active_users', 'inactive_users', 'by_city', 'by_role', null],
    default: null
  },
  bulkFilter: { type: mongoose.Schema.Types.Mixed, default: null },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: 200
  },
  body: {
    type: String,
    required: [true, 'Body is required'],
    trim: true,
    maxlength: 1000
  },
  type: {
    type: String,
    enum: ['system', 'match', 'tournament', 'friend', 'announcement', 'promotion', 'warning', 'custom'],
    default: 'system'
  },
  actionUrl: { type: String, default: null, maxlength: 500 },
  imageUrl: { type: String, default: null },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deliveryStatus: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed'],
    default: 'pending'
  },
  deliveredAt: { type: Date, default: null },
  recipientCount: { type: Number, default: 1 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: true
});

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ isBulk: 1, createdAt: -1 });
notificationSchema.index({ sentBy: 1, createdAt: -1 });
notificationSchema.index({ deliveryStatus: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
