import { z } from "zod";
import { processCalendarLocationSchema } from "@/features/calendar/schemas";
import { processStepParametersSchema } from "@/features/process-flows/schemas";
import { processFlowMutationSchema } from "@/features/runs/schemas";
import { uuidSchema } from "@/lib/validation";

const commandBase = z.object({
  mutationId: uuidSchema,
  templateId: uuidSchema,
  actorId: uuidSchema,
  expectedWorkspaceRevision: z.number().int().nonnegative().optional()
});

const calendarInterval = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime()
}).superRefine((value, context) => {
  if (new Date(value.endsAt) <= new Date(value.startsAt)) {
    context.addIssue({ code: "custom", message: "Event end time must be after the start time.", path: ["endsAt"] });
  }
});

const calendarCreate = commandBase.extend({
  kind: z.literal("calendar.create"),
  payload: z.object({
    waferId: uuidSchema.nullable().optional(),
    location: processCalendarLocationSchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    processStepId: uuidSchema.nullable().optional(),
    manualAction: z.string().trim().max(160).nullable().optional(),
    description: z.string().trim().max(1200).nullable().optional(),
    personIds: z.array(uuidSchema).min(1)
  }).superRefine((value, context) => {
    if (!value.processStepId && !value.manualAction?.trim()) {
      context.addIssue({ code: "custom", message: "Choose a process step or enter a manual action.", path: ["manualAction"] });
    }
    if (new Date(value.endsAt) <= new Date(value.startsAt)) {
      context.addIssue({ code: "custom", message: "Event end time must be after the start time.", path: ["endsAt"] });
    }
  })
});

const calendarMove = commandBase.extend({
  kind: z.literal("calendar.move"),
  payload: calendarInterval.and(z.object({
    eventId: uuidSchema,
    expectedRevision: z.number().int().positive(),
    location: processCalendarLocationSchema
  }))
});

const calendarDelete = commandBase.extend({
  kind: z.literal("calendar.delete"),
  payload: z.object({
    eventId: uuidSchema,
    expectedRevision: z.number().int().positive()
  })
});

const processStepCreate = commandBase.extend({
  kind: z.literal("process.step.create"),
  payload: z.object({
    name: z.string().trim().min(2).max(180),
    processArea: z.string().trim().min(2).max(120),
    nodeType: z.enum(["start", "procedure", "end"]),
    canvasX: z.number().int().min(0).max(20000),
    canvasY: z.number().int().min(0).max(20000),
    parametersSchema: processStepParametersSchema
  })
});

const processTransitionCreate = commandBase.extend({
  kind: z.literal("process.transition.create"),
  payload: z.object({
    fromStepId: uuidSchema,
    toStepId: uuidSchema,
    edgeType: z.enum(["flow", "return"]),
    label: z.string().trim().max(160).nullable().optional(),
    condition: z.record(z.string(), z.unknown()),
    priority: z.number().int().min(0).max(10000)
  }).refine((value) => value.fromStepId !== value.toStepId, {
    message: "Choose a different target step.",
    path: ["toStepId"]
  })
});

const waferCreate = commandBase.extend({
  kind: z.literal("wafer.create"),
  payload: z.object({
    projectId: uuidSchema,
    waferCode: z.string().trim().min(1).max(80),
    dieCount: z.number().int().min(1).max(256)
  })
});

const waferSubmit = commandBase.extend({
  kind: z.literal("wafer.submit"),
  payload: z.object({
    assignmentId: uuidSchema.optional(),
    stepExecutionId: uuidSchema,
    batchId: uuidSchema,
    notes: z.string().trim().max(4000).nullable().optional(),
    evidence: z.record(z.string(), z.unknown()).default({})
  })
});

const routePayload = z.object({
  assignmentId: uuidSchema.optional(),
  batchId: uuidSchema,
  attemptId: uuidSchema,
  targetStepId: uuidSchema,
  decisionMutationId: uuidSchema,
  note: z.string().trim().min(1).max(4000)
});

const waferRoute = commandBase.extend({ kind: z.literal("wafer.route"), payload: routePayload });
const waferRedo = commandBase.extend({ kind: z.literal("wafer.redo"), payload: routePayload });

const waferBatchMove = commandBase.extend({
  kind: z.literal("wafer.batch.move"),
  payload: z.object({
    mutations: z.array(processFlowMutationSchema).min(1).max(256)
  }).superRefine((value, context) => {
    const operationIds = value.mutations.map((mutation) => (
      mutation.kind === "route" ? mutation.movementMutationId : mutation.mutationId
    ));
    if (new Set(operationIds).size !== operationIds.length) {
      context.addIssue({ code: "custom", message: "Each batch operation needs a unique id.", path: ["mutations"] });
    }
  })
});

const waferArchive = commandBase.extend({
  kind: z.literal("wafer.archive"),
  payload: z.object({
    items: z.array(z.object({ assignmentId: uuidSchema, mutationId: uuidSchema })).min(1).max(200)
  }).superRefine((value, context) => {
    if (new Set(value.items.map((item) => item.assignmentId)).size !== value.items.length) {
      context.addIssue({ code: "custom", message: "Each assignment can only be archived once.", path: ["items"] });
    }
  })
});

export const workflowCommandSchema = z.discriminatedUnion("kind", [
  calendarCreate,
  calendarMove,
  calendarDelete,
  processStepCreate,
  processTransitionCreate,
  waferCreate,
  waferSubmit,
  waferRoute,
  waferBatchMove,
  waferRedo,
  waferArchive
]);

export const workflowCommandKinds = workflowCommandSchema.options.map((option) => option.shape.kind.value);
