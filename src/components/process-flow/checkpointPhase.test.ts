import test from "node:test";
import assert from "node:assert/strict";
import {
  canMoveToAnotherStep,
  canSubmitCheckpoint,
  getCheckpointPhase,
  getCheckpointStateLabel
} from "./checkpointPhase.ts";

test("maps only submitted or approved work to the Complete side", () => {
  assert.equal(getCheckpointPhase("running"), "beginning");
  assert.equal(getCheckpointPhase("redo_required"), "beginning");
  assert.equal(getCheckpointPhase("awaiting_checkpoint"), "complete");
  assert.equal(getCheckpointPhase("ready_to_move"), "complete");
});

test("separates checkpoint submission from approved cross-step movement", () => {
  assert.equal(canSubmitCheckpoint("running"), true);
  assert.equal(canSubmitCheckpoint("awaiting_checkpoint"), false);
  assert.equal(canMoveToAnotherStep("awaiting_checkpoint"), false);
  assert.equal(canMoveToAnotherStep("ready_to_move"), true);
  assert.equal(getCheckpointStateLabel("ready_to_move"), "Approved, ready to move");
});
