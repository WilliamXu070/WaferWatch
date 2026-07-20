import { z } from "zod";
import { uuidSchema } from "@/lib/validation";
import { WAFER_CODE_ERROR, WAFER_CODE_PATTERN } from "@/features/process-flows/waferNaming";

export const processStepNodeTypeSchema = z.enum(["start", "procedure", "end"]);
export const processStepTransitionTypeSchema = z.enum(["flow", "return"]);
export const processStepExecutionModeSchema = z.enum(["main", "anytime"]);

const canvasCoordinateSchema = z.number().int().min(0).max(20000);

const stepParameterDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,79}$/),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["text", "number", "boolean", "select"]),
  unit: z.string().trim().max(40),
  required: z.boolean(),
  description: z.string().trim().max(4000),
  defaultValue: z.string().max(4000).nullable()
}).superRefine((field, context) => {
  const defaultValue = field.defaultValue?.trim() || null;
  if (field.type === "number" && defaultValue !== null && !Number.isFinite(Number(defaultValue))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${field.label} needs a valid numeric default.`,
      path: ["defaultValue"]
    });
  }
  if (field.type === "boolean" && defaultValue !== null && defaultValue !== "true" && defaultValue !== "false") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${field.label} needs a Yes, No, or blank default.`,
      path: ["defaultValue"]
    });
  }
});

export const processStepParametersSchema = z.object({
  version: z.literal(1).default(1),
  fields: z.array(stepParameterDefinitionSchema).max(100).default([])
}).passthrough().superRefine((schema, context) => {
  const keys = schema.fields.map((field) => field.key);
  const labels = schema.fields.map((field) => field.label.toLocaleLowerCase());
  if (new Set(keys).size !== keys.length || new Set(labels).size !== labels.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Each parameter name and key must be unique.",
      path: ["fields"]
    });
  }
});

export const processTemplateCreateSchema = z.object({
  name: z.string().trim().min(2).max(180),
  version: z.string().trim().min(1).max(40).default("1.0"),
  description: z.string().trim().max(2000).nullable().optional(),
  ownerProjectId: uuidSchema.nullable().optional(),
  isActive: z.boolean().default(true)
});

export const processTemplateNameUpdateSchema = z.object({
  templateId: uuidSchema,
  name: z.string().trim().min(2).max(180)
});

export const processTemplateDeleteSchema = z.object({
  templateId: uuidSchema
});

export const processFlowWaferCreateSchema = z.object({
  templateId: uuidSchema,
  waferCode: z.string().trim().min(1).max(80).regex(
    WAFER_CODE_PATTERN,
    WAFER_CODE_ERROR
  ),
  dieCount: z.number().int().min(1).max(256).default(1)
});

export const processFlowWaferDeleteSchema = z.object({
  assignmentId: uuidSchema
});

export const processFlowArchiveSchema = z.object({
  templateId: uuidSchema,
  items: z.array(z.object({
    assignmentId: uuidSchema,
    mutationId: uuidSchema
  })).min(1).max(200)
}).superRefine((value, context) => {
  if (new Set(value.items.map((item) => item.assignmentId)).size !== value.items.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Each process assignment can only be archived once.",
      path: ["items"]
    });
  }
});

export const processFlowArchiveRestoreSchema = z.object({
  templateId: uuidSchema,
  waferId: uuidSchema,
  archivedAssignmentId: uuidSchema,
  targetStepId: uuidSchema,
  mutationId: uuidSchema
});

export const processFlowStepCreateSchema = z.object({
  templateId: uuidSchema,
  name: z.string().trim().min(2).max(180).default("Untitled"),
  processArea: z.string().trim().min(2).max(120).default("Process step"),
  nodeType: processStepNodeTypeSchema.default("procedure"),
  canvasX: canvasCoordinateSchema,
  canvasY: canvasCoordinateSchema,
  parametersSchema: processStepParametersSchema.default({ version: 1, fields: [] })
});

export const processStepNameUpdateSchema = z.object({
  stepId: uuidSchema,
  name: z.string().trim().min(2).max(180),
  expectedName: z.string().trim().min(2).max(180)
});

export const processStepParametersUpdateSchema = z.object({
  stepId: uuidSchema,
  expectedRevision: z.number().int().nonnegative(),
  parametersSchema: processStepParametersSchema
});

const stepParameterValueSchema = z.union([
  z.string().max(4000),
  z.number().finite(),
  z.boolean(),
  z.null()
]);

const recordedLocalStepParameterSchema = z.object({
  id: uuidSchema,
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,79}$/),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["text", "number", "boolean", "select"]),
  unit: z.string().trim().max(40),
  value: stepParameterValueSchema,
  notes: z.string().trim().max(4000),
  scope: z.enum(["local", "global"])
});

const waferStatusEditableStepParameterSchema = recordedLocalStepParameterSchema.extend({
  id: z.string().trim().min(1).max(100)
});

export const stepParameterRecordSaveSchema = z.object({
  assignmentId: uuidSchema,
  stepId: uuidSchema,
  movementMutationId: uuidSchema,
  globalValues: z.record(z.string(), stepParameterValueSchema),
  notes: z.string().trim().max(4000).nullable(),
  localParameters: z.array(recordedLocalStepParameterSchema).max(100)
});

export const stepParameterRecordsBatchSaveSchema = z.object({
  entries: z.array(z.object({
    assignmentId: uuidSchema,
    stepId: uuidSchema,
    movementMutationId: uuidSchema
  })).min(1).max(256),
  globalValues: z.record(z.string(), stepParameterValueSchema),
  notes: z.string().trim().max(4000).nullable(),
  localParameters: z.array(recordedLocalStepParameterSchema).max(100)
}).superRefine((value, context) => {
  const mutationIds = value.entries.map((entry) => entry.movementMutationId);
  if (new Set(mutationIds).size !== mutationIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Each movement can only appear once in a parameter batch.",
      path: ["entries"]
    });
  }
  if (new Set(value.entries.map((entry) => entry.stepId)).size !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A parameter batch must target one process step.",
      path: ["entries"]
    });
  }
});

export const waferStatusStepParameterRecordSaveSchema = z.object({
  projectId: uuidSchema,
  waferId: uuidSchema,
  stepId: uuidSchema,
  stepExecutionId: uuidSchema.nullable(),
  recordId: uuidSchema.nullable(),
  expectedRevision: z.number().int().positive().nullable(),
  notes: z.string().trim().max(4000).nullable(),
  parameters: z.array(waferStatusEditableStepParameterSchema).max(100)
}).superRefine((value, context) => {
  if (value.recordId && value.expectedRevision === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "An existing parameter record requires its revision.",
      path: ["expectedRevision"]
    });
  }

  const keys = value.parameters.map((parameter) => parameter.key);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Each parameter needs a unique key.",
      path: ["parameters"]
    });
  }
});

const processStepPositionUpdateSchema = z.object({
  stepId: uuidSchema,
  canvasX: canvasCoordinateSchema,
  canvasY: canvasCoordinateSchema,
  expectedCanvasX: canvasCoordinateSchema,
  expectedCanvasY: canvasCoordinateSchema
});

export const processStepPositionsUpdateSchema = z.object({
  positions: z.array(processStepPositionUpdateSchema).min(1).max(200)
});

export const processStepExecutionModeUpdateSchema = z.object({
  stepId: uuidSchema,
  executionMode: processStepExecutionModeSchema
});

export const processStepCheckpointReviewerSchema = z.object({
  stepId: uuidSchema,
  reviewerId: uuidSchema.nullable()
});

export const processStepTransitionCreateSchema = z.object({
  templateId: uuidSchema,
  fromStepId: uuidSchema,
  toStepId: uuidSchema,
  edgeType: processStepTransitionTypeSchema.default("flow"),
  label: z.string().trim().max(160).nullable().optional(),
  condition: z.record(z.string(), z.unknown()).default({}),
  priority: z.number().int().min(0).max(10000).default(0)
});

export const processStepTransitionDeleteSchema = z.object({
  transitionIds: z.array(uuidSchema).min(1).max(200)
});

export const processStepDeleteSchema = z.object({
  stepIds: z.array(uuidSchema).min(1).max(100)
});
