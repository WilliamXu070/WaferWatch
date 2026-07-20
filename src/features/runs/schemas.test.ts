import assert from "node:assert/strict";
import test from "node:test";
import { correctWaferProcessHistorySchema, processFlowMutationBatchSchema, submitStepCheckpointSchema } from "./schemas";

const id = {
  batch: "10000000-0000-4000-8000-000000000001",
  assignmentOne: "10000000-0000-4000-8000-000000000002",
  assignmentTwo: "10000000-0000-4000-8000-000000000003",
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
  const parsed = processFlowMutationBatchSchema.parse({
    mutations: [
      {
        kind: "submit",
        assignmentId: id.assignmentOne,
        stepExecutionId: id.executionOne,
        mutationId: id.mutationOne,
        batchId: id.batch,
        notes: "Pre-Bake complete",
        evidence: {}
      },
      {
        kind: "submit",
        assignmentId: id.assignmentTwo,
        stepExecutionId: id.executionTwo,
        mutationId: id.mutationTwo,
        batchId: id.batch,
        notes: "Pre-Bake complete",
        evidence: {}
      }
    ]
  });

  assert.deepEqual(parsed.mutations.map((mutation) => mutation.kind === "submit" && mutation.batchId), [
    id.batch,
    id.batch
  ]);
});

test("rejects duplicate mutation ids before a workflow batch reaches the server", () => {
  assert.throws(() => processFlowMutationBatchSchema.parse({
    mutations: [id.assignmentOne, id.assignmentTwo].map((assignmentId) => ({
      kind: "submit",
      assignmentId,
      stepExecutionId: id.executionOne,
      mutationId: id.mutationOne,
      batchId: id.batch,
      notes: "Complete",
      evidence: {}
    }))
  }), /unique operation id/);
});

test("requires a complete, typed history-correction payload", () => {
  const insertion = correctWaferProcessHistorySchema.parse({
    kind: "insert",
    mutationId: id.mutationOne,
    assignmentId: id.assignmentOne,
    anchorVisitId: "attempt:one",
    placement: "after",
    stepId: id.executionOne,
    completedAt: "2026-07-20T12:30:00.000Z",
    reason: "Recovered instrument log",
    expectedHistoryRevision: 2,
    parameterValues: { temperature: 250, inspected: true },
    parameterNotes: { temperature: "tool export" }
  });
  assert.equal(insertion.kind, "insert");
  assert.throws(() => correctWaferProcessHistorySchema.parse({
    kind: "remove",
    mutationId: id.mutationTwo,
    assignmentId: id.assignmentTwo,
    visitId: "attempt:two",
    reason: "",
    expectedHistoryRevision: 0
  }));
});
