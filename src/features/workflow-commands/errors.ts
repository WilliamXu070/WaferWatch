import { ZodError } from "zod";
import { toErrorMessage } from "@/lib/errors";
import type { WorkflowCommandErrorCode, WorkflowCommandFailure, WorkflowCommandKind } from "./types";

export class WorkflowCommandRejection extends Error {
  constructor(
    public readonly code: WorkflowCommandErrorCode,
    message: string,
    public readonly currentRevision?: number
  ) {
    super(message);
    this.name = "WorkflowCommandRejection";
  }
}

function databaseErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

export function workflowErrorCode(error: unknown): WorkflowCommandErrorCode {
  if (error instanceof WorkflowCommandRejection) return error.code;
  if (error instanceof ZodError) return "invalid";
  const code = databaseErrorCode(error);
  if (code === "22023" || code === "22P02") return "invalid";
  if (code === "42501") return "forbidden";
  if (code === "P0002" || code === "PGRST116") return "not-found";
  if (code === "40001") return "stale";
  if (code === "55000") return "invalid-state";
  if (code === "23505" || code === "23P01" || code === "23503") return "conflict";
  return "unavailable";
}

export function workflowCommandFailure({
  error,
  kind = "unknown",
  mutationId = null,
  templateId = null
}: {
  error: unknown;
  kind?: WorkflowCommandKind | "unknown";
  mutationId?: string | null;
  templateId?: string | null;
}): WorkflowCommandFailure {
  const code = workflowErrorCode(error);
  return {
    ok: false,
    kind,
    mutationId,
    templateId,
    code,
    message: error instanceof ZodError
      ? error.issues[0]?.message ?? "The workflow command is invalid."
      : toErrorMessage(error),
    retryable: code === "stale" || code === "unavailable",
    ...(error instanceof WorkflowCommandRejection && error.currentRevision !== undefined
      ? { currentRevision: error.currentRevision }
      : {})
  };
}
