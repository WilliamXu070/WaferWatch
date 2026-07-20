import assert from "node:assert/strict";
import test from "node:test";
import {
  processFlowStepCreateSchema,
  processStepParametersUpdateSchema
} from "./schemas";

test("creates steps with a validated parameter template and a safe empty default", () => {
  const common = {
    templateId: "10000000-0000-4000-8000-000000000001",
    name: "Post bake",
    processArea: "Lithography",
    nodeType: "procedure" as const,
    canvasX: 120,
    canvasY: 240
  };
  assert.deepEqual(processFlowStepCreateSchema.parse(common).parametersSchema, {
    version: 1,
    fields: []
  });
  const parsed = processFlowStepCreateSchema.parse({
    ...common,
    parametersSchema: {
      version: 1,
      fields: [{
        id: "temperature",
        key: "temperature_c",
        label: "Temperature",
        type: "number",
        unit: "°C",
        required: true,
        description: "Chamber setpoint",
        defaultValue: "180"
      }]
    }
  });
  assert.equal(parsed.parametersSchema.fields[0].defaultValue, "180");
});

test("rejects duplicate template keys and incompatible defaults", () => {
  const field = {
    id: "duration",
    key: "duration_minutes",
    label: "Duration",
    type: "number" as const,
    unit: "min",
    required: false,
    description: "",
    defaultValue: "15"
  };
  assert.throws(() => processStepParametersUpdateSchema.parse({
    stepId: "10000000-0000-4000-8000-000000000001",
    expectedRevision: 1,
    parametersSchema: { version: 1, fields: [field, { ...field, id: "duplicate", label: "Time" }] }
  }), /unique/);
  assert.throws(() => processStepParametersUpdateSchema.parse({
    stepId: "10000000-0000-4000-8000-000000000001",
    expectedRevision: 1,
    parametersSchema: { version: 1, fields: [{ ...field, defaultValue: "later" }] }
  }), /valid numeric default/);
});
