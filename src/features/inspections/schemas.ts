import { z } from "zod";
import { uuidSchema } from "@/lib/validation";

export const dieInspectionListSchema = z.object({
  waferId: uuidSchema,
  dieCode: z.string().trim().min(2).max(32).regex(/^[A-Z][1-8]-V\d+$/),
  row: z.number().int().min(1).max(64),
  column: z.number().int().min(1).max(64)
});

export const dieInspectionCreateSchema = dieInspectionListSchema.extend({
  id: uuidSchema,
  projectId: uuidSchema,
  xRatio: z.number().min(0).max(1),
  yRatio: z.number().min(0).max(1),
  imageBucket: z.literal("wafer-process-files"),
  imagePath: z.string().trim().min(1).max(1000),
  imageMimeType: z.enum(["image/png", "image/jpeg"]),
  imageSizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  imageFileName: z.string().trim().min(1).max(240)
});

export const dieInspectionDeleteSchema = z.object({
  inspectionId: uuidSchema
});

export const dieInspectionPreviewSchema = z.object({
  inspectionId: uuidSchema
});

export const dieInspectionCellSummarySchema = z.object({
  waferId: uuidSchema,
  dieCode: z.string().trim().min(2).max(32).regex(/^[A-Z][1-8]-V\d+$/)
});
