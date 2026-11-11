export class AppError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function publicError(error) {
  return error instanceof AppError ? error : new AppError(503, 'service_unavailable');
}
