const logger = require("./logger.js");

class StatusCodeError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    const logData = {
      resBody: message,
      statusCode: statusCode,
    };
    logger.log('error', 'unhandledError', logData);
  }
}

const asyncHandler = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  asyncHandler,
  StatusCodeError,
};
