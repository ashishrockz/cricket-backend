const mongoose = require('mongoose');
const crypto = require('crypto');

const otpRequestSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  otpHash: {
    type: String,
    required: true,
    select: false
  },
  purpose: {
    type: String,
    required: true,
    enum: ['login', 'register_verify', 'password_reset', 'email_change']
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  },
  isUsed: { type: Boolean, default: false },
  usedAt: { type: Date, default: null },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  ipAddress: { type: String, trim: true },
  userAgent: { type: String, trim: true }
}, {
  timestamps: true
});

// TTL index to auto-delete expired OTPs after 1 hour
otpRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
otpRequestSchema.index({ email: 1, purpose: 1, isUsed: 1 });

// Static: create OTP request (hashes the OTP before storing)
otpRequestSchema.statics.createOTP = async function (email, purpose, ipAddress, userAgent) {
  // Invalidate any existing unused OTPs for this email+purpose
  await this.updateMany(
    { email, purpose, isUsed: false },
    { $set: { isUsed: true } }
  );

  const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit OTP
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

  const otpRequest = await this.create({
    email,
    otpHash,
    purpose,
    ipAddress,
    userAgent,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  });

  return { otpRequest, otp }; // Return raw OTP to be emailed (never stored as plain text)
};

// Method: verify OTP
otpRequestSchema.methods.verifyOTP = async function (candidateOtp) {
  if (this.isUsed) return { valid: false, reason: 'OTP already used' };
  if (this.expiresAt < new Date()) return { valid: false, reason: 'OTP expired' };
  if (this.attempts >= this.maxAttempts) return { valid: false, reason: 'Too many attempts' };

  const candidateHash = crypto.createHash('sha256').update(String(candidateOtp)).digest('hex');

  // Need to fetch otpHash since it's select: false — caller must use .select('+otpHash')
  if (candidateHash !== this.otpHash) {
    this.attempts += 1;
    await this.save();
    return { valid: false, reason: 'Invalid OTP' };
  }

  this.isUsed = true;
  this.usedAt = new Date();
  await this.save();
  return { valid: true };
};

module.exports = mongoose.model('OTPRequest', otpRequestSchema);
