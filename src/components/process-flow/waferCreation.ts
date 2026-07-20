import type { CreatedWaferAtProcessStartPayload, WaferPin } from "./types";

export function reconcileCreatedWaferPin(
  optimisticWafer: WaferPin,
  created: CreatedWaferAtProcessStartPayload
): WaferPin {
  return {
    ...optimisticWafer,
    assignmentId: created.assignment.id,
    waferId: created.wafer.id,
    projectId: created.wafer.project_id,
    waferCode: created.wafer.wafer_code,
    currentStepExecutionId: created.stepExecution.id,
    currentStepStatus: created.stepExecution.status
  };
}
