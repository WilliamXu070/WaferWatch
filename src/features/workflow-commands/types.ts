import type { z } from "zod";
import type { Json } from "@/types/database";
import type { ProcessWorkspaceDelta } from "@/features/workspace/types";
import type { workflowCommandSchema } from "./schemas";

export type WorkflowCommand = z.infer<typeof workflowCommandSchema>;
export type WorkflowCommandKind = WorkflowCommand["kind"];
export type CurrentActorWorkflowCommand = WorkflowCommand extends infer Command
  ? Command extends { actorId: string }
    ? Omit<Command, "actorId">
    : never
  : never;

export type WorkflowCommandErrorCode =
  | "invalid"
  | "forbidden"
  | "not-found"
  | "stale"
  | "invalid-state"
  | "conflict"
  | "unavailable";

export type WorkflowCommandSuccess = {
  ok: true;
  kind: WorkflowCommandKind;
  mutationId: string;
  templateId: string;
  actorId: string;
  revision: number;
  changedEntityIds: Record<string, Json | undefined>;
  delta: ProcessWorkspaceDelta;
  data: Json;
  alreadyApplied: boolean;
};

export type WorkflowCommandFailure = {
  ok: false;
  kind: WorkflowCommandKind | "unknown";
  mutationId: string | null;
  templateId: string | null;
  code: WorkflowCommandErrorCode;
  message: string;
  retryable: boolean;
  currentRevision?: number;
};

export type WorkflowCommandResult = WorkflowCommandSuccess | WorkflowCommandFailure;
