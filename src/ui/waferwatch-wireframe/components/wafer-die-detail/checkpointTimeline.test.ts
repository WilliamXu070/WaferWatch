import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCheckpointTimeline,
  flattenCheckpointTimeline,
  mergeCheckpointTimelineLineage,
  type CheckpointTimelineAttemptSource,
  type CheckpointTimelineDecisionSource
} from "./checkpointTimelineModel";

const noActor = { id: null, name: null } as const;

function attempt(overrides: Partial<CheckpointTimelineAttemptSource> = {}): CheckpointTimelineAttemptSource {
  return {
    id: "attempt-1",
    stepId: "step-coat",
    stepName: "Coat",
    attemptNumber: 1,
    status: "awaiting_checkpoint",
    createdAt: "2026-07-15T10:00:00.000Z",
    startedAt: "2026-07-15T10:00:00.000Z",
    submittedAt: "2026-07-15T11:00:00.000Z",
    submittedBy: { id: "operator-1", name: "Operator One" },
    submissionNote: "Ready for review",
    ...overrides
  };
}

function decision(overrides: Partial<CheckpointTimelineDecisionSource> = {}): CheckpointTimelineDecisionSource {
  return {
    id: "decision-1",
    attemptId: "attempt-1",
    outcome: "approve",
    occurredAt: "2026-07-15T12:00:00.000Z",
    actor: { id: "reviewer-1", name: "Reviewer One" },
    note: "Approved",
    destinationStepId: "step-etch",
    destinationStepName: "Etch",
    supersedesDecisionId: null,
    ...overrides
  };
}

test("orders attempts chronologically and exposes submission plus redo destination", () => {
  const entries = buildCheckpointTimeline({
    attempts: [
      attempt(),
      attempt({
        id: "attempt-2",
        stepId: "step-etch",
        stepName: "Etch",
        attemptNumber: 2,
        createdAt: "2026-07-15T13:00:00.000Z",
        startedAt: "2026-07-15T13:00:00.000Z",
        submittedAt: "2026-07-15T14:00:00.000Z"
      })
    ],
    decisions: [
      decision(),
      decision({
        id: "decision-2",
        attemptId: "attempt-2",
        outcome: "redo",
        occurredAt: "2026-07-15T15:00:00.000Z",
        destinationStepId: "step-coat",
        destinationStepName: "Coat"
      })
    ],
    withdrawals: [],
    legacyEntries: []
  });

  assert.deepEqual(entries.map((entry) => entry.id), ["attempt-1", "attempt-2"]);
  assert.equal(entries[0]?.kind, "attempt");
  assert.equal(entries[0]?.kind === "attempt" ? entries[0].submission?.note : null, "Ready for review");
  assert.equal(entries[1]?.kind === "attempt" ? entries[1].state : null, "redo_required");
  assert.equal(entries[1]?.kind === "attempt" ? entries[1].effectiveDecision?.destinationStepName : null, "Coat");
});

test("marks only the latest unsuperseded correction as effective", () => {
  const entries = buildCheckpointTimeline({
    attempts: [attempt()],
    decisions: [
      decision(),
      decision({
        id: "decision-2",
        outcome: "redo",
        occurredAt: "2026-07-15T12:30:00.000Z",
        supersedesDecisionId: "decision-1"
      })
    ],
    withdrawals: [],
    legacyEntries: []
  });
  const entry = entries[0];

  assert.equal(entry?.kind, "attempt");
  if (entry?.kind !== "attempt") return;
  assert.deepEqual(entry.decisions.map(({ id, isEffective }) => ({ id, isEffective })), [
    { id: "decision-1", isEffective: false },
    { id: "decision-2", isEffective: true }
  ]);
  assert.equal(entry.state, "redo_required");
});

test("a withdrawal after submission is an explicit withdrawn checkpoint state", () => {
  const entries = buildCheckpointTimeline({
    attempts: [attempt()],
    decisions: [],
    withdrawals: [{
      id: "withdrawal-1",
      attemptId: "attempt-1",
      occurredAt: "2026-07-15T11:30:00.000Z",
      actor: { id: "operator-1", name: "Operator One" },
      note: "Need another measurement"
    }],
    legacyEntries: []
  });

  assert.equal(entries[0]?.kind === "attempt" ? entries[0].state : null, "withdrawn");
  assert.equal(entries[0]?.kind === "attempt" ? entries[0].withdrawals[0]?.note : null, "Need another measurement");
});

test("keeps legacy transitions explicit, chronological, and source-identifiable", () => {
  const entries = buildCheckpointTimeline({
    attempts: [attempt()],
    decisions: [],
    withdrawals: [],
    legacyEntries: [{
      id: "legacy-event:event-1",
      sourceEventId: "event-1",
      legacyType: "wafer_step_reverted",
      occurredAt: "2026-07-15T09:00:00.000Z",
      actor: noActor,
      note: "Redo coating",
      fromStepId: "step-etch",
      fromStepName: "Etch",
      toStepId: "step-coat",
      toStepName: "Coat",
      recordedStatus: "revert"
    }]
  });

  assert.deepEqual(entries.map((entry) => entry.id), ["legacy-event:event-1", "attempt-1"]);
  const legacy = entries[0];
  assert.equal(legacy?.kind, "legacy_transition");
  assert.equal(legacy?.kind === "legacy_transition" ? legacy.sourceEventId : null, "event-1");
  assert.deepEqual(legacy?.kind === "legacy_transition" ? legacy.actor : null, noActor);
});

test("inherits the parent checkpoint audit trail without changing actors or source ids", () => {
  const parentEntries = buildCheckpointTimeline({
    attempts: [attempt({ stepId: "step-dice", stepName: "Dicing" })],
    decisions: [decision({ destinationStepId: "step-inspect", destinationStepName: "Inspect" })],
    withdrawals: [],
    legacyEntries: [{
      id: "legacy-execution:parent-setup",
      sourceEventId: null,
      legacyType: "step_execution",
      occurredAt: "2026-07-15T09:00:00.000Z",
      actor: noActor,
      note: null,
      fromStepId: null,
      fromStepName: null,
      toStepId: "step-setup",
      toStepName: "Setup",
      recordedStatus: "completed"
    }]
  });
  const childEntries = buildCheckpointTimeline({
    attempts: [attempt({
      id: "attempt-child-1",
      stepId: "step-inspect",
      stepName: "Inspect",
      createdAt: "2026-07-15T13:00:00.000Z",
      startedAt: "2026-07-15T13:00:00.000Z",
      submittedAt: null,
      submittedBy: noActor,
      submissionNote: null,
      status: "in_progress"
    })],
    decisions: [],
    withdrawals: [],
    legacyEntries: []
  });

  const entries = mergeCheckpointTimelineLineage({
    currentEntries: childEntries,
    parentEntries,
    parentWaferId: "parent-wafer-1",
    parentWaferCode: "ALPHA-01"
  });

  assert.deepEqual(entries.map((entry) => entry.id), [
    "legacy-execution:parent-setup",
    "attempt-1",
    "attempt-child-1"
  ]);
  assert.deepEqual(entries[0]?.inheritedFromParent, {
    waferId: "parent-wafer-1",
    waferCode: "ALPHA-01"
  });
  assert.equal(entries[0]?.kind === "legacy_transition" ? entries[0].actor.name : "unexpected", null);
  assert.equal(entries[1]?.kind === "attempt" ? entries[1].effectiveDecision?.actor.name : null, "Reviewer One");
  assert.equal(entries[2]?.inheritedFromParent, undefined);
});

test("flattens arrival, submission, approval, movement, and redo into actual event order", () => {
  const entries = buildCheckpointTimeline({
    attempts: [attempt()],
    decisions: [decision()],
    withdrawals: [],
    legacyEntries: [{
      id: "move-1",
      sourceEventId: "event-move-1",
      legacyType: "checkpoint_step_entered",
      occurredAt: "2026-07-15T12:30:00.000Z",
      actor: { id: "operator-1", name: "Operator One" },
      note: "Moved after approval",
      fromStepId: "step-coat",
      fromStepName: "Coat",
      toStepId: "step-etch",
      toStepName: "Etch",
      recordedStatus: "checkpoint_move"
    }]
  });
  const events = flattenCheckpointTimeline(entries);

  assert.deepEqual(events.map((event) => event.title), [
    "Arrived · Beginning",
    "Submitted · Complete · Awaiting checkpoint",
    "Approved · Complete · Ready to move",
    "Moved here · Beginning"
  ]);
  assert.deepEqual(events.map((event) => event.tone), ["neutral", "awaiting", "approved", "neutral"]);
});

test("labels entry into and return from an anytime step in die history", () => {
  const entries = buildCheckpointTimeline({
    attempts: [],
    decisions: [],
    withdrawals: [],
    legacyEntries: [
      {
        id: "enter-piranha",
        sourceEventId: "event-enter-piranha",
        legacyType: "checkpoint_step_entered",
        occurredAt: "2026-07-15T12:30:00.000Z",
        actor: { id: "operator-1", name: "Operator One" },
        note: null,
        fromStepId: "step-clean",
        fromStepName: "Cleaning",
        toStepId: "step-piranha",
        toStepName: "Piranha",
        recordedStatus: "anytime_enter"
      },
      {
        id: "return-cleaning",
        sourceEventId: "event-return-cleaning",
        legacyType: "checkpoint_step_entered",
        occurredAt: "2026-07-15T13:30:00.000Z",
        actor: { id: "operator-1", name: "Operator One" },
        note: null,
        fromStepId: "step-piranha",
        fromStepName: "Piranha",
        toStepId: "step-clean",
        toStepName: "Cleaning",
        recordedStatus: "anytime_return"
      }
    ]
  });

  assert.deepEqual(flattenCheckpointTimeline(entries).map((event) => event.title), [
    "Entered anytime step · Beginning",
    "Returned to main flow · Beginning"
  ]);
});
