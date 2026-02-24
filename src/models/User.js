const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ROLES, PLAYING_ROLES, BATTING_STYLES, BOWLING_STYLES } = require('../config/constants');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  phone: {
    type: String,
    trim: true,
    sparse: true,
    match: [/^\+?[1-9]\d{6,14}$/, 'Please provide a valid phone number']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [100, 'Full name cannot exceed 100 characters']
  },
  avatar: {
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: Object.values(ROLES),
    default: ROLES.USER
  },
  playingRole: {
    type: String,
    enum: Object.values(PLAYING_ROLES),
    default: PLAYING_ROLES.BATSMAN
  },
  battingStyle: {
    type: String,
    enum: Object.values(BATTING_STYLES),
    default: BATTING_STYLES.RIGHT_HAND
  },
  bowlingStyle: {
    type: String,
    enum: Object.values(BOWLING_STYLES),
    default: BOWLING_STYLES.NONE
  },
  city: {
    type: String,
    trim: true,
    maxlength: [100, 'City cannot exceed 100 characters']
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters']
  },
  stats: {
    matchesPlayed: { type: Number, default: 0 },
    totalRuns: { type: Number, default: 0 },
    totalWickets: { type: Number, default: 0 },
    highestScore: { type: Number, default: 0 },
    bestBowling: { wickets: { type: Number, default: 0 }, runs: { type: Number, default: 0 } },
    totalCatches: { type: Number, default: 0 },
    fifties: { type: Number, default: 0 },
    hundreds: { type: Number, default: 0 },
    totalBallsFaced: { type: Number, default: 0 },
    totalBallsBowled: { type: Number, default: 0 },
    totalRunsConceded: { type: Number, default: 0 }
  },
  refreshToken: {
    type: String,
    select: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  // Subscription & plan
  subscriptionPlan: {
    type: String,
    enum: ['free', 'basic', 'pro', 'enterprise'],
    default: 'free'
  },
  subscription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    default: null
  },
  // Enterprise / Academy affiliation
  enterprise: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Enterprise',
    default: null
  },
  enterpriseRole: {
    type: String,
    enum: ['owner', 'admin', 'coach', 'player', 'support_staff', 'viewer', null],
    default: null
  },
  // OTP / passwordless login
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  preferOTPLogin: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ isActive: 1, isBanned: 1 });
userSchema.index({ subscriptionPlan: 1 });
userSchema.index({ enterprise: 1 });

// Virtual: is account locked
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save: hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method: compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method: generate access token
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Method: generate refresh token
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { id: this._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
  );
};

// Method: increment login attempts
userSchema.methods.incrementLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.loginAttempts = 1;
    this.lockUntil = null;
  } else {
    this.loginAttempts += 1;
    if (this.loginAttempts >= 5) {
      this.lockUntil = Date.now() + 30 * 60 * 1000; // Lock for 30 minutes
    }
  }
  await this.save();
};

// Method: reset login attempts
userSchema.methods.resetLoginAttempts = async function () {
  this.loginAttempts = 0;
  this.lockUntil = null;
  this.lastLogin = new Date();
  await this.save();
};

// Static: find by credentials
userSchema.statics.findByCredentials = async function (email, password) {
  const user = await this.findOne({ email }).select('+password');
  if (!user) return null;
  if (user.isLocked) {
    const error = new Error('Account is temporarily locked due to multiple failed login attempts');
    error.statusCode = 423;
    throw error;
  }
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    await user.incrementLoginAttempts();
    return null;
  }
  await user.resetLoginAttempts();
  return user;
};

module.exports = mongoose.model('User', userSchema);
