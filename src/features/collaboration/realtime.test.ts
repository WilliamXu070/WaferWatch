import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkflowRefreshDebounceMs,
  getWorkflowProcessTopic,
  isWorkflowBroadcastPayload,
  isWorkflowEventFor
} from "./realtime";

test("builds one stable private topic per process", () => {
  assert.equal(
    getWorkflowProcessTopic("11111111-1111-4111-8111-111111111103"),
    "workflow:process:11111111-1111-4111-8111-111111111103"
  );
});

test("rejects malformed workflow broadcasts", () => {
  assert.equal(isWorkflowBroadcastPayload(null), false);
  assert.equal(isWorkflowBroadcastPayload({ table: "wafers" }), false);
  assert.equal(
    isWorkflowBroadcastPayload({
      table: "wafers",
      operation: "UPDATE",
      changedAt: "2026-07-15T12:00:00.000Z"
    }),
    true
  );
});

test("coalesces a process-step position batch longer than ordinary workflow updates", () => {
  assert.equal(getWorkflowRefreshDebounceMs({
    table: "process_steps",
    operation: "UPDATE",
    entityId: "step-a",
    changedAt: "2026-07-17T12:00:00.000Z"
  }), 1_000);
  assert.equal(getWorkflowRefreshDebounceMs({
    table: "wafers",
    operation: "UPDATE",
    entityId: "wafer-a",
    changedAt: "2026-07-17T12:00:00.000Z"
  }), 350);
});

test("filters component refreshes to the affected project and wafer", () => {
  const event = new CustomEvent("waferwatch:realtime-change", {
    detail: {
      table: "die_inspections",
      operation: "INSERT",
      entityId: "inspection-id",
      projectId: "project-a",
      waferId: "wafer-a",
      changedAt: "2026-07-15T12:00:00.000Z"
    }
  });

  assert.equal(isWorkflowEventFor({ event, table: "die_inspections", waferId: "wafer-a" }), true);
  assert.equal(isWorkflowEventFor({ event, table: "die_inspections", waferId: "wafer-b" }), false);
  assert.equal(isWorkflowEventFor({ event, table: "text_surfaces", projectId: "project-a" }), false);
});
