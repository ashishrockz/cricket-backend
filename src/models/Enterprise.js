const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: {
    type: String,
    enum: ['owner', 'admin', 'coach', 'player', 'support_staff', 'viewer'],
    default: 'player'
  },
  joinedAt: { type: Date, default: Date.now },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true }
}, { _id: false });

const enterpriseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Academy name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  logo: { type: String, default: null },      // URL or base64
  banner: { type: String, default: null },    // URL or base64
  type: {
    type: String,
    enum: ['cricket_academy', 'club', 'school', 'college', 'corporate', 'state_association', 'district_association', 'other'],
    default: 'cricket_academy'
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [memberSchema],
  contact: {
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    website: { type: String, trim: true }
  },
  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' },
    pincode: { type: String, trim: true }
  },
  settings: {
    maxMembers: { type: Number, default: 50 },
    isPublic: { type: Boolean, default: true },
    allowMemberInvites: { type: Boolean, default: false },
    joinRequiresApproval: { type: Boolean, default: true }
  },
  stats: {
    totalMembers: { type: Number, default: 0 },
    totalMatches: { type: Number, default: 0 },
    totalTournaments: { type: Number, default: 0 }
  },
  subscription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    default: null
  },
  isVerified: { type: Boolean, default: false },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isActive: { type: Boolean, default: true },
  isSuspended: { type: Boolean, default: false },
  suspensionReason: { type: String, trim: true, maxlength: 500 }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

enterpriseSchema.index({ slug: 1 });
enterpriseSchema.index({ owner: 1 });
enterpriseSchema.index({ isActive: 1 });
enterpriseSchema.index({ isVerified: 1 });
enterpriseSchema.index({ 'address.city': 1 });
enterpriseSchema.index({ type: 1 });

// Virtual: active member count
enterpriseSchema.virtual('activeMemberCount').get(function () {
  return this.members ? this.members.filter(m => m.isActive).length : 0;
});

module.exports = mongoose.model('Enterprise', enterpriseSchema);
