import { z } from "zod";
import { slugSchema, uuidSchema } from "@/lib/validation";

export const processStepNodeTypeSchema = z.enum(["start", "procedure", "end"]);
export const processStepTransitionTypeSchema = z.enum(["flow", "return"]);

const canvasCoordinateSchema = z.number().int().min(0).max(20000);

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

export const processFlowWaferCreateSchema = z.object({
  templateId: uuidSchema,
  waferCode: z.string().trim().min(1).max(80)
});

export const processStepCreateSchema = z.object({
  templateId: uuidSchema,
  stepOrder: z.number().int().positive(),
  name: z.string().trim().min(2).max(180),
  slug: slugSchema,
  processArea: z.string().trim().min(2).max(120),
  expectedDurationMinutes: z.number().int().positive().nullable().optional(),
  queueTargetMinutes: z.number().int().positive().nullable().optional(),
  requiredToolType: z.string().trim().max(120).nullable().optional(),
  requiresRecipe: z.boolean().default(false),
  instructions: z.string().trim().max(4000).nullable().optional(),
  parametersSchema: z.record(z.string(), z.unknown()).default({}),
  nodeType: processStepNodeTypeSchema.default("procedure"),
  canvasX: canvasCoordinateSchema.nullable().optional(),
  canvasY: canvasCoordinateSchema.nullable().optional()
});

export const processFlowStepCreateSchema = z.object({
  templateId: uuidSchema,
  name: z.string().trim().min(2).max(180).default("Untitled"),
  processArea: z.string().trim().min(2).max(120).default("Process step"),
  nodeType: processStepNodeTypeSchema.default("procedure"),
  canvasX: canvasCoordinateSchema,
  canvasY: canvasCoordinateSchema
});

export const processStepNameUpdateSchema = z.object({
  stepId: uuidSchema,
  name: z.string().trim().min(2).max(180)
});

export const processStepPositionUpdateSchema = z.object({
  stepId: uuidSchema,
  canvasX: canvasCoordinateSchema,
  canvasY: canvasCoordinateSchema
});

export const processStepPositionsUpdateSchema = z.object({
  positions: z.array(processStepPositionUpdateSchema).min(1).max(200)
});

export const processStepNodeTypeUpdateSchema = z.object({
  stepId: uuidSchema,
  nodeType: processStepNodeTypeSchema
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

export const processAssignmentSchema = z.object({
  waferId: uuidSchema,
  templateId: uuidSchema
});
