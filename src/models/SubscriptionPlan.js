const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Plan name is required'],
    trim: true,
    unique: true,
    maxlength: [50, 'Plan name cannot exceed 50 characters']
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    enum: ['free', 'basic', 'pro', 'enterprise']
  },
  type: {
    type: String,
    required: true,
    enum: ['individual', 'enterprise'],
    default: 'individual'
  },
  description: {
    type: String,
    trim: true,
    maxlength: [300, 'Description cannot exceed 300 characters']
  },
  price: {
    monthly: { type: Number, default: 0, min: 0 },
    annual: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR', maxlength: 10 }
  },
  features: {
    // Room = Match (1 room : 1 match). When the match ends, the room ends too.
    // maxRooms = max rooms (matches) the user can CREATE per calendar month. -1 = unlimited.
    maxRooms: { type: Number, default: 3 },
    maxPlayersPerRoom: { type: Number, default: 22 },
    maxTournaments: { type: Number, default: 0 },         // -1 = unlimited
    canUseTools: { type: Boolean, default: false },
    canUploadLogo: { type: Boolean, default: false },
    adsEnabled: { type: Boolean, default: true },         // false = no ads shown to this user
    canManageAcademy: { type: Boolean, default: false },  // enterprise only
    maxAcademyMembers: { type: Number, default: 0 },      // enterprise only; -1 = unlimited
    analyticsAccess: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
    customBranding: { type: Boolean, default: false },
    apiAccess: { type: Boolean, default: false },
    exportData: { type: Boolean, default: false }
  },
  isActive: { type: Boolean, default: true },
  displayOrder: { type: Number, default: 0 },
  badge: { type: String, trim: true, maxlength: 30 },    // 'Popular', 'Best Value'
  color: { type: String, trim: true, maxlength: 20 }     // theme color hex
}, {
  timestamps: true
});

subscriptionPlanSchema.index({ slug: 1 });
subscriptionPlanSchema.index({ isActive: 1, displayOrder: 1 });

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
