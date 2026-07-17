import assert from "node:assert/strict";
import test from "node:test";
import { getHistoryUndoState } from "./historyUndo";

test("projects append-only history undo events into superseded state ids", () => {
  const state = getHistoryUndoState([
    { id: "arrival", eventType: "checkpoint_step_entered", metadata: {} },
    {
      id: "undo-arrival",
      eventType: "wafer_history_undone",
      metadata: {
        undone_process_event_id: "arrival",
        undone_decision_id: "decision-1"
      }
    },
    {
      id: "undo-attempt",
      eventType: "wafer_history_undone",
      metadata: { undone_attempt_id: "attempt-1" }
    }
  ]);

  assert.deepEqual([...state.undoneProcessEventIds], ["arrival"]);
  assert.deepEqual([...state.undoneDecisionIds], ["decision-1"]);
  assert.deepEqual([...state.undoneAttemptIds], ["attempt-1"]);
});
