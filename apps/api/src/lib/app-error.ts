export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(opts: { code: string; message: string; statusCode: number; details?: Record<string, unknown> }) {
    super(opts.message);
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.details = opts.details;
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: Record<string, unknown>) {
    return new AppError({ code: 'BAD_REQUEST', message, statusCode: 400, details });
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError({ code: 'UNAUTHORIZED', message, statusCode: 401 });
  }

  static forbidden(message = 'Forbidden') {
    return new AppError({ code: 'FORBIDDEN', message, statusCode: 403 });
  }

  static notFound(resource = 'Resource') {
    return new AppError({ code: 'NOT_FOUND', message: `${resource} not found`, statusCode: 404 });
  }

  static conflict(message: string) {
    return new AppError({ code: 'CONFLICT', message, statusCode: 409 });
  }

  static rateLimit() {
    return new AppError({ code: 'RATE_LIMIT', message: 'Too many requests', statusCode: 429 });
  }

  static tooManyRequests(message = 'Too many requests') {
    return new AppError({ code: 'TOO_MANY_REQUESTS', message, statusCode: 429 });
  }

  static internal(message = 'Internal server error') {
    return new AppError({ code: 'INTERNAL_ERROR', message, statusCode: 500 });
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}
