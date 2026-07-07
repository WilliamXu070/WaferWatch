import { z } from "zod";
import { uuidSchema } from "@/lib/validation";

export const startStepSchema = z.object({
  stepExecutionId: uuidSchema,
  toolId: uuidSchema.nullable().optional(),
  recipeId: uuidSchema.nullable().optional(),
  plannedEndAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional()
});

export const completeStepSchema = z.object({
  stepExecutionId: uuidSchema,
  notes: z.string().trim().max(4000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const blockStepSchema = z.object({
  stepExecutionId: uuidSchema,
  reason: z.string().trim().min(1).max(4000)
});

export const moveWaferToProcessStepSchema = z.object({
  assignmentId: uuidSchema,
  sourceStepId: uuidSchema,
  targetStepId: uuidSchema,
  note: z.string().trim().min(1).max(4000),
  completeSourceStep: z.boolean().default(false)
});

export const reservationSchema = z.object({
  projectId: uuidSchema,
  toolId: uuidSchema,
  stepExecutionId: uuidSchema.nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  notes: z.string().trim().max(2000).nullable().optional()
});
