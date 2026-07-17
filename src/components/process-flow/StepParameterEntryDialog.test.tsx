import assert from "node:assert/strict";
import test from "node:test";
import type { SetStateAction } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  StepParameterEntryDialog,
  mergePendingStepParameterEntries,
  prepareLocalParametersForSave,
  saveStepParameterAttachmentsForEntries,
  saveStepParametersForEntries,
  settlePendingStepParameterEntries,
  updateDraftParameterFromInput,
  type DraftParameter,
  type PendingStepParameterEntry
} from "./StepParameterEntryDialog";

function makeDraftParameter(): DraftParameter {
  return {
    id: "local-parameter",
    key: "temperature",
    label: "Temperature",
    type: "text",
    unit: "",
    value: "",
    valueText: "",
    notes: "",
    scope: "local"
  };
}

test("ignores an untouched extra row when saving an added parameter", () => {
  const filledParameter = {
    ...makeDraftParameter(),
    label: "Temperature",
    valueText: "100",
    notes: "Measured after cleaning"
  };
  const blankParameter: DraftParameter = {
    ...makeDraftParameter(),
    id: "unused-local-parameter",
    key: "",
    label: "",
    valueText: "",
    notes: ""
  };

  const prepared = prepareLocalParametersForSave(
    [filledParameter, blankParameter],
    []
  );

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.parameters.length, 1);
  assert.equal(prepared.parameters[0].label, "Temperature");
  assert.equal(prepared.parameters[0].key, "temperature");
});

test("generates collision-safe internal keys without exposing a database key field", () => {
  const prepared = prepareLocalParametersForSave([
    { ...makeDraftParameter(), id: "temperature-2", label: "Temperature" },
    { ...makeDraftParameter(), id: "temperature-3", label: "Temperature" }
  ], ["temperature"]);

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.deepEqual(prepared.parameters.map((parameter) => parameter.key), [
    "temperature_2",
    "temperature_3"
  ]);
});

test("asks for the visible parameter name when a partial row has no label", () => {
  const prepared = prepareLocalParametersForSave([
    { ...makeDraftParameter(), key: "", label: "", valueText: "100" }
  ], []);

  assert.deepEqual(prepared, {
    ok: false,
    error: "Name each added parameter before saving."
  });
});

test("captures local row input before React clears the event target", () => {
  for (const [key, value] of [["valueText", "425"], ["notes", "Measured after settling"]] as const) {
    let queuedUpdate: SetStateAction<DraftParameter[]> | null = null;
    const event: { currentTarget: { value: string } | null } = { currentTarget: { value } };

    updateDraftParameterFromInput(
      (update) => { queuedUpdate = update; },
      "local-parameter",
      key,
      event as { currentTarget: HTMLInputElement }
    );
    event.currentTarget = null;

    assert.equal(typeof queuedUpdate, "function");
    const next = (queuedUpdate as (current: DraftParameter[]) => DraftParameter[])([makeDraftParameter()]);
    assert.equal(next[0][key], value);
  }
});

test("renders the moved item, global template values, and local parameter controls", () => {
  const markup = renderToStaticMarkup(
    <StepParameterEntryDialog
      entries={[{
        assignmentId: "00000000-0000-4000-8000-000000000001",
        movementMutationId: "00000000-0000-4000-8000-000000000002",
        waferLabel: "GAMMA_2_1",
        stepId: "00000000-0000-4000-8000-000000000003",
        stepName: "Dicing",
        parametersSchema: {
          version: 1,
          fields: [{
            id: "blade-speed",
            key: "blade_speed",
            label: "Blade speed",
            type: "number",
            unit: "rpm",
            required: true,
            description: "Measured spindle speed",
            defaultValue: "12000"
          }]
        }
      }]}
      onSave={async () => ({ ok: false, error: "Not submitted during render" })}
      onComplete={() => undefined}
      onSkipAll={() => undefined}
    />
  );

  assert.match(markup, /Record the values for GAMMA_2_1/);
  assert.match(markup, /Blade speed/);
  assert.match(markup, /value="12000"/);
  assert.match(markup, /Parameter/);
  assert.match(markup, /Value/);
  assert.match(markup, /Notes/);
  assert.match(markup, /Additional notes/);
  assert.match(markup, /Attach files/);
  assert.match(markup, /Paste images or attach files for this step record/);
  assert.match(markup, /Add row/);
  assert.doesNotMatch(markup, /Edit template/);
});

test("renders the parameter form while movement persistence is still pending", () => {
  const markup = renderToStaticMarkup(
    <StepParameterEntryDialog
      entries={[{
        assignmentId: "00000000-0000-4000-8000-000000000001",
        draftId: "movement:10000000-0000-4000-8000-000000000001",
        movementMutationId: "10000000-0000-4000-8000-000000000001",
        waferLabel: "A1",
        stepId: "20000000-0000-4000-8000-000000000001",
        stepName: "Post-Bake",
        parametersSchema: {},
        persistenceStatus: "persisting"
      }]}
      onSave={async () => ({ ok: false, error: "Must not save before movement persistence" })}
      onComplete={() => undefined}
      onSkipAll={() => undefined}
    />
  );

  assert.match(markup, /Finishing the move… You can enter values now/);
  assert.match(markup, /<button[^>]*type="submit"[^>]*disabled=""[^>]*>Finishing move…<\/button>/);
  assert.match(markup, /Add row/);
  assert.match(markup, /Additional notes/);
});

test("deduplicates hot-loaded entries and settles successful and failed batch items", () => {
  const draftId = "movement:one:two";
  const entries: PendingStepParameterEntry[] = ["one", "two"].map((movementMutationId, index) => ({
    assignmentId: `assignment-${index}`,
    draftId,
    movementMutationId,
    waferLabel: `A${index + 1}`,
    stepId: "step-id",
    stepName: "Cleaning",
    parametersSchema: {},
    persistenceStatus: "persisting"
  }));

  const merged = mergePendingStepParameterEntries(entries, [entries[0]]);
  assert.equal(merged.length, 2);

  const settled = settlePendingStepParameterEntries(
    merged,
    new Set(["two"]),
    new Set(["one"])
  );
  assert.equal(settled.length, 1);
  assert.equal(settled[0].movementMutationId, "two");
  assert.equal(settled[0].draftId, draftId);
  assert.equal(settled[0].persistenceStatus, "ready");
});

test("one shared submission saves the same parameters for every moved die", async () => {
  const entries: PendingStepParameterEntry[] = Array.from({ length: 8 }, (_, index) => ({
    assignmentId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    movementMutationId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    waferLabel: `A${index + 1}`,
    stepId: "20000000-0000-4000-8000-000000000001",
    stepName: "Chromium Deposition",
    parametersSchema: {}
  }));
  const savedInputs: Array<Parameters<NonNullable<React.ComponentProps<typeof StepParameterEntryDialog>["onSave"]>>[0]> = [];

  const result = await saveStepParametersForEntries(entries, {
    globalValues: { pressure: 12 },
    localParameters: [{
      id: "30000000-0000-4000-8000-000000000001",
      key: "temperature",
      label: "Temperature",
      type: "number",
      unit: "C",
      value: 425,
      notes: "After settling",
      scope: "local"
    }],
    notes: "Shared batch note"
  }, async (input) => {
    savedInputs.push(input);
    return { ok: true, data: {} as never };
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.length, 8);
  assert.equal(savedInputs.length, 8);
  assert.deepEqual(savedInputs.map((input) => input.assignmentId), entries.map((entry) => entry.assignmentId));
  assert.deepEqual(savedInputs.map((input) => input.movementMutationId), entries.map((entry) => entry.movementMutationId));
  for (const input of savedInputs) {
    assert.deepEqual(input.globalValues, { pressure: 12 });
    assert.equal(input.notes, "Shared batch note");
    assert.equal(input.localParameters[0].value, 425);
  }
});

test("renders one form that explicitly applies to every moved item", () => {
  const entries: PendingStepParameterEntry[] = ["A7", "A8", "A9", "A10"].map((waferLabel, index) => ({
    assignmentId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    movementMutationId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    waferLabel,
    stepId: "20000000-0000-4000-8000-000000000001",
    stepName: "Chromium Deposition",
    parametersSchema: {}
  }));
  const markup = renderToStaticMarkup(
    <StepParameterEntryDialog
      entries={entries}
      onSave={async () => ({ ok: false, error: "Not submitted during render" })}
      onComplete={() => undefined}
      onSkipAll={() => undefined}
    />
  );

  assert.match(markup, /Applies to all 4 moved items/);
  assert.match(markup, /Record once for A7, A8, A9, A10/);
  assert.match(markup, /Save for all 4/);
  assert.doesNotMatch(markup, /moved items remaining/);
});

test("persists one parameter attachment note for each moved item", async () => {
  const entries: PendingStepParameterEntry[] = ["A1", "A2"].map((waferLabel, index) => ({
    assignmentId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    movementMutationId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    waferLabel,
    stepId: "20000000-0000-4000-8000-000000000001",
    stepName: "Cleaning",
    parametersSchema: {}
  }));
  const records = entries.map((entry, index) => ({
    id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    project_id: "40000000-0000-4000-8000-000000000001",
    wafer_id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    assignment_id: entry.assignmentId,
    process_step_id: entry.stepId,
    step_execution_id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    process_event_id: `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    movement_mutation_id: entry.movementMutationId,
    schema_snapshot: {},
    global_values: {},
    local_parameters: [],
    notes: "Shared note",
    recorded_by: "80000000-0000-4000-8000-000000000001",
    revision: 1,
    created_at: "2026-07-16T12:00:00.000Z",
    updated_at: "2026-07-16T12:00:00.000Z"
  }));
  const image = new File(["image"], "screenshot.png", { type: "image/png", lastModified: 123 });
  const persisted: Array<{ noteId: string; waferId: string; files: readonly File[] }> = [];

  await saveStepParameterAttachmentsForEntries(
    entries,
    records,
    [image],
    "Shared note",
    "Ada Lovelace",
    async (input) => {
      persisted.push({ noteId: input.noteId, waferId: input.waferId, files: input.files });
      return [];
    }
  );

  assert.equal(persisted.length, 2);
  assert.deepEqual(persisted.map((item) => item.noteId), records.map((record) => `step-parameters:${record.id}`));
  assert.deepEqual(persisted.map((item) => item.waferId), records.map((record) => record.wafer_id));
  assert.ok(persisted.every((item) => item.files.length === 1 && item.files[0] === image));
});
