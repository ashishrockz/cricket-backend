const { ApiError } = require('../utils/apiHelpers');

/**
 * Generic Joi validation middleware factory
 * @param {object} schema - Joi schema object with body, params, query keys
 */
const validate = (schema) => {
  return (req, res, next) => {
    const errors = [];

    ['body', 'params', 'query'].forEach((key) => {
      if (schema[key]) {
        const { error, value } = schema[key].validate(req[key], {
          abortEarly: false,
          stripUnknown: true,
          allowUnknown: false
        });

        if (error) {
          error.details.forEach((detail) => {
            errors.push({
              field: detail.path.join('.'),
              message: detail.message.replace(/"/g, '')
            });
          });
        } else {
          req[key] = value; // Replace with sanitized values
        }
      }
    });

    if (errors.length > 0) {
      return next(ApiError.badRequest('Validation failed', errors));
    }

    next();
  };
};

module.exports = { validate };
