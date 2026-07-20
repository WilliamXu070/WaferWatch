import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getCheckpointRouteAssignmentStepKey,
  getCheckpointRouteCorrectionState
} from "@/features/process-flows/checkpointRouteCorrection";
import { getHistoryUndoState } from "@/features/process-flows/historyUndo";
import { isDicedParentWafer } from "@/features/process-flows/waferVisibility";
import type {
  Json,
  ProcessStep,
  ProcessStepTransition,
  ProcessTemplate,
  StepExecution,
  StepStatus,
  WaferProcessAssignment
} from "@/types/database";

type DashboardAssignment = Pick<
  WaferProcessAssignment,
  | "id"
  | "wafer_id"
  | "status"
  | "assigned_at"
  | "started_at"
  | "completed_at"
  | "assigned_by"
  | "current_step_id"
  | "anytime_return_step_id"
>;

type DashboardStepExecution = Pick<
  StepExecution,
  "id" | "assignment_id" | "process_step_id" | "status" | "tool_id" | "operator_id" | "completed_by" | "created_at"
>;

type DashboardStepAttempt = {
  id: string;
  assignment_id: string;
  process_step_id: string;
  attempt_number: number;
  submitted_at: string;
  submitted_by: string | null;
  submission_notes: string | null;
};

type DashboardProcessEvent = {
  id: string;
  event_type: string;
  event_at: string;
  metadata: Json;
};

export type ProcessTemplateWithSteps = ProcessTemplate & {
  process_steps: ProcessStep[];
  process_step_transitions: ProcessStepTransition[];
};

export type ProcessDashboardWaferState = {
  assignmentId: string;
  assignmentStatus: WaferProcessAssignment["status"];
  waferId: string;
  waferCode: string;
  projectId: string;
  dieLabel: string | null;
  currentStepId: string | null;
  currentStepExecutionId: string | null;
  latestStepAttemptId: string | null;
  latestStepAttemptSubmittedById: string | null;
  latestStepAttemptNotes: string | null;
  currentStepName: string | null;
  currentStepOrder: number | null;
  currentStepStatus: StepStatus | null;
  currentStepArea: string | null;
  currentToolId: string | null;
  nextStepName: string | null;
  currentHandlerName: string | null;
  requiredReviewerId: string | null;
  requiredReviewerName: string | null;
  canUndoHistory: boolean;
  historyCorrectionCount: number;
  canCorrectCheckpointRoute: boolean;
  checkpointRouteSourceStepId: string | null;
  anytimeReturnStepId: string | null;
  anytimeReturnStepName: string | null;
  dieDescriptions: Record<string, string>;
  diePolingParameters: Record<string, Record<string, Record<string, Record<string, string>>>>;
};

export type ProcessDashboardCalendarEvent = {
  id: string;
  source: "reservation" | "planned_step";
  time: string;
  timeValue: number;
  title: string;
  subtitle: string;
  location: string;
  note?: string;
};

export type ProcessDashboardCalendarDay = {
  isoDate: string;
  dateLabel: string;
  dayName: string;
  events: ProcessDashboardCalendarEvent[];
};

export type ProcessDashboardData = {
  process: ProcessTemplateWithSteps;
  activeWaferStates: ProcessDashboardWaferState[];
  workspaceWaferStates: ProcessDashboardWaferState[];
  calendarDays: ProcessDashboardCalendarDay[];
};

export type ProcessArchiveItem = {
  assignmentId: string;
  waferId: string;
  waferCode: string;
  dieLabel: string | null;
  archivedAt: string;
  archivedByName: string | null;
  completedAt: string | null;
};

export type ProcessDashboardWaferData = Omit<ProcessDashboardData, "calendarDays">;

export async function getProcessTemplate(templateId: string) {
  const supabase = await createServerSupabaseClient();
  const [templateResult, stepsResult, transitionsResult] = await Promise.all([
    supabase
      .from("process_templates")
      .select("*")
      .eq("id", templateId)
      .single(),
    supabase
      .from("process_steps")
      .select("*")
      .eq("template_id", templateId)
      .is("archived_at", null)
      .order("step_order", {
        ascending: true
      }),
    supabase
      .from("process_step_transitions")
      .select("*")
      .eq("template_id", templateId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
  ]);

  if (templateResult.error) {
    throw templateResult.error;
  }

  if (stepsResult.error) {
    throw stepsResult.error;
  }

  if (transitionsResult.error) {
    throw transitionsResult.error;
  }

  return {
    ...templateResult.data,
    process_steps: stepsResult.data ?? [],
    process_step_transitions: transitionsResult.data ?? []
  };
}

export async function getFirstActiveProcessTemplateId() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("process_templates")
    .select("id")
    .eq("is_active", true)
    .eq("lifecycle_status", "published")
    .order("updated_at", { ascending: false })
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

function extractDieLabel(metadata: Json): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const candidate =
    "current_die" in metadata && typeof metadata.current_die === "string"
      ? metadata.current_die
      : "die" in metadata && typeof metadata.die === "string"
        ? metadata.die
        : "chip" in metadata && typeof metadata.chip === "string"
          ? metadata.chip
          : "chip_id" in metadata && typeof metadata.chip_id === "string"
            ? metadata.chip_id
            : "die_id" in metadata && typeof metadata.die_id === "string"
              ? metadata.die_id
              : undefined;

  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function extractDieDescriptions(metadata: Json): Record<string, string> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const rawDescriptions = metadata.die_descriptions;
  if (!rawDescriptions || typeof rawDescriptions !== "object" || Array.isArray(rawDescriptions)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawDescriptions).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

const DIE_POLING_PARAMETERS_KEY = "die_poling_parameters";

function extractDiePolingParameters(metadata: Json): Record<string, Record<string, Record<string, Record<string, string>>>> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const rawParameters = metadata[DIE_POLING_PARAMETERS_KEY];
  if (!rawParameters || typeof rawParameters !== "object" || Array.isArray(rawParameters)) {
    return {};
  }

  const output: Record<string, Record<string, Record<string, Record<string, string>>>> = {};

  for (const [dieCode, rawRows] of Object.entries(rawParameters)) {
    if (!rawRows || typeof rawRows !== "object" || Array.isArray(rawRows)) {
      continue;
    }

    const rows: Record<string, Record<string, Record<string, string>>> = {};
    for (const [rowKey, rawColumns] of Object.entries(rawRows)) {
      if (!rawColumns || typeof rawColumns !== "object" || Array.isArray(rawColumns)) {
        continue;
      }

      const columns: Record<string, Record<string, string>> = {};
      for (const [columnKey, rawFields] of Object.entries(rawColumns)) {
        if (!rawFields || typeof rawFields !== "object" || Array.isArray(rawFields)) {
          continue;
        }

        const fields = Object.fromEntries(
          Object.entries(rawFields).filter((entry): entry is [string, string] => typeof entry[1] === "string")
        );

        if (Object.keys(fields).length > 0) {
          columns[columnKey] = fields;
        }
      }

      if (Object.keys(columns).length > 0) {
        rows[rowKey] = columns;
      }
    }

    if (Object.keys(rows).length > 0) {
      output[dieCode] = rows;
    }
  }

  return output;
}

function deriveStepStatusRank(status: StepStatus) {
  if (status === "awaiting_checkpoint") return 0;
  if (status === "redo_required") return 1;
  if (status === "running") return 2;
  if (status === "blocked") return 3;
  if (status === "failed") return 4;
  if (status === "queued") return 5;
  if (status === "pending") return 6;
  return 9;
}

function getFallbackStepStatus(status: WaferProcessAssignment["status"]): StepStatus | null {
  if (status === "planned") return "pending";
  if (status === "queued") return "queued";
  if (status === "in_progress") return "running";
  if (status === "on_hold") return "blocked";
  return null;
}

function pickCurrentStepExecution(
  executions: ReadonlyArray<DashboardStepExecution>,
  stepOrderById: Map<string, number>
) {
  const prioritized = executions
    .filter((execution) =>
      ["awaiting_checkpoint", "redo_required", "running", "blocked", "failed", "queued", "pending"].includes(execution.status)
    )
    .sort((a, b) => {
      const rankA = deriveStepStatusRank(a.status);
      const rankB = deriveStepStatusRank(b.status);

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      const orderA = stepOrderById.get(a.process_step_id) ?? Number.MAX_SAFE_INTEGER;
      const orderB = stepOrderById.get(b.process_step_id) ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });

  if (prioritized[0]) {
    return prioritized[0];
  }

  return executions
    .filter((execution) => execution.status === "completed" || execution.status === "skipped")
    .sort((a, b) => {
      const orderA = stepOrderById.get(a.process_step_id) ?? Number.MAX_SAFE_INTEGER;
      const orderB = stepOrderById.get(b.process_step_id) ?? Number.MAX_SAFE_INTEGER;
      return orderB - orderA;
    })[0];
}

function toDayIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayLabel(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function createEmptyCalendarDays(fromDate: Date, totalDays: number): ProcessDashboardCalendarDay[] {
  return Array.from({ length: totalDays }, (_, index) => {
    const currentDate = new Date(fromDate);
    currentDate.setDate(fromDate.getDate() + index);
    const isoDate = toDayIso(currentDate);

    return {
      isoDate,
      dateLabel: currentDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      dayName: dayLabel(currentDate),
      events: []
    };
  });
}

export async function getProcessArchiveItems(processTemplateId: string): Promise<ProcessArchiveItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data: assignments, error: assignmentsError } = await supabase
    .from("wafer_process_assignments")
    .select("id, wafer_id, completed_at, archived_at, archived_by")
    .eq("template_id", processTemplateId)
    .is("deleted_at", null)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (assignmentsError) {
    throw assignmentsError;
  }

  const latestAssignmentByWafer = new Map<string, NonNullable<typeof assignments>[number]>();
  for (const assignment of assignments ?? []) {
    if (!latestAssignmentByWafer.has(assignment.wafer_id)) {
      latestAssignmentByWafer.set(assignment.wafer_id, assignment);
    }
  }

  const waferIds = Array.from(latestAssignmentByWafer.keys());
  if (!waferIds.length) {
    return [];
  }

  const { data: wafers, error: wafersError } = await supabase
    .from("wafers")
    .select("id, wafer_code, die_label, metadata, archived_at")
    .in("id", waferIds)
    .is("deleted_at", null)
    .not("archived_at", "is", null);

  if (wafersError) {
    throw wafersError;
  }

  const actorIds = Array.from(new Set(
    Array.from(latestAssignmentByWafer.values())
      .map((assignment) => assignment.archived_by)
      .filter((actorId): actorId is string => Boolean(actorId))
  ));
  const { data: actors, error: actorsError } = actorIds.length
    ? await supabase.from("profiles").select("id, display_name, email").in("id", actorIds)
    : { data: [], error: null };

  if (actorsError) {
    throw actorsError;
  }

  const actorNameById = new Map((actors ?? []).map((actor) => [
    actor.id,
    actor.display_name?.trim() || actor.email
  ]));

  return (wafers ?? []).flatMap((wafer) => {
    const assignment = latestAssignmentByWafer.get(wafer.id);
    const archivedAt = assignment?.archived_at ?? wafer.archived_at;
    if (!assignment || !archivedAt) {
      return [];
    }
    return [{
      assignmentId: assignment.id,
      waferId: wafer.id,
      waferCode: wafer.wafer_code,
      dieLabel: wafer.die_label ?? extractDieLabel(wafer.metadata as Json),
      archivedAt,
      archivedByName: assignment.archived_by ? actorNameById.get(assignment.archived_by) ?? null : null,
      completedAt: assignment.completed_at
    }];
  }).sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

export async function getProcessDashboardData(
  processTemplateId: string,
  calendarDays = 14,
  includeCalendar = true,
  resolvedProcess?: ProcessTemplateWithSteps
): Promise<ProcessDashboardData> {
  const supabase = await createServerSupabaseClient();
  const process = resolvedProcess?.id === processTemplateId
    ? resolvedProcess
    : await getProcessTemplate(processTemplateId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const toDate = new Date(today);
  toDate.setDate(today.getDate() + calendarDays - 1);
  toDate.setHours(23, 59, 59, 999);

  const fromIso = today.toISOString();
  const toIso = toDate.toISOString();
  const activeStatuses: WaferProcessAssignment["status"][] = [
    "planned",
    "queued",
    "in_progress",
    "on_hold"
  ];
  const activeStatusSet = new Set(activeStatuses);

  const stepOrderById = new Map(process.process_steps.map((step) => [step.id, step.step_order]));
  const stepNameById = new Map(process.process_steps.map((step) => [step.id, step.name]));
  const stepAreaById = new Map(process.process_steps.map((step) => [step.id, step.process_area]));
  const sortedProcessSteps = process.process_steps
    .filter((step) => step.execution_mode !== "anytime")
    .sort((a, b) => a.step_order - b.step_order);
  const startStep = sortedProcessSteps[0] ?? null;

  const assignmentsResult = await supabase
    .from("wafer_process_assignments")
    .select("id, wafer_id, status, assigned_at, started_at, completed_at, assigned_by, current_step_id, anytime_return_step_id")
    .eq("template_id", processTemplateId)
    .is("deleted_at", null)
    .is("archived_at", null);

  if (assignmentsResult.error) {
    throw assignmentsResult.error;
  }

  const assignments: DashboardAssignment[] = assignmentsResult.data ?? [];

  const assignmentIds = assignments.map((assignment) => assignment.id);
  const waferIds = assignments.map((assignment) => assignment.wafer_id);
  const assignedWafersQuery = waferIds.length
    ? supabase
        .from("wafers")
        .select("id, wafer_code, project_id, die_label, metadata")
        .is("deleted_at", null)
        .is("archived_at", null)
        .in("id", waferIds)
    : Promise.resolve({ data: [], error: null } as const);

  const [stepExecutionsResult, stepAttemptsResult, processEventsResult, assignedWafersResult] = await Promise.all([
    assignmentIds.length
      ? supabase
          .from("step_executions")
          .select("id, assignment_id, process_step_id, status, tool_id, operator_id, completed_by, created_at")
          .in("assignment_id", assignmentIds)
      : Promise.resolve({ data: [], error: null } as const),
    assignmentIds.length
      ? supabase
          .from("process_step_attempts")
          .select("id, assignment_id, process_step_id, attempt_number, submitted_at, submitted_by, submission_notes")
          .in("assignment_id", assignmentIds)
          .order("attempt_number", { ascending: false })
      : Promise.resolve({ data: [], error: null } as const),
    assignmentIds.length
      ? supabase
          .from("process_events")
          .select("id, event_type, event_at, metadata")
          .in("wafer_id", waferIds)
          .in("event_type", ["wafer_step_moved", "wafer_step_reverted", "checkpoint_step_entered", "wafer_history_undone", "wafer_history_correction"])
          .order("event_at", { ascending: true })
      : Promise.resolve({ data: [], error: null } as const),
    assignedWafersQuery
  ]);

  if (stepExecutionsResult.error) {
    throw stepExecutionsResult.error;
  }

  if (stepAttemptsResult.error) {
    throw stepAttemptsResult.error;
  }

  if (processEventsResult.error) {
    throw processEventsResult.error;
  }

  if (assignedWafersResult.error) {
    throw assignedWafersResult.error;
  }

  const mergedWafersById = new Map<string, {
    id: string;
    wafer_code: string;
    project_id: string;
    die_label: string | null;
    metadata: unknown;
  }>();
  for (const wafer of assignedWafersResult.data ?? []) {
    mergedWafersById.set(wafer.id, wafer);
  }

  const projectIds = Array.from(
    new Set(Array.from(mergedWafersById.values()).map((wafer) => wafer.project_id))
  );

  const reservationsResult = includeCalendar
    ? await (projectIds.length
        ? supabase
            .from("tool_reservations")
            .select("id, starts_at, tool_id, status, notes, project_id")
            .in("project_id", projectIds)
            .gte("starts_at", fromIso)
            .lte("starts_at", toIso)
            .neq("status", "cancelled")
            .order("starts_at", { ascending: true })
        : Promise.resolve({ data: [], error: null } as const))
    : ({ data: [], error: null } as const);

  const plannedStepsResult = includeCalendar
    ? await (assignmentIds.length
        ? supabase
            .from("step_executions")
            .select("id, assignment_id, process_step_id, planned_start_at, tool_id")
            .in("assignment_id", assignmentIds)
            .not("planned_start_at", "is", null)
            .gte("planned_start_at", fromIso)
            .lte("planned_start_at", toIso)
            .order("planned_start_at", { ascending: true })
        : Promise.resolve({ data: [], error: null } as const))
    : ({ data: [], error: null } as const);

  if (reservationsResult.error) {
    throw reservationsResult.error;
  }

  if (plannedStepsResult.error) {
    throw plannedStepsResult.error;
  }

  const wafersById = mergedWafersById;

  const assignmentWaferIdById = new Map(assignments.map((assignment) => [assignment.id, assignment.wafer_id]));
  const workflowEvents = (processEventsResult.data ?? []) as DashboardProcessEvent[];
  const historyUndoState = getHistoryUndoState(workflowEvents.map((event) => ({
    id: event.id,
    eventType: event.event_type,
    metadata: event.metadata
  })));
  const visibleWorkflowEvents = workflowEvents.filter((event) =>
    event.event_type !== "wafer_history_undone" &&
    !historyUndoState.undoneProcessEventIds.has(event.id)
  );
  const historyCorrectionCountByAssignment = new Map<string, number>();
  for (const event of visibleWorkflowEvents) {
    if (event.event_type !== "wafer_history_correction") continue;
    const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
      ? event.metadata as Record<string, unknown>
      : {};
    const assignmentId = typeof metadata.assignment_id === "string" ? metadata.assignment_id : null;
    if (assignmentId) {
      historyCorrectionCountByAssignment.set(assignmentId, (historyCorrectionCountByAssignment.get(assignmentId) ?? 0) + 1);
    }
  }
  const checkpointRouteState = getCheckpointRouteCorrectionState(
    visibleWorkflowEvents
      .map((event) => ({
      id: event.id,
      eventAt: event.event_at,
      metadata: event.metadata
      }))
  );

  const stepExecutionsByAssignment = new Map<string, DashboardStepExecution[]>();
  const latestAttemptByAssignmentStep = new Map<string, DashboardStepAttempt>();
  const handlerProfileIds = new Set<string>();

  for (const step of process.process_steps) {
    if (step.required_reviewer_id) {
      handlerProfileIds.add(step.required_reviewer_id);
    }
  }

  for (const execution of stepExecutionsResult.data ?? []) {
    if (execution.operator_id) {
      handlerProfileIds.add(execution.operator_id);
    }
    if (execution.completed_by) {
      handlerProfileIds.add(execution.completed_by);
    }

    const entry = stepExecutionsByAssignment.get(execution.assignment_id);
    if (entry) {
      entry.push(execution as DashboardStepExecution);
    } else {
      stepExecutionsByAssignment.set(execution.assignment_id, [execution as DashboardStepExecution]);
    }
  }

  for (const attempt of stepAttemptsResult.data ?? []) {
    if (historyUndoState.undoneAttemptIds.has(attempt.id)) {
      continue;
    }
    const key = `${attempt.assignment_id}:${attempt.process_step_id}`;
    const current = latestAttemptByAssignmentStep.get(key);
    if (!current || attempt.attempt_number > current.attempt_number) {
      latestAttemptByAssignmentStep.set(key, attempt as DashboardStepAttempt);
    }
  }

  for (const assignment of assignments) {
    if (assignment.assigned_by) {
      handlerProfileIds.add(assignment.assigned_by);
    }
  }

  const handlersResult = handlerProfileIds.size
    ? await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", Array.from(handlerProfileIds))
    : { data: [], error: null };

  if (handlersResult.error) {
    throw handlersResult.error;
  }

  const handlerNameById = new Map(
    (handlersResult.data ?? []).map((profile) => [
      profile.id,
      profile.display_name?.trim() || profile.email
    ])
  );

  const workspaceWaferStates: ProcessDashboardWaferState[] = [];
  const activeWaferStates: ProcessDashboardWaferState[] = [];

  for (const assignment of assignments) {
    const wafer = wafersById.get(assignment.wafer_id);
    if (!wafer || isDicedParentWafer(wafer.metadata)) {
      continue;
    }

    const executions = stepExecutionsByAssignment.get(assignment.id) ?? [];
    const inferredCurrentExecution = pickCurrentStepExecution(executions, stepOrderById);
    const currentStepId =
      assignment.current_step_id ?? inferredCurrentExecution?.process_step_id ?? startStep?.id ?? null;
    const currentExecution = currentStepId
      ? executions.find((execution) => execution.process_step_id === currentStepId) ??
        (assignment.current_step_id ? undefined : inferredCurrentExecution)
      : inferredCurrentExecution;
    const currentStepOrder = currentExecution
      ? stepOrderById.get(currentExecution.process_step_id) ?? null
      : currentStepId
        ? stepOrderById.get(currentStepId) ?? null
        : startStep?.step_order ?? null;
    const nextStep = currentStepOrder === null
      ? null
      : sortedProcessSteps.find((step) => step.step_order > currentStepOrder) ?? null;
    const handlerProfileId =
      currentExecution?.operator_id ??
      currentExecution?.completed_by ??
      assignment.assigned_by;
    const requiredReviewerId = currentStepId
      ? process.process_steps.find((step) => step.id === currentStepId)?.required_reviewer_id ?? null
      : null;
    const latestAttempt = currentStepId
      ? latestAttemptByAssignmentStep.get(`${assignment.id}:${currentStepId}`) ?? null
      : null;
    const currentCheckpointRoute = currentStepId
      ? checkpointRouteState.activeRouteByAssignmentStep.get(
          getCheckpointRouteAssignmentStepKey(assignment.id, currentStepId)
        ) ?? null
      : null;
    const currentStepStatus = currentExecution ? currentExecution.status : getFallbackStepStatus(assignment.status);
    const currentStepIdForHistory = currentStepId;
    const hasCurrentArrival = currentStepIdForHistory
      ? visibleWorkflowEvents.some((event) => {
          if (!checkpointRouteState.visibleEventIds.has(event.id)) return false;
          const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
            ? event.metadata as Record<string, unknown>
            : {};
          const assignmentId = typeof metadata.assignment_id === "string" ? metadata.assignment_id : null;
          const targetStepId = typeof metadata.target_step_id === "string"
            ? metadata.target_step_id
            : typeof metadata.to_step_id === "string"
              ? metadata.to_step_id
              : null;
          return assignmentId === assignment.id && targetStepId === currentStepIdForHistory;
        })
      : false;
    const canUndoHistory = currentStepStatus !== null && ["awaiting_checkpoint", "ready_to_move", "completed"].includes(currentStepStatus)
      ? Boolean(latestAttempt)
      : hasCurrentArrival;

    const waferState: ProcessDashboardWaferState = {
      assignmentId: assignment.id,
      assignmentStatus: assignment.status,
      waferId: wafer.id,
      waferCode: wafer.wafer_code,
      projectId: wafer.project_id,
      dieLabel: wafer.die_label ?? extractDieLabel(wafer.metadata as Json),
      currentStepId,
      currentStepExecutionId: currentExecution?.id ?? null,
      latestStepAttemptId: latestAttempt?.id ?? null,
      latestStepAttemptSubmittedById: latestAttempt?.submitted_by ?? null,
      latestStepAttemptNotes: latestAttempt?.submission_notes ?? null,
      currentStepName: currentStepId ? stepNameById.get(currentStepId) ?? null : null,
      currentStepOrder,
      currentStepStatus,
      currentStepArea: currentExecution
        ? stepAreaById.get(currentExecution.process_step_id) ?? null
        : startStep?.process_area ?? null,
      currentToolId: currentExecution?.tool_id ?? null,
      nextStepName: nextStep?.name ?? null,
      currentHandlerName: handlerProfileId ? handlerNameById.get(handlerProfileId) ?? null : null,
      requiredReviewerId,
      requiredReviewerName: requiredReviewerId ? handlerNameById.get(requiredReviewerId) ?? null : null,
      canUndoHistory,
      historyCorrectionCount: historyCorrectionCountByAssignment.get(assignment.id) ?? 0,
      canCorrectCheckpointRoute: currentCheckpointRoute !== null,
      checkpointRouteSourceStepId: currentCheckpointRoute?.fromStepId ?? null,
      anytimeReturnStepId: assignment.anytime_return_step_id,
      anytimeReturnStepName: assignment.anytime_return_step_id
        ? stepNameById.get(assignment.anytime_return_step_id) ?? null
        : null,
      dieDescriptions: extractDieDescriptions(wafer.metadata as Json),
      diePolingParameters: extractDiePolingParameters(wafer.metadata as Json)
    };

    workspaceWaferStates.push(waferState);
    if (activeStatusSet.has(assignment.status)) {
      activeWaferStates.push(waferState);
    }
  }

  if (!includeCalendar) {
    return {
      process,
      workspaceWaferStates,
      activeWaferStates,
      calendarDays: []
    };
  }

  const toolIds = new Set<string>();
  const calendarDaysMap = new Map<string, ProcessDashboardCalendarDay>();
  createEmptyCalendarDays(today, calendarDays).forEach((entry) => {
    calendarDaysMap.set(entry.isoDate, entry);
  });

  for (const reservation of reservationsResult.data ?? []) {
    if (reservation.tool_id) {
      toolIds.add(reservation.tool_id);
    }
  }

  for (const plannedStep of plannedStepsResult.data ?? []) {
    if (plannedStep.tool_id) {
      toolIds.add(plannedStep.tool_id);
    }
  }

  const toolIdArray = Array.from(toolIds);
  const toolsResult = await (toolIdArray.length
    ? supabase
        .from("fabrication_tools")
        .select("id, name, location")
        .in("id", toolIdArray)
    : Promise.resolve({ data: [], error: null } as const));

  if (toolsResult.error) {
    throw toolsResult.error;
  }

  const toolById = new Map(
    (toolsResult.data ?? []).map((tool: { id: string; name: string; location: string | null }) => [
      tool.id,
      { name: tool.name, location: tool.location ?? "Location pending" }
    ])
  );

  const wafersByIdForCalendar = new Map(Array.from(wafersById.values()).map((wafer) => [wafer.id, wafer.wafer_code]));
  const stepNameByIdForCalendar = new Map(process.process_steps.map((step) => [step.id, step.name]));

  for (const reservation of reservationsResult.data ?? []) {
    const startsAt = reservation.starts_at ? new Date(reservation.starts_at) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      continue;
    }

    const dayKey = toDayIso(startsAt);
    const calendarDay = calendarDaysMap.get(dayKey);
    if (!calendarDay) {
      continue;
    }

    const tool = reservation.tool_id ? toolById.get(reservation.tool_id) : null;
    const title = tool ? `${tool.name} reserved` : "Tool reservation";
    const location = tool ? tool.location : "Location pending";

    calendarDay.events.push({
      id: reservation.id,
      source: "reservation",
      time: formatTime(startsAt),
      timeValue: startsAt.getTime(),
      title,
      subtitle: reservation.notes ?? "No reservation note",
      location
    });
  }

  const assignmentsById = new Map(assignments.map((assignment) => [assignment.id, assignment.status]));
  for (const plannedStep of plannedStepsResult.data ?? []) {
    const assignmentId = plannedStep.assignment_id;
    if (!assignmentsById.has(assignmentId)) {
      continue;
    }

    const startsAt = plannedStep.planned_start_at ? new Date(plannedStep.planned_start_at) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      continue;
    }

    const dayKey = toDayIso(startsAt);
    const calendarDay = calendarDaysMap.get(dayKey);
    if (!calendarDay) {
      continue;
    }

    const tool = plannedStep.tool_id ? toolById.get(plannedStep.tool_id) : null;
    const assignedWafer =
      wafersByIdForCalendar.get(assignmentWaferIdById.get(assignmentId) ?? "") ?? "Unknown wafer";
    const stepName = stepNameByIdForCalendar.get(plannedStep.process_step_id) ?? "Process step";
    const location = tool ? tool.location : "Location pending";

    calendarDay.events.push({
      id: plannedStep.id,
      source: "planned_step",
      time: formatTime(startsAt),
      timeValue: startsAt.getTime(),
      title: `${assignedWafer} • ${stepName}`,
      subtitle: "Planned run",
      location
    });
  }

  const sortedCalendarDays = createEmptyCalendarDays(today, calendarDays).map((calendarDay) => {
    const day = calendarDaysMap.get(calendarDay.isoDate);
    if (!day) {
      return calendarDay;
    }

    const sortedEvents = [...day.events].sort((a, b) => a.timeValue - b.timeValue);
    return {
      ...day,
      events: sortedEvents
    };
  });

  return {
    process,
    workspaceWaferStates,
    activeWaferStates,
    calendarDays: sortedCalendarDays
  };
}
