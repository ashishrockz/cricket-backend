const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ApiError } = require('../utils/apiHelpers');
const { ROLES } = require('../config/constants');

/**
 * Authenticate user via JWT Bearer token
 */
const authenticate = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(ApiError.unauthorized('Access denied. No token provided.'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return next(ApiError.unauthorized('User not found. Token is invalid.'));
    }

    if (!user.isActive) {
      return next(ApiError.forbidden('Your account has been deactivated.'));
    }

    if (user.isBanned) {
      return next(ApiError.forbidden('Your account has been banned. Contact support.'));
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Token has expired. Please login again.'));
    }
    return next(ApiError.unauthorized('Invalid token.'));
  }
};

/**
 * Authorize by role(s)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required.'));
    }
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Role '${req.user.role}' is not authorized to access this resource.`));
    }
    next();
  };
};

/**
 * Admin only shorthand
 */
const adminOnly = authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN);

/**
 * Optional authentication - populates req.user if token exists but doesn't fail
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id);
    }
  } catch (e) {
    // Token invalid or expired, continue without user
  }
  next();
};

// Alias for backward compatibility and descriptive clarity
const optionalAuthenticate = optionalAuth;

module.exports = { authenticate, authorize, adminOnly, optionalAuth, optionalAuthenticate };
