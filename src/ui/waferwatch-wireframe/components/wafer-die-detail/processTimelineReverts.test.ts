import assert from "node:assert/strict";
import test from "node:test";
import { buildProcessTimelineRevertEdges } from "./processTimelineReverts.ts";

const steps = ["dicing", "cleaning", "deposition", "ebl-prep", "inspection"].map((id) => ({ id }));

test("joins consecutive reverts into one continuous revision chain", () => {
  const edges = buildProcessTimelineRevertEdges(steps, [
    revert("attempt-1", "ebl-prep", "deposition", "2026-07-10T15:23:00.000Z"),
    revert("attempt-2", "deposition", "cleaning", "2026-07-10T15:25:00.000Z")
  ]);

  assert.deepEqual(
    edges.map(({ id, attemptNumber, chainIndex, continuedByEventId, fromIndex, toIndex }) => ({
      id,
      attemptNumber,
      chainIndex,
      continuedByEventId,
      fromIndex,
      toIndex
    })),
    [
      {
        id: "attempt-1",
        attemptNumber: 1,
        chainIndex: 0,
        continuedByEventId: "attempt-2",
        fromIndex: 3,
        toIndex: 2
      },
      {
        id: "attempt-2",
        attemptNumber: 2,
        chainIndex: 0,
        continuedByEventId: null,
        fromIndex: 2,
        toIndex: 1
      }
    ]
  );
});

test("keeps a non-consecutive revert on a separate revision chain", () => {
  const edges = buildProcessTimelineRevertEdges(steps, [
    revert("attempt-1", "ebl-prep", "deposition", "2026-07-10T15:23:00.000Z"),
    revert("attempt-2", "inspection", "cleaning", "2026-07-10T15:30:00.000Z")
  ]);

  assert.deepEqual(edges.map(({ attemptNumber, chainIndex }) => ({ attemptNumber, chainIndex })), [
    { attemptNumber: 1, chainIndex: 0 },
    { attemptNumber: 2, chainIndex: 1 }
  ]);
});

function revert(id: string, fromStepId: string, toStepId: string, occurredAt: string) {
  return { id, fromStepId, toStepId, occurredAt, reason: `${id} note` };
}
