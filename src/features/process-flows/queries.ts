import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHistoryUndoState } from "@/features/process-flows/historyUndo";
import { isDicedParentWafer } from "@/features/process-flows/waferVisibility";
import type {
  Json,
  ProcessStep,
  ProcessStepTransition,
  ProcessTemplate,
  StepStatus,
  WaferProcessAssignment
} from "@/types/database";

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

  const { data: currentRows, error: currentError } = await supabase
    .from("vw_process_current_state")
    .select("*")
    .eq("template_id", processTemplateId)
    .is("archived_at", null);

  if (currentError) throw currentError;

  const waferIds = (currentRows ?? []).map((state) => state.wafer_id);
  const { data: correctionEvents, error: correctionError } = waferIds.length
    ? await supabase
        .from("process_events")
        .select("id, event_type, event_at, metadata")
        .in("wafer_id", waferIds)
        .in("event_type", ["wafer_history_undone", "wafer_history_correction"])
        .order("event_at", { ascending: true })
    : { data: [], error: null };

  if (correctionError) throw correctionError;

  const workflowEvents = (correctionEvents ?? []) as DashboardProcessEvent[];
  const historyUndoState = getHistoryUndoState(workflowEvents.map((event) => ({
    id: event.id,
    eventType: event.event_type,
    metadata: event.metadata
  })));
  const historyCorrectionCountByAssignment = new Map<string, number>();
  for (const event of workflowEvents) {
    if (
      event.event_type !== "wafer_history_correction" ||
      historyUndoState.undoneProcessEventIds.has(event.id) ||
      !event.metadata ||
      typeof event.metadata !== "object" ||
      Array.isArray(event.metadata)
    ) continue;
    const assignmentId = typeof event.metadata.assignment_id === "string"
      ? event.metadata.assignment_id
      : null;
    if (assignmentId) {
      historyCorrectionCountByAssignment.set(
        assignmentId,
        (historyCorrectionCountByAssignment.get(assignmentId) ?? 0) + 1
      );
    }
  }

  const stepById = new Map(process.process_steps.map((step) => [step.id, step]));
  const workspaceWaferStates: ProcessDashboardWaferState[] = [];
  const activeWaferStates: ProcessDashboardWaferState[] = [];
  const activeStatuses = new Set<WaferProcessAssignment["status"]>([
    "planned", "queued", "in_progress", "on_hold"
  ]);

  for (const state of currentRows ?? []) {
    const metadata = state.wafer_metadata as Json;
    if (isDicedParentWafer(metadata)) continue;
    const step = state.current_step_id ? stepById.get(state.current_step_id) ?? null : null;
    const memberStatus = state.current_member_status;
    const currentStepStatus: StepStatus | null = state.assignment_status === "completed"
      ? "completed"
      : memberStatus === "awaiting_review"
        ? "awaiting_checkpoint"
        : memberStatus === "rejected"
          ? "redo_required"
          : memberStatus && [
              "queued", "running", "blocked", "completed", "skipped", "failed", "redo_required"
            ].includes(memberStatus)
            ? memberStatus as StepStatus
            : state.assignment_status === "planned"
              ? "pending"
              : state.assignment_status === "queued"
                ? "queued"
                : state.assignment_status === "on_hold"
                  ? "blocked"
                  : state.assignment_status === "in_progress"
                    ? "running"
                    : null;

    const waferState: ProcessDashboardWaferState = {
      assignmentId: state.assignment_id,
      assignmentStatus: state.assignment_status,
      waferId: state.wafer_id,
      waferCode: state.wafer_code,
      projectId: state.project_id,
      dieLabel: state.die_label ?? extractDieLabel(metadata),
      currentStepId: state.current_step_id,
      currentStepExecutionId: state.legacy_step_execution_id,
      latestStepAttemptId: state.latest_attempt_id,
      latestStepAttemptSubmittedById: state.latest_attempt_submitted_by,
      latestStepAttemptNotes: state.latest_attempt_notes,
      currentStepName: state.current_step_name,
      currentStepOrder: state.current_step_order,
      currentStepStatus,
      currentStepArea: step?.process_area ?? null,
      currentToolId: state.current_tool_id,
      nextStepName: state.next_step_name,
      currentHandlerName: state.current_handler_name,
      requiredReviewerId: state.required_reviewer_id,
      requiredReviewerName: state.required_reviewer_name,
      canUndoHistory: Boolean(state.latest_attempt_id || state.checkpoint_route_source_step_id),
      historyCorrectionCount: historyCorrectionCountByAssignment.get(state.assignment_id) ?? 0,
      canCorrectCheckpointRoute: state.can_correct_checkpoint_route,
      checkpointRouteSourceStepId: state.checkpoint_route_source_step_id,
      anytimeReturnStepId: state.anytime_return_step_id,
      anytimeReturnStepName: state.anytime_return_step_id
        ? stepById.get(state.anytime_return_step_id)?.name ?? null
        : null,
      dieDescriptions: extractDieDescriptions(metadata),
      diePolingParameters: extractDiePolingParameters(metadata)
    };
    workspaceWaferStates.push(waferState);
    if (activeStatuses.has(state.assignment_status)) activeWaferStates.push(waferState);
  }

  if (!includeCalendar || calendarDays < 1) {
    return { process, workspaceWaferStates, activeWaferStates, calendarDays: [] };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const toDate = new Date(today);
  toDate.setDate(today.getDate() + calendarDays);
  const { data: calendarRows, error: calendarError } = await supabase
    .from("vw_process_calendar_state")
    .select("*")
    .eq("process_template_id", processTemplateId)
    .lt("starts_at", toDate.toISOString())
    .gte("ends_at", today.toISOString())
    .order("starts_at", { ascending: true });
  if (calendarError) throw calendarError;

  const daysByIso = new Map(createEmptyCalendarDays(today, calendarDays).map((day) => [day.isoDate, day]));
  for (const row of calendarRows ?? []) {
    if (typeof row.starts_at !== "string" || typeof row.id !== "string") continue;
    const startsAt = new Date(row.starts_at);
    const day = daysByIso.get(toDayIso(startsAt));
    if (!day) continue;
    day.events.push({
      id: row.id,
      source: "planned_step",
      time: formatTime(startsAt),
      timeValue: startsAt.getTime(),
      title: typeof row.action_name === "string" ? row.action_name : "Scheduled work",
      subtitle: row.source_kind === "manual_event" ? "Manual action" : "Shared plan",
      location: typeof row.location === "string" ? row.location : "Location pending"
    });
  }

  return {
    process,
    workspaceWaferStates,
    activeWaferStates,
    calendarDays: Array.from(daysByIso.values()).map((day) => ({
      ...day,
      events: day.events.sort((left, right) => left.timeValue - right.timeValue)
    }))
  };
}
