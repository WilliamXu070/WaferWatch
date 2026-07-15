import test from "node:test";
import assert from "node:assert/strict";
import {
  canMoveToAnotherStep,
  canReviewerRouteCheckpoint,
  canSubmitCheckpoint,
  getCheckpointPhase,
  getReviewerRouteDecision,
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

test("allows only the assigned reviewer to route awaiting Complete work", () => {
  const reviewerRoute = {
    attemptId: "attempt-1",
    canReview: true,
    currentUserId: "reviewer-1",
    requiredReviewerId: "reviewer-1",
    status: "awaiting_checkpoint" as const
  };

  assert.equal(canReviewerRouteCheckpoint(reviewerRoute), true);
  assert.equal(canReviewerRouteCheckpoint({ ...reviewerRoute, currentUserId: "another-user" }), false);
  assert.equal(canReviewerRouteCheckpoint({ ...reviewerRoute, attemptId: null }), false);
  assert.equal(canReviewerRouteCheckpoint({ ...reviewerRoute, status: "ready_to_move" }), false);
});

test("treats same or earlier reviewer drops as redo and later drops as approval", () => {
  assert.equal(getReviewerRouteDecision(20, 30), "approved");
  assert.equal(getReviewerRouteDecision(20, 20), "redo");
  assert.equal(getReviewerRouteDecision(20, 10), "redo");
});
