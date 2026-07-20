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
  batchId: uuidSchema,
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

const historicalParameterValueSchema = z.union([
  z.string().max(4000),
  z.number().finite(),
  z.boolean(),
  z.null()
]);

export const correctWaferProcessHistorySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("insert"),
    mutationId: uuidSchema,
    assignmentId: uuidSchema,
    anchorVisitId: z.string().trim().min(1).max(240),
    placement: z.enum(["before", "after"]),
    stepId: uuidSchema,
    completedAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(1).max(4000),
    expectedHistoryRevision: z.number().int().nonnegative(),
    parameterValues: z.record(z.string().min(1).max(100), historicalParameterValueSchema),
    parameterNotes: z.record(z.string().min(1).max(100), z.string().trim().max(4000)).default({})
  }),
  z.object({
    kind: z.literal("remove"),
    mutationId: uuidSchema,
    assignmentId: uuidSchema,
    visitId: z.string().trim().min(1).max(240),
    reason: z.string().trim().min(1).max(4000),
    expectedHistoryRevision: z.number().int().nonnegative()
  })
]);

export const routeCheckpointSubmissionSchema = z.object({
  batchId: uuidSchema,
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
