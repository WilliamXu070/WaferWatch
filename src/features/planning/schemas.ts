import { z } from "zod";
import { uuidSchema } from "@/lib/validation";

const dateTime = z.string().datetime({ offset: true });

export const createPlanSchema = z.object({
  projectId: uuidSchema,
  templateId: uuidSchema,
  startsAt: dateTime,
  endsAt: dateTime,
  mutationId: uuidSchema
});

export const createPlannedBatchSchema = z.object({
  revisionId: uuidSchema,
  logicalId: uuidSchema,
  name: z.string().trim().min(1).max(160),
  note: z.string().trim().max(4000).nullable().optional(),
  assignmentIds: z.array(uuidSchema).max(256),
  mutationId: uuidSchema
});

export const replacePlannedBatchMembersSchema = z.object({
  batchId: uuidSchema,
  expectedRevision: z.number().int().positive(),
  assignmentIds: z.array(uuidSchema).max(256),
  mutationId: uuidSchema
});

const parameterSchema = z.object({
  assignmentId: uuidSchema.nullable().optional(),
  key: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
  scope: z.enum(["global", "member"]),
  value: z.unknown(),
  schemaSnapshot: z.record(z.string(), z.unknown()).default({})
});

const resourceSchema = z.object({
  kind: z.enum(["person", "tool", "recipe", "location"]),
  personId: uuidSchema.nullable().optional(),
  toolId: uuidSchema.nullable().optional(),
  recipeId: uuidSchema.nullable().optional(),
  locationId: uuidSchema.nullable().optional(),
  quantity: z.number().positive().default(1)
}).superRefine((resource, context) => {
  const references = [resource.personId, resource.toolId, resource.recipeId, resource.locationId].filter(Boolean);
  const matchingReference = {
    person: resource.personId,
    tool: resource.toolId,
    recipe: resource.recipeId,
    location: resource.locationId
  }[resource.kind];
  if (references.length !== 1 || !matchingReference) {
    context.addIssue({ code: "custom", message: "A resource needs exactly one matching typed reference." });
  }
});

export const createPlannedOperationSchema = z.object({
  revisionId: uuidSchema,
  logicalId: uuidSchema,
  stepId: uuidSchema,
  batchId: uuidSchema.nullable().optional(),
  name: z.string().trim().min(1).max(160),
  startsAt: dateTime,
  endsAt: dateTime,
  userPinned: z.boolean().default(false),
  parameters: z.array(parameterSchema).default([]),
  resources: z.array(resourceSchema).default([]),
  mutationId: uuidSchema
});

export const updatePlannedOperationSchema = z.object({
  operationId: uuidSchema,
  expectedRevision: z.number().int().positive(),
  patch: z.record(z.string(), z.unknown()),
  mutationId: uuidSchema
});

export const deletePlannedOperationSchema = z.object({
  operationId: uuidSchema,
  expectedRevision: z.number().int().positive(),
  mutationId: uuidSchema
});

export const publishPlanSchema = z.object({
  revisionId: uuidSchema,
  expectedRevision: z.number().int().positive(),
  mutationId: uuidSchema
});

export const requestReplanSchema = z.object({
  planId: uuidSchema,
  sourceRunId: uuidSchema.nullable().optional(),
  kind: z.enum(["redo", "delay", "resource_change", "manual"]),
  requestedChange: z.record(z.string(), z.unknown()).default({}),
  mutationId: uuidSchema
});

export const generateProposalSchema = z.object({ requestId: uuidSchema });

export const applyProposalSchema = z.object({
  proposalId: uuidSchema,
  mutationId: uuidSchema
});
