import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isDicedParentWafer } from "@/features/process-flows/waferVisibility";
import {
  DASHBOARD_BATCH_HISTORY_LIMIT,
  mapProcessBatchHistoryRows
} from "@/features/dashboard/batchHistory";
import type { DashboardModel } from "@/ui/waferwatch-wireframe/types";
import type {
  FabricationStatus,
  ProcessBatchHistoryView,
  ProcessCalendarEvent,
  StepExecution,
  Wafer,
  WaferProcessAssignment
} from "@/types/database";

type WireframeAssignment = Pick<
  WaferProcessAssignment,
  "id" | "wafer_id" | "template_id" | "assigned_by" | "status" | "assigned_at" | "started_at" | "completed_at" | "current_step_id"
>;

type WireframeExecution = Pick<
  StepExecution,
  | "id"
  | "assignment_id"
  | "process_step_id"
  | "status"
  | "planned_start_at"
  | "planned_end_at"
  | "started_at"
  | "completed_at"
  | "operator_id"
  | "completed_by"
  | "created_at"
  | "updated_at"
>;

type WireframeWafer = Pick<Wafer, "id" | "metadata">;

type WireframeCalendarEvent = Pick<
  ProcessCalendarEvent,
  | "id"
  | "process_template_id"
  | "starts_at"
  | "ends_at"
  | "process_step_id"
  | "process_step_name_snapshot"
  | "manual_action"
  | "description"
>;

type WireframeDashboardQueryClient = Pick<
  Awaited<ReturnType<typeof createServerSupabaseClient>>,
  "from"
>;

const ACTIVE_ASSIGNMENT_STATUSES: readonly FabricationStatus[] = [
  "planned",
  "queued",
  "in_progress",
  "on_hold"
];

const EMPTY_DASHBOARD_MODEL: DashboardModel = {
  activity: {
    title: "Process activity",
    max: 30,
    bars: [
      { label: "Mon", value: 0, compareValue: 0 },
      { label: "Tue", value: 0, compareValue: 0 },
      { label: "Wed", value: 0, compareValue: 0 },
      { label: "Thu", value: 0, compareValue: 0 },
      { label: "Fri", value: 0, compareValue: 0 }
    ]
  },
  progress: {
    title: "Step progress",
    percent: 0,
    caption: "No step data",
    footer: "0/0 steps complete"
  },
  stats: [
      {
        id: "active-wafers",
        value: "0",
        label: "Active wafers",
        icon: "activity",
        href: "/process-flow"
      },
    {
        id: "blocked-failed",
        value: "0",
        label: "Blocked / failed",
        icon: "warning",
        href: "/process-flow"
    }
  ],
  batchHistory: []
};

function isMissingCalendarTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PGRST205"
  );
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}


function activityDateForExecution(execution: WireframeExecution) {
  return (
    parseDate(execution.completed_at) ??
    parseDate(execution.started_at) ??
    parseDate(execution.planned_start_at) ??
    parseDate(execution.created_at)
  );
}

function buildActivity(
  executions: readonly WireframeExecution[],
  calendarEvents: readonly WireframeCalendarEvent[]
): DashboardModel["activity"] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 5 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (4 - index));
    return day;
  });

  const stepCountsByDay = new Map(days.map((day) => [dateKey(day), 0]));
  const calendarCountsByDay = new Map(days.map((day) => [dateKey(day), 0]));

  for (const execution of executions) {
    const activityDate = activityDateForExecution(execution);
    if (!activityDate) continue;

    const key = dateKey(activityDate);
    const existing = stepCountsByDay.get(key);
    if (existing !== undefined) {
      stepCountsByDay.set(key, existing + 1);
    }
  }

  for (const event of calendarEvents) {
    const startsAt = parseDate(event.starts_at);
    if (!startsAt) continue;

    const key = dateKey(startsAt);
    const existing = calendarCountsByDay.get(key);
    if (existing !== undefined) {
      calendarCountsByDay.set(key, existing + 1);
    }
  }

  return {
    title: "Process activity",
    max: 30,
    bars: days.map((day) => ({
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      value: stepCountsByDay.get(dateKey(day)) ?? 0,
      compareValue: calendarCountsByDay.get(dateKey(day)) ?? 0
    }))
  };
}

function buildProgress(executions: readonly WireframeExecution[]): DashboardModel["progress"] {
  const total = executions.length;
  const completed = executions.filter(
    (execution) => execution.status === "completed" || execution.status === "skipped"
  ).length;
  const blocked = executions.filter(
    (execution) => execution.status === "blocked" || execution.status === "failed"
  ).length;

  return {
    title: "Step progress",
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    caption: total === 0 ? "No step data" : blocked > 0 ? "Needs attention" : completed === total ? "Complete" : "In progress",
    footer: `${completed}/${total} steps complete`
  };
}

function makeEmptyDashboardModel(): DashboardModel {
  return {
    ...EMPTY_DASHBOARD_MODEL,
    activity: {
      ...EMPTY_DASHBOARD_MODEL.activity,
      bars: buildActivity([], []).bars
    },
    stats: EMPTY_DASHBOARD_MODEL.stats.map((stat) => ({ ...stat })),
    batchHistory: []
  };
}

export function getEmptyWireframeDashboardModel(): DashboardModel {
  return makeEmptyDashboardModel();
}

async function resolveDashboardProcessTemplateId(
  supabase: WireframeDashboardQueryClient,
  requestedProcessTemplateId?: string
) {
  if (requestedProcessTemplateId) {
    return requestedProcessTemplateId;
  }

  const { data, error } = await supabase
    .from("process_templates")
    .select("id")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

export async function getWireframeDashboardModel(
  supabase: WireframeDashboardQueryClient,
  processTemplateId?: string
): Promise<DashboardModel> {
  // The dashboard is entered directly after sign-in. Restrict its initial
  // hydration to the selected active process instead of loading every process
  // and historical execution in the workspace.
  const resolvedProcessTemplateId = await resolveDashboardProcessTemplateId(
    supabase,
    processTemplateId
  );

  if (!resolvedProcessTemplateId) {
    return makeEmptyDashboardModel();
  }

  const assignmentsQuery = supabase
    .from("wafer_process_assignments")
    .select("id, wafer_id, template_id, assigned_by, status, assigned_at, started_at, completed_at, current_step_id")
    .eq("template_id", resolvedProcessTemplateId)
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("assigned_at", { ascending: false });
  const calendarEventsQuery = supabase
    .from("process_calendar_events")
    .select("id, process_template_id, starts_at, ends_at, process_step_id, process_step_name_snapshot, manual_action, description")
    .eq("process_template_id", resolvedProcessTemplateId)
    .order("starts_at", { ascending: true });
  const batchHistoryQuery = supabase
    .from("vw_process_batch_history")
    .select(
      "id, batch_id, template_id, process_step_id, process_name, submitted_at, operator_name, note, status, sample_count, samples"
    )
    .eq("template_id", resolvedProcessTemplateId)
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(DASHBOARD_BATCH_HISTORY_LIMIT);

  const [assignmentsResult, calendarEventsResult, batchHistoryResult] = await Promise.all([
    assignmentsQuery,
    calendarEventsQuery,
    batchHistoryQuery
  ]);

  const candidateAssignments = (assignmentsResult.data ?? []) as WireframeAssignment[];
  const assignmentIds = candidateAssignments.map((assignment) => assignment.id);
  const candidateWaferIds = candidateAssignments.map((assignment) => assignment.wafer_id);
  const [wafersResult, executionsResult] = await Promise.all([
    candidateWaferIds.length
      ? supabase
          .from("wafers")
          .select("id, metadata")
          .in("id", candidateWaferIds)
          .is("deleted_at", null)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    assignmentIds.length
      ? supabase
          .from("step_executions")
          .select(
            "id, assignment_id, process_step_id, status, planned_start_at, planned_end_at, started_at, completed_at, operator_id, completed_by, created_at, updated_at"
          )
          .in("assignment_id", assignmentIds)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ]);

  const queryErrors = [
    assignmentsResult.error,
    wafersResult.error,
    executionsResult.error
  ].filter((error): error is NonNullable<typeof assignmentsResult.error> => Boolean(error));

  if (queryErrors[0]) {
    throw queryErrors[0];
  }

  if (calendarEventsResult.error && !isMissingCalendarTableError(calendarEventsResult.error)) {
    throw calendarEventsResult.error;
  }
  if (batchHistoryResult.error && !isMissingCalendarTableError(batchHistoryResult.error)) {
    throw batchHistoryResult.error;
  }

  const allWafers = (wafersResult.data ?? []) as WireframeWafer[];
  const allExecutions = (executionsResult.data ?? []) as WireframeExecution[];
  const allCalendarEvents = (calendarEventsResult.data ?? []) as WireframeCalendarEvent[];
  const batchHistory = mapProcessBatchHistoryRows(
    (batchHistoryResult.data ?? []) as ProcessBatchHistoryView[]
  );
  const candidateWaferIdSet = new Set(candidateWaferIds);
  const wafers = allWafers.filter(
    (wafer) => candidateWaferIdSet.has(wafer.id) && !isDicedParentWafer(wafer.metadata)
  );
  const visibleWaferIds = new Set(wafers.map((wafer) => wafer.id));
  const assignments = candidateAssignments.filter((assignment) => visibleWaferIds.has(assignment.wafer_id));
  const visibleAssignmentIds = new Set(assignments.map((assignment) => assignment.id));
  const executions = allExecutions.filter((execution) => visibleAssignmentIds.has(execution.assignment_id));
  const calendarEvents = allCalendarEvents;

  if (assignments.length === 0 && wafers.length === 0 && executions.length === 0 && batchHistory.length === 0) {
    return makeEmptyDashboardModel();
  }
  const activeAssignments = assignments.filter((assignment) =>
    ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status)
  );
  const blockedFailedCount = executions.filter(
    (execution) => execution.status === "blocked" || execution.status === "failed"
  ).length;
  const progress = buildProgress(executions);
  const processQuery = `?processId=${encodeURIComponent(resolvedProcessTemplateId)}`;

  return {
    activity: buildActivity(executions, calendarEvents),
    progress,
    stats: [
      {
        id: "active-wafers",
        value: String(activeAssignments.length),
        label: "Active wafers",
        icon: "activity",
        href: `/process-flow${processQuery}`
      },
      {
        id: "blocked-failed",
        value: String(blockedFailedCount),
        label: "Blocked / failed",
        icon: "warning",
        href: `/process-flow${processQuery}`
      }
    ],
    batchHistory
  };
}
