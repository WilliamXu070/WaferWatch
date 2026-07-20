import { z } from "zod";
import { uuidSchema } from "@/lib/validation";

export const submitStepCheckpointSchema = z.object({
  stepExecutionId: uuidSchema,
  mutationId: uuidSchema,
  batchId: uuidSchema,
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

const processFlowSubmitMutationSchema = submitStepCheckpointSchema.extend({
  kind: z.literal("submit"),
  assignmentId: uuidSchema
});

const processFlowMoveMutationSchema = moveApprovedCheckpointSchema.extend({
  kind: z.literal("move")
});

const processFlowRouteMutationSchema = routeCheckpointSubmissionSchema.extend({
  kind: z.literal("route"),
  assignmentId: uuidSchema
});

export const processFlowMutationSchema = z.discriminatedUnion("kind", [
  processFlowSubmitMutationSchema,
  processFlowMoveMutationSchema,
  processFlowRouteMutationSchema
]);

export const processFlowMutationBatchSchema = z.object({
  mutations: z.array(processFlowMutationSchema).min(1).max(256)
}).superRefine((value, context) => {
  const operationIds = value.mutations.map((mutation) =>
    mutation.kind === "route" ? mutation.movementMutationId : mutation.mutationId
  );
  if (new Set(operationIds).size !== operationIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Each Process Flow mutation must have a unique operation id.",
      path: ["mutations"]
    });
  }
});
