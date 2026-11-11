export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const fail = (status, code, message, details) => {
  throw new AppError(status, code, message, details);
};
export const requireFound = (value, message = "Resource not found.") => {
  if (!value) fail(404, "NOT_FOUND", message);
  return value;
};
export function errorHandler(err, req, res, _next) {
  let status = err.status || 500;
  let code = err.code || "INTERNAL_ERROR";
  let message = err.message;
  let details = err.details;
  if (err.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "The request body must be valid JSON.";
  } else if (err.type === "entity.too.large") {
    status = 413;
    code = "REQUEST_TOO_LARGE";
    message = "The request body is too large.";
  } else if (err.name === "ZodError") {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Please check the submitted fields.";
    details = err.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
  } else if (err.name === "MulterError") {
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    code = "INVALID_UPLOAD";
    message = "Upload one JPEG, PNG or WebP image up to 5 MiB.";
  } else if (err.code === 11000) {
    status = 409;
    code = "DUPLICATE";
    message = "A record with these unique fields already exists.";
  } else if (err.name === "CastError" || err.name === "ValidationError") {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Invalid resource fields.";
  } else if (/Mongo|Mongoose/.test(err.name || "")) {
    status = 503;
    code = "DATABASE_UNAVAILABLE";
    message = "The service is temporarily unavailable. Please try again later.";
  }
  if (status >= 500) {
    req.log?.error(
      {
        requestId: req.id,
        errorName: err.name,
        errorCode: String(err.code || ""),
      },
      "Request failed",
    );
    message =
      status === 503
        ? "A required service is temporarily unavailable. Please try again later."
        : "Something went wrong. Please contact us with the request ID.";
  }
  res.status(status).json({
    error: {
      code: String(code),
      message,
      requestId: req.id,
      ...(details ? { details } : {}),
    },
  });
}
