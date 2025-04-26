export class AppError extends Error {
  public statusCode: number;
  public details?: any;

  constructor(message: string, statusCode: number, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}
