class ApiError extends Error {
  constructor(statusCode, message, errors = [], isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, errors = []) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Unauthorized access') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Access forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message) {
    return new ApiError(409, message);
  }

  static tooMany(message = 'Too many requests') {
    return new ApiError(429, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message, [], false);
  }
}

class ApiResponse {
  static success(res, data = null, message = 'Success', statusCode = 200) {
    const response = { success: true, message };
    if (data !== null) response.data = data;
    return res.status(statusCode).json(response);
  }

  static created(res, data = null, message = 'Resource created successfully') {
    return this.success(res, data, message, 201);
  }

  static paginated(res, data, pagination, message = 'Success') {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination
    });
  }

  static noContent(res) {
    return res.status(204).send();
  }
}

module.exports = { ApiError, ApiResponse };
