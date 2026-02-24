const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  body: {
    type: String,
    required: [true, 'Body is required'],
    trim: true,
    maxlength: [5000, 'Body cannot exceed 5000 characters']
  },
  type: {
    type: String,
    enum: ['info', 'warning', 'update', 'maintenance', 'promotion', 'event'],
    default: 'info'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
    index: true
  },
  audience: {
    type: String,
    enum: ['all', 'active_users', 'new_users', 'premium_users', 'specific_city'],
    default: 'all'
  },
  audienceFilter: {
    cities: [{ type: String }],
    minMatches: { type: Number, default: null },
    registeredAfter: { type: Date, default: null }
  },
  scheduledAt: {
    type: Date,
    default: null
  },
  publishedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  showAsBanner: {
    type: Boolean,
    default: false
  },
  actionUrl: {
    type: String,
    default: null,
    maxlength: 500
  },
  actionLabel: {
    type: String,
    default: null,
    maxlength: 50
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  stats: {
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    dismissals: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Indexes
announcementSchema.index({ status: 1, publishedAt: -1 });
announcementSchema.index({ status: 1, isPinned: -1, publishedAt: -1 });
announcementSchema.index({ scheduledAt: 1, status: 1 });

module.exports = mongoose.model('Announcement', announcementSchema);
