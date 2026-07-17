import assert from "node:assert/strict";
import test from "node:test";
import { getCheckpointRouteCorrectionState } from "./checkpointRouteCorrection";

test("keeps only the latest Beginning destination in a correction chain", () => {
  const state = getCheckpointRouteCorrectionState([
    {
      id: "move-wrong",
      eventAt: "2026-07-17T10:00:00Z",
      metadata: {
        assignment_id: "assignment-1",
        checkpoint_decision_id: "decision-1",
        from_step_id: "complete-step",
        target_step_id: "wrong-step",
        target_step_name: "Wrong step"
      }
    },
    {
      id: "move-corrected-once",
      eventAt: "2026-07-17T10:01:00Z",
      metadata: {
        assignment_id: "assignment-1",
        checkpoint_decision_id: "decision-1",
        from_step_id: "complete-step",
        target_step_id: "second-wrong-step",
        target_step_name: "Second wrong step",
        corrected_event_id: "move-wrong",
        route_decision: "approved"
      }
    },
    {
      id: "move-correct",
      eventAt: "2026-07-17T10:02:00Z",
      metadata: {
        assignment_id: "assignment-1",
        checkpoint_decision_id: "decision-1",
        from_step_id: "complete-step",
        target_step_id: "correct-step",
        target_step_name: "Correct step",
        corrected_event_id: "move-corrected-once",
        route_decision: "redo"
      }
    }
  ]);

  assert.deepEqual([...state.correctedEventIds], ["move-wrong", "move-corrected-once"]);
  assert.deepEqual([...state.visibleEventIds], ["move-correct"]);
  assert.deepEqual(state.activeRouteByAssignmentId.get("assignment-1"), {
    assignmentId: "assignment-1",
    checkpointDecisionId: "decision-1",
    fromStepId: "complete-step",
    targetStepId: "correct-step",
    targetStepName: "Correct step",
    routeDecision: "redo"
  });
  assert.deepEqual(state.correctionByDecisionId.get("decision-1")?.targetStepId, "correct-step");
});

test("does not treat an initial assignment or an anytime detour as a correctable checkpoint route", () => {
  const state = getCheckpointRouteCorrectionState([
    {
      id: "anytime-entry",
      eventAt: "2026-07-17T10:00:00Z",
      metadata: {
        assignment_id: "assignment-1",
        from_step_id: "main-step",
        target_step_id: "anytime-step",
        movement_kind: "anytime_enter"
      }
    }
  ]);

  assert.equal(state.activeRouteByAssignmentId.size, 0);
});
