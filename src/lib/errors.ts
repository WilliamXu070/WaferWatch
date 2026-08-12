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

  if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    const structuredError = error as Record<string, unknown>;
    const message = (structuredError.message as string).trim();
    const details = typeof structuredError.details === "string"
      ? structuredError.details.trim()
      : "";
    const hint = typeof structuredError.hint === "string"
      ? structuredError.hint.trim()
      : "";
    const rawError = typeof structuredError.error === "string"
      ? structuredError.error.trim()
      : "";
    const parts = [message, details, hint, rawError].filter(Boolean);
    return parts.join(" | ") || "An unexpected error occurred.";
  }

  return "An unexpected error occurred.";
}

export function assertFound<T>(value: T | null | undefined, message = "Resource not found"): T {
  if (value === null || value === undefined) {
    throw new AppError(message, 404);
  }

  return value;
}
