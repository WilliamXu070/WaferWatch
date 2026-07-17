import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SequentialStepPicker } from "./SequentialStepPicker";
import type { StepVisitHistoryItem } from "./stepVisitHistoryModel";

const returnedVisit: StepVisitHistoryItem = {
  id: "attempt:redo-cleaning",
  stepId: "chromium",
  stepName: "Chromium Deposition",
  processArea: "Deposition",
  executionId: "execution-1",
  state: "returned",
  occurredAt: "2026-07-16T15:10:00Z",
  startedAt: "2026-07-16T15:10:00Z",
  completedAt: "2026-07-16T15:14:00Z",
  completionNote: null,
  completionActor: { id: null, name: null },
  redoDestinationStepId: "cleaning",
  redoDestinationStepName: "Cleaning",
  parameterRecords: [],
  sequence: 3,
  visitNumber: 1
};

const currentVisit: StepVisitHistoryItem = {
  ...returnedVisit,
  id: "current:cleaning",
  stepId: "cleaning",
  stepName: "Cleaning",
  state: "current",
  completedAt: null,
  redoDestinationStepId: null,
  redoDestinationStepName: null,
  sequence: 4,
  visitNumber: 2
};

test("keeps the selected redo visit recolored and names its rollback destination", () => {
  const markup = renderToStaticMarkup(
    <SequentialStepPicker
      visits={[returnedVisit, currentVisit]}
      family="ALPHA"
      selectedVisitId={returnedVisit.id}
      onSelectVisit={() => undefined}
    />
  );

  assert.match(markup, /data-visit-state="returned"/);
  assert.match(markup, /background-color:#f5dfca/);
  assert.match(markup, /Redo → Cleaning/);
  assert.match(markup, /box-shadow:0 0 0 2px #171714/);
  assert.match(markup, /Current step/);
  assert.match(markup, /aria-label="Step history timeline, swipe for more"/);
  assert.match(markup, /wafer-step-picker__marker/);
});
