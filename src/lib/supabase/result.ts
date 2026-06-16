import { AppError } from "@/lib/errors";

export function throwSupabaseError(error: { message: string; code?: string } | null) {
  if (error) {
    throw new AppError(error.message, 400);
  }
}
