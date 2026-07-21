import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { prepareStepTemplate, StepTemplateDialog } from "./StepTemplateDialog";
import type { StepParameterDefinition } from "@/features/process-flows/stepParameters";

const existingField: StepParameterDefinition = {
  id: "existing-temperature",
  key: "temperature_c",
  label: "Temperature",
  type: "number",
  unit: "°C",
  required: true,
  description: "Chamber setpoint",
  defaultValue: "180"
};

test("prepares a template with stable existing keys and collision-safe new keys", () => {
  const prepared = prepareStepTemplate({
    name: "Post bake",
    processArea: "Lithography",
    parametersSchema: { version: 1, fields: [existingField] }
  }, [
    { ...existingField, label: "Bake temperature" },
    { ...existingField, id: "new-temperature", key: "", label: "Temperature", required: false }
  ]);

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.deepEqual(prepared.fields.map((field) => field.key), ["temperature_c", "temperature"]);
  assert.equal(prepared.fields[0].label, "Bake temperature");
});

test("ignores blank new rows and validates typed defaults", () => {
  const blank: StepParameterDefinition = {
    id: "blank",
    key: "",
    label: "",
    type: "text",
    unit: "",
    required: false,
    description: "",
    defaultValue: null
  };
  const prepared = prepareStepTemplate({
    name: "Clean",
    processArea: "Wet bench",
    parametersSchema: {}
  }, [blank]);
  assert.equal(prepared.ok && prepared.fields.length, 0);

  const invalid = prepareStepTemplate({
    name: "Clean",
    processArea: "Wet bench",
    parametersSchema: {}
  }, [{ ...blank, label: "Duration", type: "number", defaultValue: "soon" }]);
  assert.deepEqual(invalid, { ok: false, error: "Duration needs a valid numeric default." });
});

test("renders the full create template and read-only edit states", () => {
  const createMarkup = renderToStaticMarkup(
    <StepTemplateDialog
      draft={{
        mode: "create",
        name: "Post bake",
        processArea: "Lithography",
        parametersSchema: { version: 1, fields: [existingField] },
        canEdit: true
      }}
      isPending={false}
      onCancel={() => undefined}
      onChange={() => undefined}
      onSubmit={() => undefined}
    />
  );
  assert.match(createMarkup, /aria-modal="true"/);
  assert.match(createMarkup, /New process step/);
  assert.match(createMarkup, /Step name/);
  assert.match(createMarkup, /Type/);
  assert.match(createMarkup, /Default/);
  assert.match(createMarkup, /Unit/);
  assert.match(createMarkup, /Required/);
  assert.match(createMarkup, /Operator guidance/);
  assert.match(createMarkup, />Create step<\/button>/);

  const readOnlyMarkup = renderToStaticMarkup(
    <StepTemplateDialog
      draft={{
        mode: "edit",
        name: "Post bake",
        processArea: "Lithography",
        parametersSchema: { version: 1, fields: [existingField] },
        canEdit: false
      }}
      isPending={false}
      onCancel={() => undefined}
      onChange={() => undefined}
      onSubmit={() => undefined}
    />
  );
  assert.match(readOnlyMarkup, /Read-only/);
  assert.match(readOnlyMarkup, />Close<\/button>/);
  assert.doesNotMatch(readOnlyMarkup, /Save template/);
  assert.doesNotMatch(readOnlyMarkup, /These defaults appear/);
  assert.doesNotMatch(readOnlyMarkup, /Parameter template/);
  assert.doesNotMatch(readOnlyMarkup, /Defaults are starting values/);
});
