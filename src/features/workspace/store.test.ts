import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessHotBootstrap, ProcessWorkspaceDelta, ProcessWorkspaceSnapshot } from "./types";
import {
  addProcessWorkspaceOverlay,
  applyProcessWorkspaceDelta,
  clearProcessWorkspaceSessions,
  getProcessWorkspaceState,
  markProcessWorkspaceOverlayCommitted,
  rejectProcessWorkspaceOverlay,
  setProcessWorkspaceHotBootstrap,
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

function hotBootstrap(id: string, revision = 4): ProcessHotBootstrap {
  return {
    templateId: id,
    revision,
    generatedAt: "2026-08-26T12:00:00.000Z",
    calendarRange: {
      from: "2026-08-24T00:00:00.000Z",
      to: "2026-08-31T00:00:00.000Z"
    },
    processSummary: { id, name: id, version: "1", ownerProjectId: null },
    statusSummary: { assignmentCount: 1, waferCount: 1, awaitingReviewCount: 0 },
    processDefinition: { stages: [], steps: [], transitions: [] },
    currentState: [{ assignment_id: "assignment-1", wafer_id: "wafer-1", current_step_id: "step-1" }],
    calendar: []
  };
}

test("seeds the ordered workspace store from a bounded hot bootstrap", () => {
  clearProcessWorkspaceSessions();
  setProcessWorkspaceHotBootstrap(hotBootstrap(templateId));
  const state = getProcessWorkspaceState(templateId);
  assert.equal(state.snapshot?.revision, 4);
  assert.equal(state.hotBootstrap?.processSummary.name, templateId);
  assert.equal(state.calendarWeeks.length, 1);
  assert.deepEqual(Object.keys(state.normalizedAssignments.assignmentsById), ["assignment-1"]);
  assert.deepEqual(state.normalizedAssignments.assignmentIdsByStepId["step-1"], ["assignment-1"]);
});

test("retains only the three most recently used process workspaces", () => {
  clearProcessWorkspaceSessions();
  for (const id of ["process-a", "process-b", "process-c", "process-d"]) {
    setProcessWorkspaceHotBootstrap(hotBootstrap(id));
  }
  assert.equal(getProcessWorkspaceState("process-a").snapshot, null);
  assert.equal(getProcessWorkspaceState("process-b").snapshot?.templateId, "process-b");
  assert.equal(getProcessWorkspaceState("process-d").snapshot?.templateId, "process-d");
});

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
