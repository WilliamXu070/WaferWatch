import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  Json,
  ProcessStep,
  ProcessTemplate,
  StepExecution,
  StepStatus,
  WaferProcessAssignment
} from "@/types/database";

type DashboardAssignment = Pick<
  WaferProcessAssignment,
  "id" | "wafer_id" | "status" | "assigned_at" | "started_at" | "completed_at"
>;

type DashboardStepExecution = Pick<
  StepExecution,
  "id" | "assignment_id" | "process_step_id" | "status" | "tool_id" | "created_at"
>;

export type ProcessTemplateWithSteps = ProcessTemplate & {
  process_steps: ProcessStep[];
};

type ProcessDashboardWaferState = {
  assignmentId: string;
  assignmentStatus: WaferProcessAssignment["status"];
  waferId: string;
  waferCode: string;
  projectId: string;
  dieLabel: string | null;
  currentStepId: string | null;
  currentStepName: string | null;
  currentStepOrder: number | null;
  currentStepStatus: StepStatus | null;
  currentStepArea: string | null;
  currentToolId: string | null;
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
  calendarDays: ProcessDashboardCalendarDay[];
};

function mapProcessStepsByTemplate(steps: ProcessStep[] | null) {
  const grouped: Record<string, ProcessStep[]> = {};

  for (const step of steps ?? []) {
    const key = step.template_id;
    const existing = grouped[key];
    if (existing) {
      existing.push(step);
    } else {
      grouped[key] = [step];
    }
  }

  return grouped;
}

export async function listProcessTemplates() {
  const supabase = await createServerSupabaseClient();
  const [templatesResult, stepsResult] = await Promise.all([
    supabase
      .from("process_templates")
      .select("*")
      .order("name", { ascending: true }),
    supabase.from("process_steps").select("*").order("step_order", { ascending: true })
  ]);

  if (templatesResult.error) {
    throw templatesResult.error;
  }

  if (stepsResult.error) {
    throw stepsResult.error;
  }

  const stepsByTemplate = mapProcessStepsByTemplate(stepsResult.data);

  return (templatesResult.data ?? []).map((processTemplate) => ({
    ...processTemplate,
    process_steps: stepsByTemplate[processTemplate.id] ?? []
  }));
}

export async function getProcessTemplate(templateId: string) {
  const supabase = await createServerSupabaseClient();
  const [templateResult, stepsResult] = await Promise.all([
    supabase
      .from("process_templates")
      .select("*")
      .eq("id", templateId)
      .single(),
    supabase
      .from("process_steps")
      .select("*")
      .eq("template_id", templateId)
      .order("step_order", {
        ascending: true
      })
  ]);

  if (templateResult.error) {
    throw templateResult.error;
  }

  if (stepsResult.error) {
    throw stepsResult.error;
  }

  return {
    ...templateResult.data,
    process_steps: stepsResult.data ?? []
  };
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

function deriveStepStatusRank(status: StepStatus) {
  if (status === "running") return 0;
  if (status === "blocked") return 1;
  if (status === "failed") return 2;
  if (status === "queued") return 3;
  if (status === "pending") return 4;
  return 9;
}

function pickCurrentStepExecution(
  executions: ReadonlyArray<DashboardStepExecution>,
  stepOrderById: Map<string, number>
) {
  const prioritized = executions
    .filter((execution) =>
      ["running", "blocked", "failed", "queued", "pending"].includes(execution.status)
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

export async function getActiveAssignmentForWafer(waferId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("wafer_process_assignments")
    .select("*, process_templates(*)")
    .eq("wafer_id", waferId)
    .in("status", ["planned", "queued", "in_progress", "on_hold"])
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getProcessDashboardData(
  processTemplateId: string,
  calendarDays = 14
): Promise<ProcessDashboardData> {
  const supabase = await createServerSupabaseClient();
  const process = await getProcessTemplate(processTemplateId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const toDate = new Date(today);
  toDate.setDate(today.getDate() + calendarDays - 1);
  toDate.setHours(23, 59, 59, 999);

  const fromIso = today.toISOString();
  const toIso = toDate.toISOString();

  const stepOrderById = new Map(process.process_steps.map((step) => [step.id, step.step_order]));
  const stepNameById = new Map(process.process_steps.map((step) => [step.id, step.name]));
  const stepAreaById = new Map(process.process_steps.map((step) => [step.id, step.process_area]));

  const assignmentsResult = await supabase
    .from("wafer_process_assignments")
    .select("id, wafer_id, status, assigned_at, started_at, completed_at")
    .eq("template_id", processTemplateId)
    .in("status", ["planned", "queued", "in_progress", "on_hold"]);

  if (assignmentsResult.error) {
    throw assignmentsResult.error;
  }

  const assignments: DashboardAssignment[] = assignmentsResult.data ?? [];

  if (!assignments.length) {
    return {
      process,
      activeWaferStates: [],
      calendarDays: createEmptyCalendarDays(today, calendarDays)
    };
  }

  const assignmentIds = assignments.map((assignment) => assignment.id);
  const waferIds = assignments.map((assignment) => assignment.wafer_id);

  const [stepExecutionsResult, wafersResult] = await Promise.all([
    supabase
      .from("step_executions")
      .select("id, assignment_id, process_step_id, status, tool_id, created_at")
      .in("assignment_id", assignmentIds),
    supabase
      .from("wafers")
      .select("id, wafer_code, project_id, metadata")
      .in("id", waferIds)
  ]);

  if (stepExecutionsResult.error) {
    throw stepExecutionsResult.error;
  }

  if (wafersResult.error) {
    throw wafersResult.error;
  }

  const projectIds = Array.from(
    new Set((wafersResult.data ?? []).map((wafer: { project_id: string }) => wafer.project_id))
  );

  const [reservationsResult, plannedStepsResult] = await Promise.all([
    projectIds.length
      ? supabase
          .from("tool_reservations")
          .select("id, starts_at, tool_id, status, notes, project_id")
          .in("project_id", projectIds)
          .gte("starts_at", fromIso)
          .lte("starts_at", toIso)
          .neq("status", "cancelled")
          .order("starts_at", { ascending: true })
      : Promise.resolve({ data: [], error: null } as const),
    supabase
      .from("step_executions")
      .select("id, assignment_id, process_step_id, planned_start_at, tool_id")
      .in("assignment_id", assignmentIds)
      .not("planned_start_at", "is", null)
      .gte("planned_start_at", fromIso)
      .lte("planned_start_at", toIso)
      .order("planned_start_at", { ascending: true })
  ]);

  if (reservationsResult.error) {
    throw reservationsResult.error;
  }

  if (plannedStepsResult.error) {
    throw plannedStepsResult.error;
  }

  const wafersById = new Map(
    (wafersResult.data ?? []).map((wafer: { id: string; wafer_code: string; project_id: string; metadata: unknown }) => [
      wafer.id,
      wafer
    ])
  );

  const assignmentWaferIdById = new Map(assignments.map((assignment) => [assignment.id, assignment.wafer_id]));

  const stepExecutionsByAssignment = new Map<string, DashboardStepExecution[]>();

  for (const execution of stepExecutionsResult.data ?? []) {
    const entry = stepExecutionsByAssignment.get(execution.assignment_id);
    if (entry) {
      entry.push(execution as DashboardStepExecution);
    } else {
      stepExecutionsByAssignment.set(execution.assignment_id, [execution as DashboardStepExecution]);
    }
  }

  const activeWaferStates: ProcessDashboardWaferState[] = [];

  for (const assignment of assignments) {
    const wafer = wafersById.get(assignment.wafer_id);
    if (!wafer) {
      continue;
    }

    const executions = stepExecutionsByAssignment.get(assignment.id) ?? [];
    const currentExecution = pickCurrentStepExecution(executions, stepOrderById);

    activeWaferStates.push({
      assignmentId: assignment.id,
      assignmentStatus: assignment.status,
      waferId: wafer.id,
      waferCode: wafer.wafer_code,
      projectId: wafer.project_id,
      dieLabel: extractDieLabel(wafer.metadata as Json),
      currentStepId: currentExecution?.process_step_id ?? null,
      currentStepName: currentExecution ? stepNameById.get(currentExecution.process_step_id) ?? null : null,
      currentStepOrder: currentExecution
        ? stepOrderById.get(currentExecution.process_step_id) ?? null
        : null,
      currentStepStatus: currentExecution ? currentExecution.status : null,
      currentStepArea: currentExecution ? stepAreaById.get(currentExecution.process_step_id) ?? null : null,
      currentToolId: currentExecution?.tool_id ?? null
    });
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

  const wafersByIdForCalendar = new Map(
    (wafersResult.data ?? []).map((wafer: { id: string; wafer_code: string }) => [wafer.id, wafer.wafer_code])
  );
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
    activeWaferStates,
    calendarDays: sortedCalendarDays
  };
}
