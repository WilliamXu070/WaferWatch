import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessWorkspaceDelta, ProcessWorkspaceSnapshot } from "./types";
import {
  applyProcessWorkspaceDelta,
  getProcessWorkspaceState,
  setProcessWorkspaceSnapshot
} from "./store";

const templateId = "workspace-store-test";
const snapshot: ProcessWorkspaceSnapshot = {
  templateId,
  revision: 4,
  processDefinition: { stages: [], transitions: [] },
  currentState: [{ assignment_id: "assignment-1", assignment_revision: 1 }],
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
    operationHistory: [],
    batchRuns: [],
    plan: [],
    processDefinition: { stages: [], steps: [] },
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
