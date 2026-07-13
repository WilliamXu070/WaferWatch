import { z } from "zod";
import { uuidSchema } from "@/lib/validation";

export const textSurfaceIdentitySchema = z.object({
  projectId: uuidSchema,
  scopeType: z.string().trim().min(2).max(80).regex(/^[a-z][a-z0-9_:-]{1,79}$/),
  scopeKey: z.string().trim().min(1).max(400),
  fieldKey: z.string().trim().min(2).max(80).regex(/^[a-z][a-z0-9_:-]{1,79}$/)
});

export const textSurfaceUpsertSchema = textSurfaceIdentitySchema.extend({
  value: z.string().max(20000),
  expectedVersion: z.number().int().min(0).nullable().optional()
});

export const textSurfaceJsonArrayMutationSchema = textSurfaceIdentitySchema.extend({
  operation: z.enum(["add", "update", "delete"]),
  itemId: z.string().trim().min(1).max(200),
  item: z.record(z.string(), z.unknown()).nullable().optional()
});
