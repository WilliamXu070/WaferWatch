import { getDicingChildSpecsForCheckpoint } from "@/features/runs/dicingChildSpecs";
import { parseWorkspaceDelta } from "@/features/workspace/types";
import { requireAccount } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { WorkflowCommandRejection, workflowCommandFailure } from "./errors";
import { workflowCommandSchema } from "./schemas";
import type {
  CurrentActorWorkflowCommand,
  WorkflowCommand,
  WorkflowCommandKind,
  WorkflowCommandResult
} from "./types";
import { withServerPerformanceSpan } from "@/features/performance/server";
import { getWorkspaceHotLoadingMode } from "@/features/workspace/mode";

type CommandContext = {
  actorId: string;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
};

type RawCommandSuccess = {
  data: Json;
  revision: number;
  changedEntityIds?: Record<string, Json | undefined>;
  alreadyApplied?: boolean;
};

type CommandOf<Kind extends WorkflowCommandKind> = Extract<WorkflowCommand, { kind: Kind }>;
type WorkflowCommandHandler<Kind extends WorkflowCommandKind> = (
  command: CommandOf<Kind>,
  context: CommandContext
) => Promise<RawCommandSuccess>;
type WorkflowCommandHandlerRegistry = {
  [Kind in WorkflowCommandKind]: WorkflowCommandHandler<Kind>;
};

function asRecord(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asNumber(value: Json | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: Json | undefined) {
  return value === true;
}

function stableResponseCode(value: Json | undefined) {
  return value === "invalid"
    || value === "forbidden"
    || value === "not-found"
    || value === "stale"
    || value === "invalid-state"
    || value === "conflict"
    || value === "unavailable"
    ? value
    : "unavailable";
}

function commandResponse(data: Json, fallbackData: Json): RawCommandSuccess {
  const response = asRecord(data);
  if (response.ok === false) {
    throw new WorkflowCommandRejection(
      stableResponseCode(response.code),
      response.code === "stale"
        ? "The workflow changed before this command could be applied."
        : "The workflow command was rejected.",
      asNumber(response.currentRevision) ?? undefined
    );
  }
  const revision = asNumber(response.workflowRevision);
  if (revision === null) {
    throw new WorkflowCommandRejection("unavailable", "The workflow command did not return a committed revision.");
  }
  return {
    data: fallbackData,
    revision,
    changedEntityIds: asRecord(response.changedEntityIds),
    alreadyApplied: asBoolean(response.alreadyApplied)
  };
}

async function calendarCreateHandler(
  command: CommandOf<"calendar.create">,
  { supabase }: CommandContext
) {
  const { payload } = command;
  const { data, error } = await supabase.rpc("create_calendar_schedule_item", {
    target_template_id: command.templateId,
    target_wafer_id: payload.waferId ?? null,
    target_location: payload.location,
    starts_at: payload.startsAt,
    ends_at: payload.endsAt,
    target_step_id: payload.processStepId ?? null,
    manual_action: payload.manualAction ?? null,
    description: payload.description ?? null,
    person_ids: Array.from(new Set(payload.personIds)),
    mutation_id: command.mutationId
  });
  if (error) throw error;
  const response = asRecord(data);
  return commandResponse(data, response.item ?? null);
}

async function calendarMoveHandler(
  command: CommandOf<"calendar.move">,
  { supabase }: CommandContext
) {
  const { payload } = command;
  const { data, error } = await supabase.rpc("move_calendar_schedule_item", {
    target_item_id: payload.eventId,
    expected_revision: payload.expectedRevision,
    target_location: payload.location,
    starts_at: payload.startsAt,
    ends_at: payload.endsAt,
    mutation_id: command.mutationId
  });
  if (error) throw error;
  const response = asRecord(data);
  return commandResponse(data, response.item ?? null);
}

async function calendarDeleteHandler(
  command: CommandOf<"calendar.delete">,
  { supabase }: CommandContext
) {
  const { data, error } = await supabase.rpc("delete_calendar_schedule_item", {
    target_item_id: command.payload.eventId,
    expected_revision: command.payload.expectedRevision,
    mutation_id: command.mutationId
  });
  if (error) throw error;
  return commandResponse(data, { id: command.payload.eventId });
}

async function processStepCreateHandler(
  command: CommandOf<"process.step.create">,
  { supabase }: CommandContext
) {
  const { payload } = command;
  const { data, error } = await supabase.rpc("create_process_step_command", {
    target_template_id: command.templateId,
    target_name: payload.name,
    target_process_area: payload.processArea,
    target_node_type: payload.nodeType,
    target_canvas_x: payload.canvasX,
    target_canvas_y: payload.canvasY,
    target_parameters_schema: payload.parametersSchema as Json,
    expected_workspace_revision: command.expectedWorkspaceRevision ?? null,
    mutation_id: command.mutationId
  });
  if (error) throw error;
  const response = asRecord(data);
  return commandResponse(data, response.item ?? null);
}

async function processTransitionCreateHandler(
  command: CommandOf<"process.transition.create">,
  { supabase }: CommandContext
) {
  const { payload } = command;
  const { data, error } = await supabase.rpc("create_process_transition_command", {
    target_template_id: command.templateId,
    source_step_id: payload.fromStepId,
    destination_step_id: payload.toStepId,
    target_edge_type: payload.edgeType,
    target_label: payload.label ?? null,
    target_condition: payload.condition as Json,
    target_priority: payload.priority,
    expected_workspace_revision: command.expectedWorkspaceRevision ?? null,
    mutation_id: command.mutationId
  });
  if (error) throw error;
  const response = asRecord(data);
  return commandResponse(data, response.item ?? null);
}

async function waferCreateHandler(
  command: CommandOf<"wafer.create">,
  { supabase }: CommandContext
) {
  const { payload } = command;
  const { data, error } = await supabase.rpc("create_process_wafer_command", {
    target_template_id: command.templateId,
    target_project_id: payload.projectId,
    target_wafer_code: payload.waferCode,
    target_die_count: payload.dieCount,
    expected_workspace_revision: command.expectedWorkspaceRevision ?? null,
    mutation_id: command.mutationId
  });
  if (error) throw error;
  const response = asRecord(data);
  return commandResponse(data, {
    wafer: response.wafer ?? null,
    assignment: response.assignment ?? null,
    stepExecution: response.stepExecution ?? null
  });
}

async function waferSubmitHandler(
  command: CommandOf<"wafer.submit">,
  { supabase }: CommandContext
) {
  const { payload } = command;
  const { data, error } = await supabase.rpc("execute_process_flow_mutations_batch", {
    mutations: [{
      kind: "submit",
      stepExecutionId: payload.stepExecutionId,
      mutationId: command.mutationId,
      batchId: payload.batchId,
      notes: payload.notes ?? null,
      evidence: payload.evidence
    }] as Json
  });
  if (error) throw error;
  const response = asRecord(data);
  const outcomes = Array.isArray(response.outcomes) ? response.outcomes : [];
  return commandResponse(data, asRecord(outcomes[0]).data ?? null);
}

async function waferRouteOrRedoHandler(
  command: CommandOf<"wafer.route"> | CommandOf<"wafer.redo">,
  { supabase }: CommandContext
) {
  const { payload } = command;
  const childSpecs = (await getDicingChildSpecsForCheckpoint({
    attemptId: payload.attemptId,
    supabase
  }) ?? []).map((spec) => ({ ...spec, movement_mutation_id: crypto.randomUUID() }));
  const { data, error } = await supabase.rpc("execute_process_flow_mutations_batch", {
    mutations: [{
      kind: "route",
      batchId: payload.batchId,
      attemptId: payload.attemptId,
      targetStepId: payload.targetStepId,
      decisionMutationId: payload.decisionMutationId,
      movementMutationId: command.mutationId,
      note: payload.note,
      childSpecs
    }] as Json
  });
  if (error) throw error;
  const response = asRecord(data);
  const outcomes = Array.isArray(response.outcomes) ? response.outcomes : [];
  return commandResponse(data, asRecord(outcomes[0]).data ?? null);
}

async function waferBatchMoveHandler(
  command: CommandOf<"wafer.batch.move">,
  { supabase }: CommandContext
) {
  const first = command.payload.mutations[0];
  const firstOperationId = first?.kind === "route" ? first.movementMutationId : first?.mutationId;
  if (firstOperationId !== command.mutationId) {
    throw new WorkflowCommandRejection("invalid", "The batch command id must match its first operation id.");
  }
  const mutations = await Promise.all(command.payload.mutations.map(async (mutation) => {
    if (mutation.kind !== "route") return mutation;
    const childSpecs = (await getDicingChildSpecsForCheckpoint({ attemptId: mutation.attemptId, supabase }) ?? [])
      .map((spec) => ({ ...spec, movement_mutation_id: crypto.randomUUID() }));
    return { ...mutation, childSpecs };
  }));
  const useV2 = getWorkspaceHotLoadingMode() === "on";
  const { data, error } = await withServerPerformanceSpan("process_flow_mutation_rpc", {
    templateId: command.templateId,
    mutationId: command.mutationId,
    mutationCount: mutations.length,
    version: useV2 ? "v2" : "compatibility"
  }, async () => useV2
    ? supabase.rpc("execute_process_flow_mutations_batch_v2", {
        requested_template_id: command.templateId,
        expected_workspace_revision: command.expectedWorkspaceRevision ?? null,
        command_mutation_id: command.mutationId,
        mutations: mutations as Json
      })
    : supabase.rpc("execute_process_flow_mutations_batch", {
        mutations: mutations as Json
      })
  );
  if (error) throw error;
  const response = asRecord(data);
  if (useV2 && (response.templateId !== command.templateId || response.mutationId !== command.mutationId)) {
    throw new WorkflowCommandRejection("unavailable", "The committed batch identity did not match the requested process.");
  }
  return commandResponse(data, Array.isArray(response.outcomes) ? response.outcomes : []);
}

async function waferArchiveHandler(
  command: CommandOf<"wafer.archive">,
  { supabase }: CommandContext
) {
  const { data, error } = await supabase.rpc("archive_process_assignments_command", {
    target_template_id: command.templateId,
    target_assignment_ids: command.payload.items.map((item) => item.assignmentId),
    item_mutation_ids: command.payload.items.map((item) => item.mutationId),
    expected_workspace_revision: command.expectedWorkspaceRevision ?? null,
    mutation_id: command.mutationId
  });
  if (error) throw error;
  const response = asRecord(data);
  return commandResponse(data, { archived: response.archived ?? [] });
}

export const workflowCommandHandlers = {
  "calendar.create": calendarCreateHandler,
  "calendar.move": calendarMoveHandler,
  "calendar.delete": calendarDeleteHandler,
  "process.step.create": processStepCreateHandler,
  "process.transition.create": processTransitionCreateHandler,
  "wafer.create": waferCreateHandler,
  "wafer.submit": waferSubmitHandler,
  "wafer.route": waferRouteOrRedoHandler,
  "wafer.batch.move": waferBatchMoveHandler,
  "wafer.redo": waferRouteOrRedoHandler,
  "wafer.archive": waferArchiveHandler
} satisfies WorkflowCommandHandlerRegistry;

function changedEntitiesForMutation(delta: ReturnType<typeof parseWorkspaceDelta>, mutationId: string) {
  const change = delta.changes.find((candidate) => {
    const record = asRecord(candidate);
    return record.client_mutation_id === mutationId;
  });
  return asRecord(asRecord(change).changed_entities);
}

async function executeParsedWorkflowCommand(
  command: WorkflowCommand,
  context: CommandContext
): Promise<WorkflowCommandResult> {
  try {
    if (command.actorId !== context.actorId) {
      throw new WorkflowCommandRejection("forbidden", "The workflow command actor does not match the signed-in account.");
    }
    const handler = workflowCommandHandlers[command.kind] as (
      command: WorkflowCommand,
      context: CommandContext
    ) => Promise<RawCommandSuccess>;
    const outcome = await handler(command, context);
    const { data: deltaData, error: deltaError } = await withServerPerformanceSpan(
      "committed_delta_rpc",
      { templateId: command.templateId, mutationId: command.mutationId, revision: outcome.revision },
      async () => context.supabase.rpc("get_process_workspace_delta", {
        target_template_id: command.templateId,
        after_revision: Math.max(0, outcome.revision - 1)
      })
    );
    if (deltaError) throw deltaError;
    const delta = parseWorkspaceDelta(deltaData);
    if (delta.hasGap || delta.revision < outcome.revision) {
      throw new WorkflowCommandRejection("unavailable", "The committed workflow delta is not available yet.");
    }
    const changedEntityIds = Object.keys(outcome.changedEntityIds ?? {}).length > 0
      ? outcome.changedEntityIds ?? {}
      : changedEntitiesForMutation(delta, command.mutationId);
    return {
      ok: true,
      kind: command.kind,
      mutationId: command.mutationId,
      templateId: command.templateId,
      actorId: command.actorId,
      revision: outcome.revision,
      changedEntityIds,
      delta,
      data: outcome.data,
      alreadyApplied: outcome.alreadyApplied ?? false
    };
  } catch (error) {
    return workflowCommandFailure({
      error,
      kind: command.kind,
      mutationId: command.mutationId,
      templateId: command.templateId
    });
  }
}

export async function executeWorkflowCommandServer(input: unknown): Promise<WorkflowCommandResult> {
  const parsed = workflowCommandSchema.safeParse(input);
  if (!parsed.success) return workflowCommandFailure({ error: parsed.error });
  try {
    const account = await requireAccount();
    const supabase = await createServerSupabaseClient();
    return executeParsedWorkflowCommand(parsed.data, { actorId: account.userId, supabase });
  } catch (error) {
    return workflowCommandFailure({
      error,
      kind: parsed.data.kind,
      mutationId: parsed.data.mutationId,
      templateId: parsed.data.templateId
    });
  }
}

export async function executeWorkflowCommandForCurrentActor(
  input: CurrentActorWorkflowCommand
): Promise<WorkflowCommandResult> {
  try {
    const account = await requireAccount();
    const parsed = workflowCommandSchema.parse({ ...input, actorId: account.userId });
    const supabase = await createServerSupabaseClient();
    return executeParsedWorkflowCommand(parsed, { actorId: account.userId, supabase });
  } catch (error) {
    const record = input as Partial<CurrentActorWorkflowCommand>;
    return workflowCommandFailure({
      error,
      kind: typeof record.kind === "string" ? record.kind as WorkflowCommandKind : "unknown",
      mutationId: typeof record.mutationId === "string" ? record.mutationId : null,
      templateId: typeof record.templateId === "string" ? record.templateId : null
    });
  }
}
