import type { StepStatus } from "@/types/database";

export function isArchiveEligibleAfterCurrentStep(status: StepStatus | null) {
  return status === "completed";
}
