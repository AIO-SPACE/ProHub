export class HttpError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const conflict = (message, details) => new HttpError(409, message, details);
export const notFound = (message, details) => new HttpError(404, message, details);
export const unsupported = (message, details) => new HttpError(422, message, details);
export const unavailable = (message, details) => new HttpError(503, message, details);
