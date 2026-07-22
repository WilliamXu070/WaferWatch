import assert from "node:assert/strict";
import { buildPlanAdjustment, type SchedulerInput } from "../src/features/planning/scheduler";

const base: SchedulerInput = {
  operations: [
    { id: "done", logicalId: "done", startsAt: "2026-07-21T09:00:00.000Z", endsAt: "2026-07-21T10:00:00.000Z", rowVersion: 2, userPinned: false, status: "scheduled" },
    { id: "next", logicalId: "next", startsAt: "2026-07-21T10:00:00.000Z", endsAt: "2026-07-21T11:00:00.000Z", rowVersion: 3, userPinned: false, status: "scheduled" }
  ],
  dependencies: [{ predecessorId: "done", successorId: "next", lagMinutes: 0 }],
  resources: [],
  unavailableToolIds: new Set(),
  reservations: [],
  lockedOperationIds: new Set(["done"]),
  rootOperationId: "done",
  notBefore: "2026-07-21T10:00:00.000Z",
  delayMinutes: 60,
  windowStartsAt: "2026-07-21T08:00:00.000Z",
  windowEndsAt: "2026-07-22T18:00:00.000Z"
};

const delayed = buildPlanAdjustment(base);
assert.equal(delayed.conflicts.length, 0);
assert.equal(delayed.moves[0]?.operationId, "next");
assert.equal(delayed.moves[0]?.startsAt, "2026-07-21T11:00:00.000Z");

const travel = buildPlanAdjustment({
  ...base,
  operations: [
    { ...base.operations[0], id: "fixed", logicalId: "fixed" },
    { ...base.operations[1], id: "travel", logicalId: "travel" }
  ],
  dependencies: [],
  resources: [
    { operationId: "fixed", kind: "person", resourceId: "person" },
    { operationId: "fixed", kind: "location", resourceId: "site-a" },
    { operationId: "travel", kind: "person", resourceId: "person" },
    { operationId: "travel", kind: "location", resourceId: "site-b" }
  ],
  lockedOperationIds: new Set(["fixed"]),
  rootOperationId: "travel",
  delayMinutes: 0
});
assert.equal(travel.moves[0]?.startsAt, "2026-07-21T11:00:00.000Z");

const reserved = buildPlanAdjustment({
  ...base,
  resources: [{ operationId: "next", kind: "tool", resourceId: "tool" }],
  reservations: [{ toolId: "tool", startsAt: "2026-07-21T11:00:00.000Z", endsAt: "2026-07-21T12:00:00.000Z" }]
});
assert.equal(reserved.moves[0]?.startsAt, "2026-07-21T12:00:00.000Z");

const unavailable = buildPlanAdjustment({
  ...base,
  resources: [{ operationId: "next", kind: "tool", resourceId: "offline-tool" }],
  unavailableToolIds: new Set(["offline-tool"])
});
assert.equal(unavailable.conflicts[0]?.kind, "tool_status");

const cycle = buildPlanAdjustment({
  ...base,
  dependencies: [
    { predecessorId: "done", successorId: "next", lagMinutes: 0 },
    { predecessorId: "next", successorId: "done", lagMinutes: 0 }
  ]
});
assert.equal(cycle.conflicts[0]?.kind, "dependency_cycle");

console.log(JSON.stringify({
  dependencyDelay: delayed.moves.length,
  travelBuffer: travel.moves[0]?.startsAt,
  reservationShift: reserved.moves[0]?.startsAt,
  unavailableTool: unavailable.conflicts[0]?.kind,
  cycle: cycle.conflicts[0]?.kind
}, null, 2));
