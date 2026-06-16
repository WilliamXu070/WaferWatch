export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred.";
}

export function assertFound<T>(value: T | null | undefined, message = "Resource not found"): T {
  if (value === null || value === undefined) {
    throw new AppError(message, 404);
  }

  return value;
}
