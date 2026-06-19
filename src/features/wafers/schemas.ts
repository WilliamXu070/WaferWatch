import { z } from "zod";
import { uuidSchema } from "@/lib/validation";

export const lotCreateSchema = z.object({
  projectId: uuidSchema,
  lotCode: z.string().trim().min(1).max(120),
  substrateMaterial: z.string().trim().max(160).nullable().optional(),
  waferSizeMm: z.number().positive().nullable().optional(),
  targetCompletionAt: z.string().datetime().nullable().optional()
});

export const waferCreateSchema = z.object({
  projectId: uuidSchema,
  lotId: uuidSchema.nullable().optional(),
  waferCode: z.string().trim().min(1).max(120),
  materialStack: z.string().trim().max(500).nullable().optional(),
  diameterMm: z.number().positive().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional()
});

export const waferStatusSchema = z.object({
  waferId: uuidSchema,
  status: z.enum(["planned", "queued", "in_progress", "on_hold", "completed", "scrapped"]),
  notes: z.string().trim().max(2000).nullable().optional()
});

export const waferDieDescriptionSchema = z.object({
  waferId: uuidSchema,
  dieCode: z.string().trim().min(2).max(32).regex(/^[A-Z][1-8]-V\d+$/),
  description: z.string().max(4000)
});

export const waferDiePolingParameterSchema = z.object({
  waferId: uuidSchema,
  dieCode: z.string().trim().min(2).max(32).regex(/^[A-Z][1-8]-V\d+$/),
  row: z.number().int().min(1).max(64),
  column: z.number().int().min(1).max(64),
  field: z.enum(["peakVoltage", "pulseDuration", "description"]),
  value: z.string().max(2000)
});
