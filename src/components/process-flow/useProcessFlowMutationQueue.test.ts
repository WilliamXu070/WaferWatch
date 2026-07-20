import assert from "node:assert/strict";
import test from "node:test";
import { isProcessFlowAssignmentLocked } from "./useProcessFlowMutationQueue";

test("locks only the die whose core move or parameters are unresolved", () => {
  assert.equal(isProcessFlowAssignmentLocked("saving_move"), true);
  assert.equal(isProcessFlowAssignmentLocked("awaiting_parameters"), true);
  assert.equal(isProcessFlowAssignmentLocked("saving_parameters"), true);
  assert.equal(isProcessFlowAssignmentLocked("uploading_files"), false);
  assert.equal(isProcessFlowAssignmentLocked("synced"), false);
  assert.equal(isProcessFlowAssignmentLocked("failed"), false);
});
