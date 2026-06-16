import { z } from "zod";
import { slugSchema, uuidSchema } from "@/lib/validation";

export const processTemplateCreateSchema = z.object({
  name: z.string().trim().min(2).max(180),
  version: z.string().trim().min(1).max(40).default("1.0"),
  description: z.string().trim().max(2000).nullable().optional(),
  ownerProjectId: uuidSchema.nullable().optional(),
  isActive: z.boolean().default(true)
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
  parametersSchema: z.record(z.string(), z.unknown()).default({})
});

export const processAssignmentSchema = z.object({
  waferId: uuidSchema,
  templateId: uuidSchema
});
