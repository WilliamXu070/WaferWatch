import assert from "node:assert/strict";
import test from "node:test";
import {
  processFlowStepCreateSchema,
  processStepParametersUpdateSchema,
  stepParameterRecordsBatchSaveSchema,
  waferStatusStepParameterRecordSaveSchema
} from "./schemas";

const base = {
  globalValues: {},
  localParameters: [],
  notes: null
};

test("rejects duplicate and cross-step atomic parameter batch entries", () => {
  const entry = {
    assignmentId: "10000000-0000-4000-8000-000000000001",
    stepId: "10000000-0000-4000-8000-000000000002",
    movementMutationId: "10000000-0000-4000-8000-000000000003"
  };
  assert.throws(() => stepParameterRecordsBatchSaveSchema.parse({
    ...base,
    entries: [entry, { ...entry, assignmentId: "10000000-0000-4000-8000-000000000004" }]
  }), /only appear once/);
  assert.throws(() => stepParameterRecordsBatchSaveSchema.parse({
    ...base,
    entries: [entry, {
      ...entry,
      stepId: "10000000-0000-4000-8000-000000000005",
      movementMutationId: "10000000-0000-4000-8000-000000000006"
    }]
  }), /target one process step/);
});

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

test("requires the full exact identity for Process Flow parameter edits", () => {
  const input = {
    processTemplateId: "10000000-0000-4000-8000-000000000001",
    assignmentId: "10000000-0000-4000-8000-000000000002",
    projectId: "10000000-0000-4000-8000-000000000003",
    waferId: "10000000-0000-4000-8000-000000000004",
    stepId: "10000000-0000-4000-8000-000000000005",
    stepExecutionId: "10000000-0000-4000-8000-000000000006",
    recordId: null,
    expectedRevision: null,
    notes: null,
    parameters: []
  };

  assert.doesNotThrow(() => waferStatusStepParameterRecordSaveSchema.parse(input));
  assert.throws(() => waferStatusStepParameterRecordSaveSchema.parse({
    ...input,
    assignmentId: undefined
  }), /both its process and assignment/);
  assert.throws(() => waferStatusStepParameterRecordSaveSchema.parse({
    ...input,
    stepExecutionId: null
  }), /current step visit/);
});
