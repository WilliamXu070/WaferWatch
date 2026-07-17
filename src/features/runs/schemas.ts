import { z } from "zod";
import { uuidSchema } from "@/lib/validation";

export const submitStepCheckpointSchema = z.object({
  stepExecutionId: uuidSchema,
  mutationId: uuidSchema,
  notes: z.string().trim().max(4000).nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).default({})
});

export const moveApprovedCheckpointSchema = z.object({
  mutationId: uuidSchema,
  assignmentId: uuidSchema,
  sourceStepId: uuidSchema,
  targetStepId: uuidSchema,
  note: z.string().trim().min(1).max(4000),
  correctCheckpointRoute: z.boolean().default(false)
}).refine((value) => value.sourceStepId !== value.targetStepId, {
  message: "Choose a different destination step.",
  path: ["targetStepId"]
});

export const undoDieProcessHistorySchema = z.object({
  mutationId: uuidSchema,
  assignmentId: uuidSchema,
  expectedStepId: uuidSchema,
  expectedStepStatus: z.enum([
    "queued",
    "running",
    "blocked",
    "awaiting_checkpoint",
    "ready_to_move",
    "redo_required",
    "completed"
  ])
});

export const routeCheckpointSubmissionSchema = z.object({
  attemptId: uuidSchema,
  targetStepId: uuidSchema,
  decisionMutationId: uuidSchema,
  movementMutationId: uuidSchema,
  note: z.string().trim().min(1).max(4000)
});
