import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessBatchHistoryView } from "@/types/database";
import { DASHBOARD_BATCH_HISTORY_LIMIT, mapProcessBatchHistoryRows } from "./batchHistory";

function row(overrides: Partial<ProcessBatchHistoryView> = {}): ProcessBatchHistoryView {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    batch_id: "10000000-0000-4000-8000-000000000002",
    template_id: "10000000-0000-4000-8000-000000000003",
    process_step_id: "10000000-0000-4000-8000-000000000004",
    process_name: "Pre-Bake",
    submitted_at: "2026-07-20T14:00:00.000Z",
    operator_name: "William Xu",
    note: "  Ready for chromium  ",
    status: "approved",
    sample_count: 2,
    samples: [
      { attemptId: "attempt-a", label: "ALPHA-A1", status: "approved" },
      { attemptId: "attempt-b", label: "ALPHA-A2", status: "approved" }
    ],
    ...overrides
  };
}

test("maps grouped and legacy batch-history rows newest first", () => {
  const history = mapProcessBatchHistoryRows([
    row({
      id: "10000000-0000-4000-8000-000000000010",
      batch_id: null,
      submitted_at: "2026-07-19T14:00:00.000Z",
      samples: [{ attemptId: "legacy", label: "LEGACY-A1", status: "withdrawn" }],
      status: "withdrawn"
    }),
    row()
  ]);

  assert.equal(history[0].processName, "Pre-Bake");
  assert.equal(history[0].note, "Ready for chromium");
  assert.deepEqual(history[0].samples.map((sample) => sample.label), ["ALPHA-A1", "ALPHA-A2"]);
  assert.equal(history[1].batchId, null);
  assert.equal(history[1].samples[0].status, "withdrawn");
});

test("deduplicates samples and safely handles malformed view payloads", () => {
  const history = mapProcessBatchHistoryRows([
    row({
      status: "unexpected",
      samples: [
        { attemptId: "attempt-a", label: "ALPHA-A1", status: "awaiting_review" },
        { attemptId: "attempt-a", label: "ALPHA-A1", status: "approved" },
        { attemptId: "attempt-b", label: "", status: "approved" },
        "invalid"
      ]
    })
  ]);

  assert.equal(history[0].status, "mixed");
  assert.deepEqual(history[0].samples, [
    { attemptId: "attempt-a", label: "ALPHA-A1", status: "approved" }
  ]);
});

test("bounds the dashboard to the newest batch rows", () => {
  const history = mapProcessBatchHistoryRows(Array.from({ length: 36 }, (_, index) => row({
    id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    submitted_at: new Date(Date.UTC(2026, 6, 1, index)).toISOString()
  })));

  assert.equal(history.length, DASHBOARD_BATCH_HISTORY_LIMIT);
  assert.equal(history[0].submittedAt, new Date(Date.UTC(2026, 6, 2, 11)).toISOString());
});
