const logger = require('../config/logger');
const { ApiError } = require('../utils/apiHelpers');

const notFoundHandler = (req, res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  // Log error
  if (err.statusCode >= 500 || !err.statusCode) {
    logger.error(`${err.message}`, { stack: err.stack, url: req.originalUrl, method: req.method });
  } else {
    logger.warn(`${err.statusCode} - ${err.message} - ${req.originalUrl}`);
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error = ApiError.badRequest(`Invalid ${err.path}: ${err.value}`);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = ApiError.conflict(`${field} already exists: ${err.keyValue[field]}`);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
    error = ApiError.badRequest('Validation failed', errors);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = ApiError.unauthorized('Invalid token');
  }
  if (err.name === 'TokenExpiredError') {
    error = ApiError.unauthorized('Token has expired');
  }

  const statusCode = error.statusCode || 500;
  const response = {
    success: false,
    message: error.message || 'Internal Server Error'
  };

  if (error.errors && error.errors.length > 0) {
    response.errors = error.errors;
  }

  if (process.env.NODE_ENV === 'development' && statusCode >= 500) {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = { errorHandler, notFoundHandler };
