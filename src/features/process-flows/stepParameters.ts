import type { Json } from "@/types/database";

export const STEP_PARAMETER_TYPES = ["text", "number", "boolean", "select"] as const;

export type StepParameterType = typeof STEP_PARAMETER_TYPES[number];

export type StepParameterDefinition = {
  id: string;
  key: string;
  label: string;
  type: StepParameterType;
  unit: string;
  required: boolean;
  description: string;
  defaultValue: string | null;
};

export type StepParameterValue = string | number | boolean | null;

export type RecordedLocalStepParameter = {
  id: string;
  key: string;
  label: string;
  type: StepParameterType;
  unit: string;
  value: StepParameterValue;
  notes: string;
  scope: "local" | "global";
};

function asRecord(value: Json | undefined): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function isParameterType(value: Json | undefined): value is StepParameterType {
  return typeof value === "string" && STEP_PARAMETER_TYPES.some((type) => type === value);
}

export function readStepParameterDefinitions(schema: Json): StepParameterDefinition[] {
  const root = asRecord(schema);
  if (!root || !Array.isArray(root.fields)) {
    return [];
  }

  return root.fields.flatMap((value, index) => {
    const field = asRecord(value);
    if (!field) {
      return [];
    }

    const key = typeof field.key === "string" ? field.key : "";
    const label = typeof field.label === "string" ? field.label : key;
    return [{
      id: typeof field.id === "string" ? field.id : `parameter-${index + 1}`,
      key,
      label,
      type: isParameterType(field.type) ? field.type : "text",
      unit: typeof field.unit === "string" ? field.unit : "",
      required: field.required === true,
      description: typeof field.description === "string" ? field.description : "",
      defaultValue: typeof field.defaultValue === "string" ? field.defaultValue : null
    }];
  });
}

export function writeStepParameterDefinitions(
  currentSchema: Json,
  fields: readonly StepParameterDefinition[]
): Record<string, Json | undefined> {
  return {
    ...(asRecord(currentSchema) ?? {}),
    version: 1,
    fields: fields.map((field) => ({
      id: field.id,
      key: field.key.trim(),
      label: field.label.trim(),
      type: field.type,
      unit: field.unit.trim(),
      required: field.required,
      description: field.description.trim(),
      defaultValue: field.defaultValue
    }))
  };
}

export function normalizeStepParameterKey(label: string) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "");
  return normalized.slice(0, 80) || "parameter";
}

export function mergeStepParameterDefinitions(
  currentSchema: Json,
  additions: readonly StepParameterDefinition[]
) {
  const current = readStepParameterDefinitions(currentSchema);
  const existingKeys = new Set(current.map((field) => field.key));
  const merged = [...current];

  for (const addition of additions) {
    if (!existingKeys.has(addition.key)) {
      merged.push(addition);
      existingKeys.add(addition.key);
    }
  }

  return writeStepParameterDefinitions(currentSchema, merged);
}
