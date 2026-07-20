import test from "node:test";
import assert from "node:assert/strict";
import { canSubmitWaferCheckpoint } from "./checkpointPhase.ts";
import { reconcileCreatedWaferPin } from "./waferCreation.ts";
import type { CreatedWaferAtProcessStartPayload, WaferPin } from "./types.ts";

test("makes a newly created Beginning wafer checkpoint-ready without a refresh", () => {
  const optimisticWafer: WaferPin = {
    assignmentId: "local-wafer-1",
    waferCode: "Alpha",
    dieLabel: null,
    currentStepStatus: "queued"
  };
  const created: CreatedWaferAtProcessStartPayload = {
    wafer: {
      id: "wafer-1",
      project_id: "project-1",
      wafer_code: "Alpha"
    },
    assignment: { id: "assignment-1" },
    stepExecution: {
      id: "execution-1",
      status: "queued"
    }
  };

  assert.equal(canSubmitWaferCheckpoint(optimisticWafer), false);

  const reconciledWafer = reconcileCreatedWaferPin(optimisticWafer, created);

  assert.equal(reconciledWafer.assignmentId, "assignment-1");
  assert.equal(reconciledWafer.currentStepExecutionId, "execution-1");
  assert.equal(canSubmitWaferCheckpoint(reconciledWafer), true);
});
