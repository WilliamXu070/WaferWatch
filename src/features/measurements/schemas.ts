import { z } from "zod";
import { uuidSchema } from "@/lib/validation";

export const measurementCreateSchema = z.object({
  projectId: uuidSchema,
  waferId: uuidSchema,
  stepExecutionId: uuidSchema.nullable().optional(),
  measurementType: z.string().trim().min(1).max(120),
  metricName: z.string().trim().min(1).max(160),
  metricValue: z.number().nullable().optional(),
  metricUnit: z.string().trim().max(40).nullable().optional(),
  measuredAt: z.string().datetime().nullable().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
  filePath: z.string().trim().max(1000).nullable().optional()
});

export const processIssueCreateSchema = z.object({
  projectId: uuidSchema,
  waferId: uuidSchema.nullable().optional(),
  stepExecutionId: uuidSchema.nullable().optional(),
  assignedTo: uuidSchema.nullable().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  title: z.string().trim().min(1).max(220),
  description: z.string().trim().max(4000).nullable().optional()
});

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
