import { z } from "zod";
import { uuidSchema } from "@/lib/validation";

export const startOperationRunSchema = z.object({
  processStepId: uuidSchema,
  plannedOperationId: uuidSchema.nullable().optional(),
  assignmentIds: z.array(uuidSchema).min(1).max(256),
  expectedAssignmentRevisions: z.record(uuidSchema, z.number().int().positive()),
  runKind: z.enum(["normal", "redo", "rework", "restore", "ad_hoc"]),
  sourceRunIds: z.array(uuidSchema).max(256).default([]),
  reason: z.string().trim().max(4000).nullable().optional(),
  mutationId: uuidSchema
}).superRefine((value, context) => {
  if (!value.plannedOperationId && value.runKind !== "ad_hoc") {
    context.addIssue({ code: "custom", path: ["runKind"], message: "Unplanned work must be ad hoc." });
  }
  if (value.runKind === "ad_hoc" && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Ad hoc work requires a reason." });
  }
});

const completionResourceSchema = z.object({
  memberId: uuidSchema.nullable().optional(),
  kind: z.enum(["person", "tool", "recipe", "location"]),
  personId: uuidSchema.nullable().optional(),
  toolId: uuidSchema.nullable().optional(),
  recipeId: uuidSchema.nullable().optional(),
  locationId: uuidSchema.nullable().optional(),
  snapshot: z.record(z.string(), z.unknown()).default({})
});

export const completeOperationRunSchema = z.object({
  runId: uuidSchema,
  expectedRevision: z.number().int().positive(),
  memberResults: z.array(z.object({
    memberId: uuidSchema,
    expectedRevision: z.number().int().positive(),
    status: z.enum(["completed", "failed", "skipped", "blocked"]),
    note: z.string().trim().max(4000).nullable().optional()
  })).min(1).max(256),
  parameters: z.array(z.object({
    memberId: uuidSchema.nullable().optional(),
    scope: z.enum(["global", "member"]),
    schemaSnapshot: z.record(z.string(), z.unknown()).default({}),
    values: z.record(z.string(), z.unknown())
  })).default([]),
  resources: z.array(completionResourceSchema).default([]),
  notes: z.array(z.object({
    memberId: uuidSchema.nullable().optional(),
    kind: z.enum(["general", "completion", "error", "redo", "correction"]).default("completion"),
    body: z.string().trim().min(1).max(4000)
  })).default([]),
  mutationId: uuidSchema
});

export const submitOperationRunSchema = z.object({
  runId: uuidSchema,
  expectedRevision: z.number().int().positive(),
  mutationId: uuidSchema
});

export const reviewOperationRunMembersSchema = z.object({
  runId: uuidSchema,
  decisions: z.array(z.object({
    memberId: uuidSchema,
    decision: z.enum(["approved", "redo"]),
    targetStepId: uuidSchema.nullable().optional(),
    note: z.string().trim().max(4000).nullable().optional(),
    childSpecs: z.array(z.object({
      die_label: z.string().trim().min(1).max(80),
      wafer_code: z.string().trim().min(1).max(120),
      movement_mutation_id: uuidSchema
    })).default([])
  })).min(1).max(256),
  expectedMemberRevisions: z.record(uuidSchema, z.number().int().positive()),
  mutationId: uuidSchema
});
