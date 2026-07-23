import assert from "node:assert/strict";
import test from "node:test";
import type { WaferStatusTileModel } from "../../types";
import { buildStepVisitHistory } from "./stepVisitHistoryModel";

function tile(overrides: Partial<WaferStatusTileModel> = {}): WaferStatusTileModel {
  return {
    id: "die-a4",
    projectId: "project-1",
    waferId: "wafer-a4",
    code: "A4",
    family: "ALPHA",
    dieLabel: "A4",
    stepLabel: "Pad Formation",
    status: "queued",
    waferStateName: "post-dice",
    currentStepId: "pad",
    processSteps: [
      { id: "dice", name: "Dicing", processArea: "Dicing", executionMode: "main", stepOrder: 1, status: "completed", executionId: "exec-dice-child", noteAuthorId: null, noteAuthorName: null, runNote: null, startedAt: null, completedAt: "2026-07-16T15:34:00Z", createdAt: "2026-07-16T15:34:00Z" },
      { id: "clean", name: "Cleaning", processArea: "Clean", executionMode: "main", stepOrder: 2, status: "completed", executionId: "exec-clean", noteAuthorId: null, noteAuthorName: null, runNote: "Completed Cleaning", startedAt: "2026-07-16T15:34:00Z", completedAt: "2026-07-16T15:35:00Z", createdAt: "2026-07-16T15:34:00Z" },
      { id: "piranha", name: "Piranha", processArea: "Clean", executionMode: "anytime", stepOrder: 3, status: "completed", executionId: "exec-piranha", noteAuthorId: null, noteAuthorName: null, runNote: "done", startedAt: "2026-07-16T17:28:00Z", completedAt: "2026-07-16T17:28:30Z", createdAt: "2026-07-16T17:28:00Z" },
      { id: "pad", name: "Pad Formation", processArea: "Lithography", executionMode: "main", stepOrder: 4, status: "queued", executionId: "exec-pad", noteAuthorId: null, noteAuthorName: null, runNote: null, startedAt: null, completedAt: null, createdAt: "2026-07-16T17:28:31Z" }
    ],
    checkpointHistory: [
      { kind: "attempt", id: "attempt-dice", inheritedFromParent: { waferId: "parent", waferCode: "ALPHA" }, stepId: "dice", stepName: "Dicing", attemptNumber: 1, state: "approved", occurredAt: "2026-07-16T15:30:00Z", startedAt: "2026-07-16T15:30:00Z", submission: { id: "submission-dice", occurredAt: "2026-07-16T15:34:00Z", actor: { id: "user-1", name: "William" }, note: "Diced well" }, withdrawals: [], decisions: [], effectiveDecision: null },
      { kind: "legacy_transition", id: "legacy-child-dice", sourceEventId: null, legacyType: "step_execution", occurredAt: "2026-07-16T15:34:00Z", actor: { id: null, name: null }, note: null, fromStepId: null, fromStepName: null, toStepId: "dice", toStepName: "Dicing", recordedStatus: "completed" },
      { kind: "attempt", id: "attempt-clean", stepId: "clean", stepName: "Cleaning", attemptNumber: 1, state: "approved", occurredAt: "2026-07-16T15:34:00Z", startedAt: "2026-07-16T15:34:00Z", submission: { id: "submission-clean", occurredAt: "2026-07-16T15:35:00Z", actor: { id: "user-1", name: "William" }, note: "Completed Cleaning" }, withdrawals: [], decisions: [], effectiveDecision: null },
      { kind: "legacy_transition", id: "move-clean", sourceEventId: "event-1", legacyType: "checkpoint_step_entered", occurredAt: "2026-07-16T15:34:01Z", actor: { id: "user-1", name: "William" }, note: "Moved to Cleaning", fromStepId: "dice", fromStepName: "Dicing", toStepId: "clean", toStepName: "Cleaning", recordedStatus: "checkpoint_move" },
      { kind: "attempt", id: "attempt-piranha", stepId: "piranha", stepName: "Piranha", attemptNumber: 1, state: "approved", occurredAt: "2026-07-16T17:28:00Z", startedAt: "2026-07-16T17:28:00Z", submission: { id: "submission-piranha", occurredAt: "2026-07-16T17:28:30Z", actor: { id: "user-1", name: "William" }, note: "done" }, withdrawals: [], decisions: [], effectiveDecision: null }
    ],
    ...overrides
  };
}

test("reduces audit events to one row per performed step plus the current step", () => {
  const visits = buildStepVisitHistory(tile());

  assert.deepEqual(visits.map((visit) => visit.stepName), ["Dicing", "Cleaning", "Piranha", "Pad Formation"]);
  assert.equal(visits[0]?.completionNote, "Diced well");
  assert.equal(visits[3]?.state, "current");
});

test("keeps repeated visits separate and assigns parameter records to the matching visit", () => {
  const base = tile();
  const cleaningStep = base.processSteps?.find((step) => step.id === "clean");
  if (!cleaningStep) throw new Error("Missing cleaning step fixture");
  const repeated = tile({
    processSteps: base.processSteps?.map((step) => step.id === "clean" ? {
      ...step,
      parameterRecords: [
        { id: "record-1", revision: 1, movementMutationId: "move-1", recordedAt: "2026-07-16T15:34:10Z", recordedById: null, recordedByName: null, notes: null, values: [] },
        { id: "record-2", revision: 1, movementMutationId: "move-2", recordedAt: "2026-07-16T18:00:10Z", recordedById: null, recordedByName: null, notes: null, values: [] }
      ]
    } : step),
    checkpointHistory: [
      ...(base.checkpointHistory ?? []),
      { kind: "attempt", id: "attempt-clean-2", stepId: "clean", stepName: "Cleaning", attemptNumber: 2, state: "approved", occurredAt: "2026-07-16T18:00:00Z", startedAt: "2026-07-16T18:00:00Z", submission: { id: "submission-clean-2", occurredAt: "2026-07-16T18:05:00Z", actor: { id: "user-1", name: "William" }, note: "Cleaned again" }, withdrawals: [], decisions: [], effectiveDecision: null }
    ]
  });

  const cleaningVisits = buildStepVisitHistory(repeated).filter((visit) => visit.stepId === "clean");
  assert.deepEqual(cleaningVisits.map((visit) => visit.visitNumber), [1, 2]);
  assert.deepEqual(cleaningVisits.map((visit) => visit.parameterRecords.map((record) => record.id)), [["record-1"], ["record-2"]]);
});

test("orders progression by completion time when repeated visits started in a different order", () => {
  const base = tile();
  const visits = buildStepVisitHistory(tile({
    currentStepId: "pad",
    checkpointHistory: [
      {
        kind: "attempt",
        id: "attempt-dice",
        stepId: "dice",
        stepName: "Dicing",
        attemptNumber: 1,
        state: "approved",
        occurredAt: "2026-07-16T15:00:00Z",
        startedAt: "2026-07-16T15:00:00Z",
        submission: { id: "submission-dice", occurredAt: "2026-07-16T15:11:00Z", actor: { id: "user-1", name: "William" }, note: null },
        withdrawals: [],
        decisions: [],
        effectiveDecision: null
      },
      {
        kind: "attempt",
        id: "attempt-clean-late",
        stepId: "clean",
        stepName: "Cleaning",
        attemptNumber: 1,
        state: "approved",
        occurredAt: "2026-07-16T15:01:00Z",
        startedAt: "2026-07-16T15:01:00Z",
        submission: { id: "submission-clean-late", occurredAt: "2026-07-16T15:14:00Z", actor: { id: "user-1", name: "William" }, note: null },
        withdrawals: [],
        decisions: [],
        effectiveDecision: null
      },
      {
        kind: "attempt",
        id: "attempt-clean-early",
        stepId: "clean",
        stepName: "Cleaning",
        attemptNumber: 2,
        state: "redo_required",
        occurredAt: "2026-07-16T15:05:00Z",
        startedAt: "2026-07-16T15:05:00Z",
        submission: { id: "submission-clean-early", occurredAt: "2026-07-16T15:11:30Z", actor: { id: "user-1", name: "William" }, note: null },
        withdrawals: [],
        decisions: [{
          id: "decision-clean-redo",
          outcome: "redo",
          occurredAt: "2026-07-16T15:12:00Z",
          actor: { id: "reviewer-1", name: "Reviewer" },
          note: "Repeat cleaning",
          destinationStepId: "clean",
          destinationStepName: "Cleaning",
          supersedesDecisionId: null,
          isEffective: true
        }],
        effectiveDecision: {
          id: "decision-clean-redo",
          outcome: "redo",
          occurredAt: "2026-07-16T15:12:00Z",
          actor: { id: "reviewer-1", name: "Reviewer" },
          note: "Repeat cleaning",
          destinationStepId: "clean",
          destinationStepName: "Cleaning",
          supersedesDecisionId: null,
          isEffective: true
        }
      }
    ],
    processSteps: base.processSteps
      ?.filter((step) => step.id !== "piranha")
      .map((step) => step.id === "pad" ? {
        ...step,
        startedAt: "2026-07-16T15:16:00Z",
        createdAt: "2026-07-16T15:16:00Z"
      } : step)
  }));

  assert.deepEqual(
    visits.map((visit) => [visit.stepName, visit.completedAt]),
    [
      ["Dicing", "2026-07-16T15:11:00Z"],
      ["Cleaning", "2026-07-16T15:11:30Z"],
      ["Cleaning", "2026-07-16T15:14:00Z"],
      ["Pad Formation", null]
    ]
  );
  assert.equal(visits[1]?.state, "returned");
  assert.equal(visits[1]?.redoDestinationStepName, "Cleaning");
  assert.deepEqual(visits[1]?.historyAction, { kind: "redo", targetStepName: "Cleaning" });
  assert.equal(visits[3]?.historyAction, null);
});

test("labels the current destination after a redo as a continuation", () => {
  const base = tile();
  const visits = buildStepVisitHistory(tile({
    currentStepId: "clean",
    processSteps: base.processSteps?.map((step) => step.id === "clean" ? {
      ...step,
      status: "queued",
      completedAt: null,
      startedAt: "2026-07-16T15:16:00Z"
    } : step),
    checkpointHistory: [{
      kind: "attempt",
      id: "attempt-clean-redo",
      stepId: "dice",
      stepName: "Dicing",
      attemptNumber: 1,
      state: "redo_required",
      occurredAt: "2026-07-16T15:10:00Z",
      startedAt: "2026-07-16T15:10:00Z",
      submission: { id: "submission-clean-redo", occurredAt: "2026-07-16T15:14:00Z", actor: { id: "reviewer", name: "Reviewer" }, note: null },
      withdrawals: [],
      decisions: [],
      effectiveDecision: {
        id: "decision-clean-redo",
        outcome: "redo",
        occurredAt: "2026-07-16T15:15:00Z",
        actor: { id: "reviewer", name: "Reviewer" },
        note: null,
        destinationStepId: "clean",
        destinationStepName: "Cleaning",
        supersedesDecisionId: null,
        isEffective: true
      }
    }]
  }));

  assert.deepEqual(visits.at(-1)?.historyAction, { kind: "continue", targetStepName: "Cleaning" });
});

test("labels a recorded step revert as an undo without changing its chronological visit", () => {
  const visits = buildStepVisitHistory(tile({
    revertHistory: [{
      id: "undo-cleaning",
      fromStepId: "clean",
      toStepId: "dice",
      occurredAt: "2026-07-16T15:36:00Z",
      reason: "Return to dicing"
    }]
  }));

  const cleaning = visits.find((visit) => visit.stepId === "clean");
  assert.deepEqual(cleaning?.historyAction, { kind: "undo", targetStepName: "Dicing" });
});

test("inserts a parameterized correction and hides removed visits", () => {
  const base = tile();
  const insertedStep = {
    id: "metrology",
    name: "Metrology",
    processArea: "Characterization",
    executionMode: "main" as const,
    stepOrder: 3,
    status: "pending" as const,
    executionId: null,
    noteAuthorId: null,
    noteAuthorName: null,
    runNote: null,
    startedAt: null,
    completedAt: null,
    createdAt: null,
    parameterRecords: [{
      id: "record-correction",
      processEventId: "event-correction",
      historyVisitId: "correction:event-correction",
      revision: 1,
      movementMutationId: "move-correction",
      recordedAt: "2026-07-16T16:00:00Z",
      recordedById: "user-1",
      recordedByName: "William",
      notes: "Recorded from instrument log",
      values: []
    }]
  };
  const visits = buildStepVisitHistory(tile({
    processSteps: [...(base.processSteps ?? []), insertedStep],
    historyCorrections: [{
      id: "event-correction",
      kind: "insert",
      visitId: "correction:event-correction",
      targetVisitId: null,
      anchorVisitId: "attempt:attempt-clean",
      placement: "after",
      stepId: "metrology",
      stepName: "Metrology",
      processArea: "Characterization",
      completedAt: "2026-07-16T16:00:00Z",
      occurredAt: "2026-07-20T10:00:00Z",
      reason: "Missing instrument log visit",
      actor: { id: "user-1", name: "William" }
    }, {
      id: "event-remove",
      kind: "remove",
      visitId: "correction:event-remove",
      targetVisitId: "attempt:attempt-piranha",
      anchorVisitId: null,
      placement: null,
      stepId: null,
      stepName: null,
      processArea: null,
      completedAt: null,
      occurredAt: "2026-07-20T10:01:00Z",
      reason: "Duplicate entry",
      actor: { id: "user-1", name: "William" }
    }]
  }));

  assert.deepEqual(visits.map((visit) => visit.stepName), ["Dicing", "Cleaning", "Metrology", "Pad Formation"]);
  assert.equal(visits[2]?.isHistoricalCorrection, true);
  assert.deepEqual(visits[2]?.parameterRecords.map((record) => record.id), ["record-correction"]);
  assert.equal(visits.at(-1)?.state, "current");
});

test("orders anchored and unanchored corrections by completion time across the full history", () => {
  const base = tile();
  const correctionSteps = [{
    id: "metrology",
    name: "Metrology",
    processArea: "Characterization",
    executionMode: "main" as const,
    stepOrder: 5,
    status: "completed" as const,
    executionId: null,
    noteAuthorId: null,
    noteAuthorName: null,
    runNote: null,
    startedAt: null,
    completedAt: null,
    createdAt: null
  }, {
    id: "inspection",
    name: "Inspection",
    processArea: "Characterization",
    executionMode: "main" as const,
    stepOrder: 6,
    status: "completed" as const,
    executionId: null,
    noteAuthorId: null,
    noteAuthorName: null,
    runNote: null,
    startedAt: null,
    completedAt: null,
    createdAt: null
  }];
  const visits = buildStepVisitHistory(tile({
    processSteps: [...(base.processSteps ?? []), ...correctionSteps],
    historyCorrections: [{
      id: "event-anchored-old",
      kind: "insert",
      visitId: "correction:event-anchored-old",
      targetVisitId: null,
      anchorVisitId: "attempt-clean",
      placement: "after",
      stepId: "metrology",
      stepName: "Metrology",
      processArea: "Characterization",
      completedAt: "2026-07-16T15:31:00Z",
      occurredAt: "2026-07-20T10:00:00Z",
      reason: "Recovered from instrument log",
      actor: { id: "user-1", name: "William" }
    }, {
      id: "event-unanchored-old",
      kind: "insert",
      visitId: "correction:event-unanchored-old",
      targetVisitId: null,
      anchorVisitId: "removed-visit",
      placement: "before",
      stepId: "inspection",
      stepName: "Inspection",
      processArea: "Characterization",
      completedAt: "2026-07-16T15:34:30Z",
      occurredAt: "2026-07-20T10:01:00Z",
      reason: "Anchor was later removed",
      actor: { id: "user-1", name: "William" }
    }]
  }));

  assert.deepEqual(
    visits.map((visit) => [visit.stepName, visit.completedAt]),
    [
      ["Metrology", "2026-07-16T15:31:00Z"],
      ["Dicing", "2026-07-16T15:34:00Z"],
      ["Inspection", "2026-07-16T15:34:30Z"],
      ["Cleaning", "2026-07-16T15:35:00Z"],
      ["Piranha", "2026-07-16T17:28:30Z"],
      ["Pad Formation", null]
    ]
  );
});
