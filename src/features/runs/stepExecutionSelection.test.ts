import assert from "node:assert/strict";
import test from "node:test";
import { getSourceStepExecution } from "./stepExecutionSelection.ts";

test("selects the requested source step instead of an earlier pending execution", () => {
  const executions = [
    makeExecution("future-step", "pending", "2026-07-08T12:00:00.000Z"),
    makeExecution("source-step", "pending", "2026-07-08T12:01:00.000Z"),
    makeExecution("target-step", "pending", "2026-07-08T12:02:00.000Z")
  ];

  const selected = getSourceStepExecution(executions, "source-step");

  assert.equal(selected?.process_step_id, "source-step");
});

test("prefers an active source execution over a stale pending source execution", () => {
  const executions = [
    makeExecution("source-step", "pending", "2026-07-08T12:00:00.000Z"),
    makeExecution("source-step", "running", "2026-07-08T12:05:00.000Z")
  ];

  const selected = getSourceStepExecution(executions, "source-step");

  assert.equal(selected?.status, "running");
});

function makeExecution(processStepId: string, status: string, createdAt: string) {
  return {
    process_step_id: processStepId,
    status,
    started_at: status === "running" ? createdAt : null,
    created_at: createdAt
  };
}
