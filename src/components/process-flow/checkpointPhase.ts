import type { StepStatus } from "@/types/database";

export type CheckpointPhase = "beginning" | "complete";

export function getCheckpointPhase(status: StepStatus | null | undefined): CheckpointPhase {
  return status === "awaiting_checkpoint" || status === "ready_to_move"
    ? "complete"
    : "beginning";
}

export function canSubmitCheckpoint(status: StepStatus | null | undefined) {
  return status === "queued" || status === "running" || status === "redo_required";
}

export function canMoveToAnotherStep(status: StepStatus | null | undefined) {
  return status === "ready_to_move";
}

export function getCheckpointStateLabel(status: StepStatus | null | undefined) {
  if (status === "awaiting_checkpoint") return "Awaiting checkpoint";
  if (status === "ready_to_move") return "Approved, ready to move";
  if (status === "redo_required") return "Redo required";
  if (status === "blocked") return "Blocked";
  if (status === "failed") return "Failed";
  if (status === "running") return "In progress";
  return "Beginning";
}
