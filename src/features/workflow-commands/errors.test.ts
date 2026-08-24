import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowCommandRejection, workflowCommandFailure, workflowErrorCode } from "./errors";

test("database and gateway failures map to stable public command codes", () => {
  assert.equal(workflowErrorCode({ code: "42501", message: "denied" }), "forbidden");
  assert.equal(workflowErrorCode({ code: "P0002", message: "missing" }), "not-found");
  assert.equal(workflowErrorCode({ code: "55000", message: "state" }), "invalid-state");
  assert.equal(workflowErrorCode({ code: "23505", message: "duplicate" }), "conflict");
  assert.equal(workflowErrorCode({ code: "XX000", message: "unexpected" }), "unavailable");
});

test("a stale rejection preserves the current revision and remains retryable", () => {
  const failure = workflowCommandFailure({
    error: new WorkflowCommandRejection("stale", "Rebase the command.", 12),
    kind: "calendar.move",
    mutationId: "mutation",
    templateId: "template"
  });
  assert.equal(failure.code, "stale");
  assert.equal(failure.currentRevision, 12);
  assert.equal(failure.retryable, true);
});
