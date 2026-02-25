const jwt = require('jsonwebtoken');
const User = require('../models/User');
const OTPRequest = require('../models/OTPRequest');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../config/logger');
const { sendOTPEmail, sendWelcomeEmail } = require('../services/emailService');
const { assignFreePlan } = require('../services/subscriptionService');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: generate and save tokens
// ─────────────────────────────────────────────────────────────────────────────
const issueTokens = async (user) => {
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  user.refreshToken = refreshToken;
  await user.save();
  return { accessToken, refreshToken };
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build safe user object for response
// ─────────────────────────────────────────────────────────────────────────────
const safeUser = (user) => ({
  id: user._id,
  username: user.username,
  email: user.email,
  fullName: user.fullName,
  playingRole: user.playingRole,
  role: user.role,
  avatar: user.avatar,
  subscriptionPlan: user.subscriptionPlan,
  isEmailVerified: user.isEmailVerified,
  stats: user.stats
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Register a new user
// @route   POST /api/v1/auth/register
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const register = asyncHandler(async (req, res, next) => {
  const {
    username, email, password, fullName, phone,
    playingRole, battingStyle, bowlingStyle, city
  } = req.body;

  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    if (existingUser.email === email.toLowerCase()) {
      return next(ApiError.conflict('Email is already registered'));
    }
    return next(ApiError.conflict('Username is already taken'));
  }

  const user = await User.create({
    username, email, password, fullName, phone,
    playingRole, battingStyle, bowlingStyle, city
  });

  // Assign free plan (non-blocking on error)
  assignFreePlan(user._id).catch(err =>
    logger.error(`assignFreePlan failed for ${user._id}: ${err.message}`)
  );

  // Send welcome email (non-blocking)
  sendWelcomeEmail({ email: user.email, userName: user.fullName || user.username })
    .catch(err => logger.error(`Welcome email failed: ${err.message}`));

  const tokens = await issueTokens(user);

  logger.info(`New user registered: ${user.email}`);

  ApiResponse.created(res, {
    user: safeUser(user),
    tokens
  }, 'Registration successful');
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Login with email + password
// @route   POST /api/v1/auth/login
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  const user = await User.findByCredentials(email, password);

  if (!user) {
    return next(ApiError.unauthorized('Invalid email or password'));
  }

  if (!user.isActive) {
    return next(ApiError.forbidden('Your account has been deactivated'));
  }

  if (user.isBanned) {
    return next(ApiError.forbidden('Your account has been banned. Contact support.'));
  }

  const tokens = await issueTokens(user);

  logger.info(`User logged in (password): ${user.email}`);

  ApiResponse.success(res, { user: safeUser(user), tokens }, 'Login successful');
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Request OTP for email-based login or verification
// @route   POST /api/v1/auth/otp/request
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const requestOTP = asyncHandler(async (req, res, next) => {
  const { email, purpose = 'login' } = req.body;

  // Single query for user — used both for auth check and personalized email
  const user = await User.findOne({ email: email.toLowerCase() }).select('fullName username isActive isBanned');

  // Check if user exists for login/password_reset purposes
  if (purpose === 'login' || purpose === 'password_reset') {
    if (!user) {
      // Return a generic message to prevent email enumeration
      return ApiResponse.success(res, null,
        'If an account with that email exists, an OTP has been sent.');
    }

    if (user.isBanned) {
      return next(ApiError.forbidden('Your account has been banned. Contact support.'));
    }

    if (!user.isActive) {
      return next(ApiError.forbidden('Your account has been deactivated.'));
    }
  }

  const ipAddress = req.ip || req.headers['x-forwarded-for'];
  const userAgent = req.headers['user-agent'];

  // Check for recent OTP to prevent spam (1 per 60 seconds)
  const recentOtp = await OTPRequest.findOne({
    email: email.toLowerCase(),
    purpose,
    isUsed: false,
    createdAt: { $gte: new Date(Date.now() - 60 * 1000) }
  });

  if (recentOtp) {
    return next(ApiError.tooMany('Please wait 60 seconds before requesting another OTP.'));
  }

  const { otp } = await OTPRequest.createOTP(
    email.toLowerCase(),
    purpose,
    ipAddress,
    userAgent
  );

  await sendOTPEmail({
    email: email.toLowerCase(),
    otp,
    purpose,
    userName: user ? (user.fullName || user.username) : null
  });

  logger.info(`OTP requested for ${email} (${purpose})`);

  ApiResponse.success(res, null,
    'If an account with that email exists, an OTP has been sent.');
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Verify OTP and login (or complete action)
// @route   POST /api/v1/auth/otp/verify
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const verifyOTP = asyncHandler(async (req, res, next) => {
  const { email, otp, purpose = 'login' } = req.body;

  const otpRequest = await OTPRequest.findOne({
    email: email.toLowerCase(),
    purpose,
    isUsed: false
  }).select('+otpHash').sort({ createdAt: -1 });

  if (!otpRequest) {
    return next(ApiError.badRequest('No pending OTP found for this email. Please request a new OTP.'));
  }

  const { valid, reason } = await otpRequest.verifyOTP(otp);

  if (!valid) {
    const attemptsLeft = otpRequest.maxAttempts - otpRequest.attempts;
    return next(ApiError.badRequest(
      attemptsLeft > 0
        ? `Invalid OTP. ${attemptsLeft} attempt(s) remaining.`
        : 'OTP invalidated due to too many failed attempts. Please request a new OTP.'
    ));
  }

  if (purpose === 'login') {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return next(ApiError.notFound('User not found'));

    if (!user.isActive) return next(ApiError.forbidden('Your account has been deactivated.'));
    if (user.isBanned) return next(ApiError.forbidden('Your account has been banned. Contact support.'));

    // Mark email as verified if not already
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
    }

    await user.resetLoginAttempts();
    const tokens = await issueTokens(user);

    logger.info(`User logged in (OTP): ${user.email}`);

    return ApiResponse.success(res, { user: safeUser(user), tokens }, 'OTP login successful');
  }

  if (purpose === 'register_verify') {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return next(ApiError.notFound('User not found'));

    user.isEmailVerified = true;
    await user.save();

    return ApiResponse.success(res, null, 'Email verified successfully');
  }

  if (purpose === 'password_reset') {
    // Issue a short-lived reset token (5 minutes)
    const resetToken = jwt.sign(
      { id: null, email: email.toLowerCase(), purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );

    return ApiResponse.success(res, { resetToken }, 'OTP verified. Use resetToken to set a new password.');
  }

  ApiResponse.success(res, null, 'OTP verified successfully');
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Reset password using OTP-verified reset token
// @route   POST /api/v1/auth/reset-password
// @access  Public (requires resetToken from /otp/verify)
// ─────────────────────────────────────────────────────────────────────────────
const resetPassword = asyncHandler(async (req, res, next) => {
  const { resetToken, newPassword } = req.body;

  let decoded;
  try {
    decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
  } catch {
    return next(ApiError.unauthorized('Reset token is invalid or expired. Please request a new OTP.'));
  }

  if (decoded.purpose !== 'password_reset' || !decoded.email) {
    return next(ApiError.badRequest('Invalid reset token'));
  }

  const user = await User.findOne({ email: decoded.email });
  if (!user) return next(ApiError.notFound('User not found'));

  user.password = newPassword;
  user.refreshToken = null;
  user.loginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  const tokens = await issueTokens(user);

  logger.info(`Password reset via OTP for: ${user.email}`);

  ApiResponse.success(res, { tokens }, 'Password reset successful. You are now logged in.');
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Refresh access token
// @route   POST /api/v1/auth/refresh-token
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const refreshAccessToken = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.body;

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    return next(ApiError.unauthorized('Invalid or expired refresh token'));
  }

  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user || user.refreshToken !== refreshToken) {
    return next(ApiError.unauthorized('Invalid refresh token. Please login again.'));
  }

  const newAccessToken = user.generateAccessToken();
  const newRefreshToken = user.generateRefreshToken();
  user.refreshToken = newRefreshToken;
  await user.save();

  ApiResponse.success(res, {
    tokens: { accessToken: newAccessToken, refreshToken: newRefreshToken }
  }, 'Token refreshed successfully');
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Change password (authenticated)
// @route   PUT /api/v1/auth/change-password
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return next(ApiError.badRequest('Current password is incorrect'));
  }

  user.password = newPassword;
  user.refreshToken = null;
  await user.save();

  const tokens = await issueTokens(user);

  logger.info(`Password changed for user: ${user.email}`);

  ApiResponse.success(res, { tokens }, 'Password changed successfully');
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Logout user
// @route   POST /api/v1/auth/logout
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const logout = asyncHandler(async (req, res) => {
  // Blacklist the current access token so it can't be reused before natural expiry
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const jwt            = require('jsonwebtoken');
      const TokenBlacklist = require('../models/TokenBlacklist');
      const decoded        = jwt.decode(token);
      if (decoded?.exp) {
        await TokenBlacklist.create({ token, userId: req.user._id, expiresAt: new Date(decoded.exp * 1000) });
      }
    } catch { /* non-critical — proceed */ }
  }
  req.user.refreshToken = null;
  await req.user.save();
  ApiResponse.success(res, null, 'Logged out successfully');
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get current authenticated user
// @route   GET /api/v1/auth/me
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('subscription', 'planSlug status endDate billingCycle')
    .populate('enterprise', 'name slug logo type');

  ApiResponse.success(res, { user });
});

module.exports = {
  register, login,
  requestOTP, verifyOTP, resetPassword,
  refreshAccessToken, changePassword, logout, getMe
};
