import { z } from "zod";
import { uuidSchema } from "@/lib/validation";

export const waferDiePolingParameterBatchSchema = z.object({
  waferId: uuidSchema,
  dieCode: z.string().trim().min(2).max(32).regex(/^[A-Z][1-8]-V\d+$/),
  updates: z.array(
    z.object({
      row: z.number().int().min(1).max(64),
      column: z.number().int().min(1).max(64),
      field: z.enum([
        "voltage",
        "width",
        "pulseCount",
        "postPulseVoltage",
        "postPulseWidth",
        "peakVoltage",
        "pulseDuration",
        "description"
      ]),
      value: z.string().max(2000),
      expectedValue: z.string().max(2000).optional()
    })
  ).min(1).max(500)
});
