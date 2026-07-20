import assert from "node:assert/strict";
import test from "node:test";
import { submitStepCheckpointSchema } from "./schemas";

const id = {
  batch: "10000000-0000-4000-8000-000000000001",
  executionOne: "10000000-0000-4000-8000-000000000004",
  executionTwo: "10000000-0000-4000-8000-000000000005",
  mutationOne: "10000000-0000-4000-8000-000000000006",
  mutationTwo: "10000000-0000-4000-8000-000000000007"
};

test("requires an explicit batch id for checkpoint submissions", () => {
  assert.throws(() => submitStepCheckpointSchema.parse({
    stepExecutionId: id.executionOne,
    mutationId: id.mutationOne,
    notes: "Cleaning complete",
    evidence: {}
  }));

  assert.equal(submitStepCheckpointSchema.parse({
    stepExecutionId: id.executionOne,
    mutationId: id.mutationOne,
    batchId: id.batch,
    notes: "Cleaning complete",
    evidence: {}
  }).batchId, id.batch);
});

test("keeps one batch identity across every selected sample submission", () => {
  const parsed = [
    { stepExecutionId: id.executionOne, mutationId: id.mutationOne },
    { stepExecutionId: id.executionTwo, mutationId: id.mutationTwo }
  ].map((submission) => submitStepCheckpointSchema.parse({
    ...submission,
    batchId: id.batch,
    notes: "Pre-Bake complete",
    evidence: {}
  }));

  assert.deepEqual(parsed.map((submission) => submission.batchId), [id.batch, id.batch]);
});
