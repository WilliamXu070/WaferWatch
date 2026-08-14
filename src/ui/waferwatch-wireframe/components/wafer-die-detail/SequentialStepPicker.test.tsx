import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SequentialStepPicker } from "./SequentialStepPicker";
import type { StepVisitHistoryItem } from "./stepVisitHistoryModel";

const completedSourceVisit: StepVisitHistoryItem = {
  id: "attempt:chromium-complete",
  stepId: "chromium",
  stepName: "Chromium Deposition",
  processArea: "Deposition",
  executionId: "execution-1",
  state: "completed",
  occurredAt: "2026-07-16T15:10:00Z",
  startedAt: "2026-07-16T15:10:00Z",
  completedAt: "2026-07-16T15:14:00Z",
  completionNote: null,
  completionActor: { id: null, name: null },
  redoDestinationStepId: "pre-bake",
  redoDestinationStepName: "Pre-Bake",
  parameterRecords: [],
  sequence: 3,
  visitNumber: 1
};

const currentVisit: StepVisitHistoryItem = {
  ...completedSourceVisit,
  id: "current:pre-bake",
  stepId: "pre-bake",
  stepName: "Pre-Bake",
  state: "current",
  completedAt: null,
  redoDestinationStepId: null,
  redoDestinationStepName: null,
  historyAction: { kind: "redo", targetStepName: "Pre-Bake" },
  sequence: 4,
  visitNumber: 2
};

test("recolors the selected redo destination while leaving completed Chromium normal", () => {
  const markup = renderToStaticMarkup(
    <SequentialStepPicker
      visits={[completedSourceVisit, currentVisit]}
      family="ALPHA"
      selectedVisitId={currentVisit.id}
      onSelectVisit={() => undefined}
    />
  );

  assert.doesNotMatch(markup, /data-visit-state="returned"/);
  assert.match(markup, /background-color:#f5dfca/);
  assert.match(markup, /Chromium Deposition/);
  assert.match(markup, /Redo → Pre-Bake/);
  assert.match(markup, /box-shadow:0 0 0 2px #171714/);
  assert.match(markup, /Current step/);
  assert.doesNotMatch(markup, /Continue →/);
  assert.match(markup, /aria-label="Step history timeline, swipe for more"/);
  assert.match(markup, /aria-current="step"/);
  assert.match(markup, /wafer-step-picker__marker/);
});

test("renders an undo destination as a distinct history action", () => {
  const markup = renderToStaticMarkup(
    <SequentialStepPicker
      visits={[{
        ...completedSourceVisit,
        id: "undo-spin-coating",
        state: "completed",
        historyAction: { kind: "undo", targetStepName: "Post-Bake" }
      }]}
      family="ALPHA"
      onSelectVisit={() => undefined}
    />
  );

  assert.match(markup, /Undo → Post-Bake/);
  assert.match(markup, /bg-\[\#e8edf7\] text-\[\#3b557a\]/);
});
