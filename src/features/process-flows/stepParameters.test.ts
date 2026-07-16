import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeStepParameterDefinitions,
  normalizeStepParameterKey,
  readStepParameterDefinitions,
  writeStepParameterDefinitions
} from "./stepParameters";

test("reads canonical step parameter definitions", () => {
  assert.deepEqual(readStepParameterDefinitions({
    version: 1,
    fields: [{
      id: "duration",
      key: "duration_minutes",
      label: "Duration",
      type: "number",
      unit: "min",
      required: true,
      description: "Recorded process time",
      defaultValue: "15"
    }]
  }), [{
    id: "duration",
    key: "duration_minutes",
    label: "Duration",
    type: "number",
    unit: "min",
    required: true,
    description: "Recorded process time",
    defaultValue: "15"
  }]);
});

test("normalizes operator labels into stable parameter keys", () => {
  assert.equal(normalizeStepParameterKey("  2nd Anneal Temperature (°C)  "), "nd_anneal_temperature_c");
});

test("merges newly promoted global fields without duplicating existing keys", () => {
  const schema = writeStepParameterDefinitions({}, [{
    id: "duration",
    key: "duration_minutes",
    label: "Duration",
    type: "number",
    unit: "min",
    required: true,
    description: "",
    defaultValue: null
  }]);
  const merged = mergeStepParameterDefinitions(schema, [
    {
      id: "duplicate-duration",
      key: "duration_minutes",
      label: "Duplicate duration",
      type: "number",
      unit: "min",
      required: false,
      description: "",
      defaultValue: null
    },
    {
      id: "pressure",
      key: "pressure_mbar",
      label: "Pressure",
      type: "number",
      unit: "mbar",
      required: false,
      description: "",
      defaultValue: null
    }
  ]);

  assert.deepEqual(readStepParameterDefinitions(merged).map((field) => field.key), [
    "duration_minutes",
    "pressure_mbar"
  ]);
});

test("writes definitions without deleting unrelated legacy schema entries", () => {
  assert.deepEqual(writeStepParameterDefinitions({ fixture: "wireframe" }, [{
    id: "temperature",
    key: "temperature_c",
    label: "Temperature",
    type: "number",
    unit: "°C",
    required: false,
    description: "  Chamber setpoint  ",
    defaultValue: "180"
  }]), {
    fixture: "wireframe",
    version: 1,
    fields: [{
      id: "temperature",
      key: "temperature_c",
      label: "Temperature",
      type: "number",
      unit: "°C",
      required: false,
      description: "Chamber setpoint",
      defaultValue: "180"
    }]
  });
});
