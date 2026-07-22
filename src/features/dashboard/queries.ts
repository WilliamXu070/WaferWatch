import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isDicedParentWafer } from "@/features/process-flows/waferVisibility";
import type {
  BatchProcessHistoryItem,
  BatchProcessHistorySample,
  BatchProcessHistoryStatus,
  DashboardModel
} from "@/ui/waferwatch-wireframe/types";
import type {
  BatchRunStateView,
  FabricationStatus,
  Json,
  OperationRunHistoryView,
  ProcessCurrentStateView
} from "@/types/database";

type DashboardQueryClient = Pick<
  Awaited<ReturnType<typeof createServerSupabaseClient>>,
  "from"
>;

type PlanActualRow = Record<string, Json | undefined> & {
  planned_operation_id: string;
  process_step_id: string;
  process_step_name: string;
  scheduled_start_at: string;
  planned_status: string;
  batch_name: string | null;
  batch_members: Json;
  actual_run_count: number;
};

type CalendarStateRow = Record<string, Json | undefined> & {
  id: string;
  starts_at: string;
};

type StageProgressRow = {
  completedSteps: number;
  totalSteps: number;
};

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
  plannedBatches: [],
  reviewQueue: [],
  batchHistory: []
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function makeEmptyDashboardModel(): DashboardModel {
  return {
    ...EMPTY_DASHBOARD_MODEL,
    activity: {
      ...EMPTY_DASHBOARD_MODEL.activity,
      bars: buildActivity([], []).bars
    },
    stats: EMPTY_DASHBOARD_MODEL.stats.map((stat) => ({ ...stat })),
    plannedBatches: [],
    reviewQueue: [],
    batchHistory: []
  };
}

export function getEmptyWireframeDashboardModel(): DashboardModel {
  return makeEmptyDashboardModel();
}

async function resolveDashboardProcessTemplateId(
  supabase: DashboardQueryClient,
  requestedProcessTemplateId?: string
) {
  if (requestedProcessTemplateId) return requestedProcessTemplateId;

  const { data, error } = await supabase
    .from("process_templates")
    .select("id")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

function buildActivity(
  history: readonly OperationRunHistoryView[],
  calendarRows: readonly CalendarStateRow[]
): DashboardModel["activity"] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 5 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (4 - index));
    return day;
  });
  const actualByDay = new Map(days.map((day) => [dateKey(day), 0]));
  const plannedByDay = new Map(days.map((day) => [dateKey(day), 0]));

  for (const member of history) {
    const occurredAt = parseDate(
      typeof member.completed_at === "string"
        ? member.completed_at
        : typeof member.started_at === "string"
          ? member.started_at
          : member.created_at
    );
    if (!occurredAt) continue;
    const key = dateKey(occurredAt);
    if (actualByDay.has(key)) actualByDay.set(key, (actualByDay.get(key) ?? 0) + 1);
  }

  for (const row of calendarRows) {
    const start = parseDate(row.starts_at);
    if (!start) continue;
    const key = dateKey(start);
    if (plannedByDay.has(key)) plannedByDay.set(key, (plannedByDay.get(key) ?? 0) + 1);
  }

  return {
    title: "Process activity",
    max: 30,
    bars: days.map((day) => ({
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      value: actualByDay.get(dateKey(day)) ?? 0,
      compareValue: plannedByDay.get(dateKey(day)) ?? 0
    }))
  };
}

function parseStageProgress(value: Json): StageProgressRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const completedSteps = Number(candidate.completedSteps);
    const totalSteps = Number(candidate.totalSteps);
    return Number.isFinite(completedSteps) && Number.isFinite(totalSteps)
      ? [{ completedSteps, totalSteps }]
      : [];
  });
}

function buildProgress(rows: readonly ProcessCurrentStateView[]): DashboardModel["progress"] {
  let completed = 0;
  let total = 0;
  for (const row of rows) {
    for (const stage of parseStageProgress(row.stage_progress)) {
      completed += stage.completedSteps;
      total += stage.totalSteps;
    }
  }
  const blocked = rows.filter((row) =>
    row.current_member_status === "blocked" || row.current_member_status === "failed"
  ).length;

  return {
    title: "Step progress",
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    caption: total === 0 ? "No step data" : blocked > 0 ? "Needs attention" : completed === total ? "Complete" : "In progress",
    footer: `${completed}/${total} steps complete`
  };
}

function sampleStatus(status: string): BatchProcessHistorySample["status"] {
  if (["completed", "approved", "skipped"].includes(status)) return "approved";
  if (["redo_required", "rejected", "failed"].includes(status)) return "redo";
  if (status === "cancelled") return "withdrawn";
  return "awaiting_review";
}

function batchStatus(row: BatchRunStateView): BatchProcessHistoryStatus {
  if (row.member_status === "mixed") return "mixed";
  if (row.run_status === "completed") return "approved";
  if (row.run_status === "redo_required" || row.run_status === "failed") return "redo";
  if (row.run_status === "cancelled") return "withdrawn";
  return "awaiting_review";
}

function parseMembers(value: Json): BatchProcessHistorySample[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const memberId = typeof candidate.memberId === "string" ? candidate.memberId : null;
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    const status = typeof candidate.status === "string" ? candidate.status : "queued";
    return memberId && label
      ? [{ attemptId: memberId, label, status: sampleStatus(status) }]
      : [];
  });
}

function mapBatchRun(row: BatchRunStateView): BatchProcessHistoryItem {
  const startedAt = typeof row.started_at === "string" ? row.started_at : null;
  const completedAt = typeof row.completed_at === "string" ? row.completed_at : null;
  return {
    id: row.operation_run_id,
    batchId: row.operation_run_id,
    processStepId: row.process_step_id,
    processName: typeof row.process_step_name === "string" ? row.process_step_name : "Unnamed process",
    submittedAt: completedAt ?? startedAt ?? row.created_at,
    operatorName: "Batch operation",
    note: null,
    status: batchStatus(row),
    samples: parseMembers(row.members)
  };
}

function parsePlanMembers(value: Json): BatchProcessHistorySample[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const assignmentId = typeof candidate.assignmentId === "string" ? candidate.assignmentId : null;
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    return assignmentId && label
      ? [{ attemptId: assignmentId, label, status: "awaiting_review" as const }]
      : [];
  });
}

function mapPlannedOperation(row: PlanActualRow): BatchProcessHistoryItem {
  return {
    id: row.planned_operation_id,
    batchId: row.planned_operation_id,
    processStepId: row.process_step_id,
    processName: row.process_step_name || "Unnamed process",
    submittedAt: row.scheduled_start_at,
    operatorName: "Planned",
    note: row.batch_name,
    status: "planned",
    samples: parsePlanMembers(row.batch_members),
    scheduledStartAt: row.scheduled_start_at,
    location: null
  };
}

export async function getWireframeDashboardModel(
  supabase: DashboardQueryClient,
  processTemplateId?: string
): Promise<DashboardModel> {
  const templateId = await resolveDashboardProcessTemplateId(supabase, processTemplateId);
  if (!templateId) return makeEmptyDashboardModel();

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 4);
  const end = new Date(start);
  end.setDate(end.getDate() + 5);

  const [currentResult, planResult, batchResult, historyResult, calendarResult] = await Promise.all([
    supabase
      .from("vw_process_current_state")
      .select("*")
      .eq("template_id", templateId)
      .is("archived_at", null),
    supabase
      .from("vw_plan_actual_state")
      .select("*")
      .eq("template_id", templateId)
      .eq("is_shared_draft", true)
      .order("scheduled_start_at", { ascending: true })
      .limit(100),
    supabase
      .from("vw_batch_run_state")
      .select("*")
      .eq("template_id", templateId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("vw_operation_run_history")
      .select("*")
      .eq("template_id", templateId)
      .gte("created_at", start.toISOString())
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("vw_process_calendar_state")
      .select("id, starts_at")
      .eq("process_template_id", templateId)
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at", { ascending: true })
      .limit(500)
  ]);

  const firstError = [currentResult.error, planResult.error, batchResult.error, historyResult.error, calendarResult.error]
    .find(Boolean);
  if (firstError) throw firstError;

  const currentRows = ((currentResult.data ?? []) as ProcessCurrentStateView[]).filter(
    (row) => !isDicedParentWafer(row.wafer_metadata)
  );
  const batchRows = (batchResult.data ?? []) as BatchRunStateView[];
  const historyRows = (historyResult.data ?? []) as OperationRunHistoryView[];
  const calendarRows = (calendarResult.data ?? []) as CalendarStateRow[];
  const planRows = (planResult.data ?? []) as PlanActualRow[];
  const plannedBatches = planRows
    .filter((row) => Number(row.actual_run_count) === 0 && parsePlanMembers(row.batch_members).length > 0)
    .map(mapPlannedOperation);
  const mappedBatches = batchRows.map(mapBatchRun);
  const reviewQueue = mappedBatches.filter((row) => row.status === "awaiting_review" || row.status === "mixed");
  const batchHistory = mappedBatches
    .filter((row) => !reviewQueue.some((candidate) => candidate.id === row.id))
    .slice(0, 30);

  if (currentRows.length === 0 && plannedBatches.length === 0 && mappedBatches.length === 0) {
    return makeEmptyDashboardModel();
  }

  const activeAssignments = currentRows.filter((row) => ACTIVE_ASSIGNMENT_STATUSES.includes(row.assignment_status));
  const blockedFailedCount = currentRows.filter((row) =>
    row.current_member_status === "blocked" || row.current_member_status === "failed"
  ).length;
  const processQuery = `?processId=${encodeURIComponent(templateId)}`;

  return {
    activity: buildActivity(historyRows, calendarRows),
    progress: buildProgress(currentRows),
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
    plannedBatches,
    reviewQueue,
    batchHistory
  };
}
