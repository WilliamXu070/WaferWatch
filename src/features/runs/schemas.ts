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

export const submitStepCheckpointSchema = z.object({
  stepExecutionId: uuidSchema,
  mutationId: uuidSchema,
  notes: z.string().trim().max(4000).nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).default({})
});

export const withdrawStepCheckpointSchema = z.object({
  attemptId: uuidSchema,
  mutationId: uuidSchema,
  reason: z.string().trim().max(4000).nullable().optional()
});

export const reviewStepCheckpointSchema = z.object({
  attemptId: uuidSchema,
  decision: z.enum(["approved", "redo"]),
  mutationId: uuidSchema,
  notes: z.string().trim().max(4000).nullable().optional(),
  redoTargetStepId: uuidSchema.nullable().optional()
}).superRefine((value, context) => {
  if (value.decision === "redo" && !value.notes?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Explain what must be redone.",
      path: ["notes"]
    });
  }
  if (value.decision === "redo" && !value.redoTargetStepId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Choose the step that must be redone.",
      path: ["redoTargetStepId"]
    });
  }
});

export const moveApprovedCheckpointSchema = z.object({
  mutationId: uuidSchema,
  assignmentId: uuidSchema,
  sourceStepId: uuidSchema,
  targetStepId: uuidSchema,
  note: z.string().trim().min(1).max(4000)
}).refine((value) => value.sourceStepId !== value.targetStepId, {
  message: "Choose a different destination step.",
  path: ["targetStepId"]
});

export const moveWaferToProcessStepSchema = z.object({
  mutationId: uuidSchema,
  assignmentId: uuidSchema,
  sourceStepId: uuidSchema,
  targetStepId: uuidSchema,
  note: z.string().trim().min(1).max(4000),
  completeSourceStep: z.boolean().default(false),
  revertToPriorStep: z.boolean().default(false)
});

export const reservationSchema = z.object({
  projectId: uuidSchema,
  toolId: uuidSchema,
  stepExecutionId: uuidSchema.nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  notes: z.string().trim().max(2000).nullable().optional()
});
