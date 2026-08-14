import assert from "node:assert/strict";
import test from "node:test";
import { buildEffectiveCheckpointRouteMap } from "./effectiveCheckpointRoutes";

test("treats the corrected Pre-Bake to Chromium route as approved", () => {
  const routes = buildEffectiveCheckpointRouteMap([{
    id: "auto-correction",
    eventType: "checkpoint_step_entered",
    eventAt: "2026-07-17T15:43:51.296701Z",
    metadata: {
      checkpoint_decision_id: "pre-bake-decision",
      corrected_event_id: "incorrect-redo-route",
      movement_kind: "checkpoint_route_auto_redo_correction",
      route_decision: "approved",
      target_step_id: "chromium",
      target_step_name: "Chromium Deposition"
    }
  }]);

  assert.deepEqual(routes.get("pre-bake-decision"), {
    eventId: "auto-correction",
    occurredAt: "2026-07-17T15:43:51.296701Z",
    outcome: "approve",
    destinationStepId: null,
    destinationStepName: null
  });
});

test("uses the latest append-only route correction as the effective redo destination", () => {
  const routes = buildEffectiveCheckpointRouteMap([{
    id: "auto-correction",
    eventType: "checkpoint_step_entered",
    eventAt: "2026-07-17T15:43:51.296701Z",
    metadata: {
      checkpoint_decision_id: "post-bake-decision",
      corrected_event_id: "incorrect-redo-route",
      movement_kind: "checkpoint_route_auto_redo_correction",
      route_decision: "approved"
    }
  }, {
    id: "operator-correction",
    eventType: "checkpoint_step_entered",
    eventAt: "2026-07-20T16:09:10.592204Z",
    metadata: {
      checkpoint_decision_id: "post-bake-decision",
      corrected_event_id: "auto-correction",
      movement_kind: "checkpoint_route_correction",
      route_decision: "redo",
      target_step_id: "pre-bake",
      target_step_name: "Pre-Bake"
    }
  }]);

  assert.deepEqual(routes.get("post-bake-decision"), {
    eventId: "operator-correction",
    occurredAt: "2026-07-20T16:09:10.592204Z",
    outcome: "redo",
    destinationStepId: "pre-bake",
    destinationStepName: "Pre-Bake"
  });
});
