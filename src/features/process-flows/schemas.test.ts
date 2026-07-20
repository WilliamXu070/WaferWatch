import assert from "node:assert/strict";
import test from "node:test";
import { stepParameterRecordsBatchSaveSchema } from "./schemas";

const base = {
  globalValues: {},
  localParameters: [],
  notes: null
};

test("rejects duplicate and cross-step atomic parameter batch entries", () => {
  const entry = {
    assignmentId: "10000000-0000-4000-8000-000000000001",
    stepId: "10000000-0000-4000-8000-000000000002",
    movementMutationId: "10000000-0000-4000-8000-000000000003"
  };
  assert.throws(() => stepParameterRecordsBatchSaveSchema.parse({
    ...base,
    entries: [entry, { ...entry, assignmentId: "10000000-0000-4000-8000-000000000004" }]
  }), /only appear once/);
  assert.throws(() => stepParameterRecordsBatchSaveSchema.parse({
    ...base,
    entries: [entry, {
      ...entry,
      stepId: "10000000-0000-4000-8000-000000000005",
      movementMutationId: "10000000-0000-4000-8000-000000000006"
    }]
  }), /target one process step/);
});
