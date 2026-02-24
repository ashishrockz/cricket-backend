const mongoose = require('mongoose');

const adImpressionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  timestamp: { type: Date, default: Date.now },
  placement: { type: String },
  platform: { type: String, enum: ['ios', 'android', 'web'], default: 'android' }
}, { _id: false });

const adSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Ad title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  type: {
    type: String,
    required: true,
    enum: ['banner', 'interstitial', 'native', 'video', 'popup'],
    default: 'banner'
  },
  placement: {
    type: String,
    required: true,
    enum: [
      'home_top',
      'home_bottom',
      'home_mid',
      'match_pre',
      'match_between_overs',
      'match_scorecard',
      'tools_page',
      'profile_page',
      'search_page',
      'leaderboard_page',
      'tournament_page',
      'room_list'
    ]
  },
  mediaUrl: {
    type: String,
    required: [true, 'Media URL is required'],
    trim: true
  },
  thumbnailUrl: { type: String, trim: true, default: null },
  targetUrl: {
    type: String,
    trim: true,
    required: [true, 'Target URL is required']
  },
  advertiser: {
    name: { type: String, trim: true, required: true, maxlength: 100 },
    logo: { type: String, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true }
  },
  targeting: {
    cities: [{ type: String, trim: true }],
    planTypes: [{                                         // which subscription plans see this ad
      type: String,
      enum: ['free', 'basic']                            // pro/enterprise users never see ads
    }],
    playingRoles: [{ type: String }]
  },
  schedule: {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    startTime: { type: String, default: '00:00' },       // HH:mm
    endTime: { type: String, default: '23:59' },
    daysOfWeek: [{ type: Number, min: 0, max: 6 }]      // 0=Sun, 6=Sat; empty = all days
  },
  frequency: {
    maxShowsPerUserPerDay: { type: Number, default: 3 },
    minIntervalMinutes: { type: Number, default: 30 }
  },
  stats: {
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    uniqueUsers: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 }                    // click-through rate (%)
  },
  recentImpressions: {
    type: [adImpressionSchema],
    select: false
  },
  status: {
    type: String,
    enum: ['draft', 'pending_review', 'active', 'paused', 'completed', 'rejected'],
    default: 'draft'
  },
  rejectionReason: { type: String, trim: true, maxlength: 300 },
  priority: { type: Number, default: 5, min: 1, max: 10 },  // higher = shown first
  budget: {
    total: { type: Number, default: 0 },
    spent: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' }
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null }
}, {
  timestamps: true
});

adSchema.index({ status: 1, placement: 1 });
adSchema.index({ 'schedule.startDate': 1, 'schedule.endDate': 1 });
adSchema.index({ priority: -1 });
adSchema.index({ 'targeting.planTypes': 1 });
adSchema.index({ createdBy: 1 });

// Update CTR on impression/click update
adSchema.methods.updateCTR = function () {
  if (this.stats.impressions > 0) {
    this.stats.ctr = parseFloat(((this.stats.clicks / this.stats.impressions) * 100).toFixed(2));
  }
};

module.exports = mongoose.model('Ad', adSchema);
