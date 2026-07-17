import { z } from "zod";
import { uuidSchema } from "@/lib/validation";

export const attachmentCreateSchema = z.object({
  projectId: uuidSchema,
  waferId: uuidSchema.nullable().optional(),
  stepExecutionId: uuidSchema.nullable().optional(),
  measurementId: uuidSchema.nullable().optional(),
  bucketName: z.enum(["wafer-characterization", "wafer-process-files", "wafer-maps"]),
  objectPath: z.string().trim().min(1).max(1000),
  fileName: z.string().trim().min(1).max(260),
  mimeType: z.string().trim().max(120).nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional()
});

export const attachmentDownloadSchema = z.object({
  attachmentId: uuidSchema
});
