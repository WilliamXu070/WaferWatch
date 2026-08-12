import type { StepStatus } from "@/types/database";

export function isArchiveEligibleAfterCurrentStep(
  status: StepStatus | null,
  canReviewPendingCheckpoint = false
) {
  return status === "completed" ||
    status === "ready_to_move" ||
    (status === "awaiting_checkpoint" && canReviewPendingCheckpoint);
}
