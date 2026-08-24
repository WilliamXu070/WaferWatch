import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessWorkspaceDelta, ProcessWorkspaceSnapshot } from "./types";
import {
  addProcessWorkspaceOverlay,
  applyProcessWorkspaceDelta,
  getProcessWorkspaceState,
  markProcessWorkspaceOverlayCommitted,
  rejectProcessWorkspaceOverlay,
  setProcessWorkspaceSnapshot
} from "./store";

const templateId = "workspace-store-test";
const snapshot: ProcessWorkspaceSnapshot = {
  templateId,
  revision: 4,
  processDefinition: { stages: [], steps: [], transitions: [] },
  currentState: [{ assignment_id: "assignment-1", assignment_revision: 1 }],
  archivedState: [],
  operationHistory: [],
  plan: [],
  activeBatchRuns: [],
  calendar: []
};

function delta(overrides: Partial<ProcessWorkspaceDelta> = {}): ProcessWorkspaceDelta {
  return {
    templateId,
    afterRevision: 4,
    revision: 5,
    currentRevision: 5,
    hasMore: false,
    hasGap: false,
    changes: [],
    removedEntityIds: {},
    currentState: [{ assignment_id: "assignment-1", assignment_revision: 2 }],
    archivedState: [],
    operationHistory: [],
    batchRuns: [],
    plan: [],
    calendar: [],
    processDefinition: { stages: [], steps: [], transitions: [] },
    ...overrides
  };
}

test("applies one ordered delta and ignores a duplicated delivery", () => {
  setProcessWorkspaceSnapshot(snapshot);
  assert.equal(applyProcessWorkspaceDelta(delta()), true);
  assert.equal(getProcessWorkspaceState(templateId).snapshot?.revision, 5);
  assert.equal(applyProcessWorkspaceDelta(delta()), true);
  assert.equal(getProcessWorkspaceState(templateId).snapshot?.revision, 5);
});

test("rejects an out-of-order delta so the bridge requests one snapshot", () => {
  setProcessWorkspaceSnapshot(snapshot);
  assert.equal(applyProcessWorkspaceDelta(delta({ afterRevision: 3, revision: 6 })), false);
  assert.equal(getProcessWorkspaceState(templateId).snapshot?.revision, 4);
});

test("rejects an explicit retained-log gap", () => {
  setProcessWorkspaceSnapshot(snapshot);
  assert.equal(applyProcessWorkspaceDelta(delta({ hasGap: true })), false);
});

test("keeps an optimistic overlay until its exact committed revision arrives", () => {
  setProcessWorkspaceSnapshot(snapshot);
  addProcessWorkspaceOverlay(templateId, {
    mutationId: "mutation-1",
    commandKind: "calendar.create",
    baseRevision: 4,
    patch: { calendar: [{ id: "calendar-1", revision: 1 }] }
  });
  assert.equal(getProcessWorkspaceState(templateId).optimisticSnapshot?.calendar.length, 1);

  markProcessWorkspaceOverlayCommitted(templateId, "mutation-1", 5);
  assert.equal(getProcessWorkspaceState(templateId).overlays[0]?.committedRevision, 5);
  assert.equal(applyProcessWorkspaceDelta(delta({
    changes: [{ client_mutation_id: "mutation-1" }],
    calendar: [{ id: "calendar-1", revision: 1 }]
  })), true);
  assert.equal(getProcessWorkspaceState(templateId).overlays.length, 0);
  assert.equal(getProcessWorkspaceState(templateId).snapshot?.calendar.length, 1);
});

test("rejecting a command removes only its optimistic overlay", () => {
  setProcessWorkspaceSnapshot(snapshot);
  addProcessWorkspaceOverlay(templateId, {
    mutationId: "mutation-rejected",
    commandKind: "wafer.archive",
    baseRevision: 4,
    patch: { removedEntityIds: { assignmentIds: ["assignment-1"] } }
  });
  assert.equal(getProcessWorkspaceState(templateId).optimisticSnapshot?.currentState.length, 0);
  rejectProcessWorkspaceOverlay(templateId, "mutation-rejected");
  assert.equal(getProcessWorkspaceState(templateId).optimisticSnapshot?.currentState.length, 1);
});
