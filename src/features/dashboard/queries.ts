import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  DashboardModel,
  WaferCardModel,
  WorkflowColumnModel,
  WorkflowStageId
} from "@/ui/waferwatch-wireframe/types";
import type {
  FabricationStatus,
  Json,
  ProcessCalendarEvent,
  ProcessStep,
  ProcessTemplate,
  StepExecution,
  StepStatus,
  Wafer,
  WaferProcessAssignment
} from "@/types/database";

type DashboardStep = {
  id: string;
  template_id: string;
  name: string;
  step_order: number;
  process_area: string;
  expected_duration_minutes: number | null;
};

type DashboardTemplate = {
  id: string;
  name: string;
  version: string;
  description: string | null;
  process_steps: DashboardStep[];
};

type WireframeTemplate = Pick<ProcessTemplate, "id" | "name" | "version" | "is_active">;

type WireframeStep = Pick<
  ProcessStep,
  "id" | "template_id" | "name" | "step_order" | "process_area" | "node_type"
>;

type WireframeTransition = {
  template_id: string;
  from_step_id: string;
  to_step_id: string;
  edge_type: string;
  priority: number;
  created_at: string;
};

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

type WireframeWafer = Pick<Wafer, "id" | "wafer_code" | "project_id" | "metadata">;

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

type WireframeProfile = {
  id: string;
  display_name: string | null;
  email: string;
};

type WireframeDashboardQueryClient = Pick<ReturnType<typeof createSupabaseAdminClient>, "from">;

export async function getDashboardSnapshot() {
  const supabase = createSupabaseAdminClient();

  const [
    templates,
    steps,
    tools,
    projects,
    wafers,
    activeSteps,
    storageBuckets
  ] = await Promise.all([
    supabase
      .from("process_templates")
      .select("id, name, version, description")
      .order("name", { ascending: true }),
    supabase
      .from("process_steps")
      .select("id, template_id, name, step_order, process_area, expected_duration_minutes")
      .order("step_order", { ascending: true }),
    supabase
      .from("fabrication_tools")
      .select("id, name, tool_type, location, status")
      .order("name", { ascending: true }),
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("wafers").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase
      .from("step_executions")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "running", "blocked"]),
    supabase.storage.listBuckets()
  ]);

  const templatesWithSteps: DashboardTemplate[] =
    templates.data?.map((template) => ({
      ...template,
      process_steps: (steps.data ?? []).filter((step) => step.template_id === template.id)
    })) ?? [];

  return {
    templates: templatesWithSteps,
    tools: tools.data ?? [],
    counts: {
      projects: projects.count ?? 0,
      wafers: wafers.count ?? 0,
      activeSteps: activeSteps.count ?? 0,
      storageBuckets:
        storageBuckets.data?.filter((bucket) => bucket.name.startsWith("wafer-")).length ?? 0
    },
    errors: [
      templates.error?.message,
      steps.error?.message,
      tools.error?.message,
      projects.error?.message,
      wafers.error?.message,
      activeSteps.error?.message,
      storageBuckets.error?.message
    ].filter((message): message is string => Boolean(message))
  };
}

const WORKFLOW_COLUMNS: readonly { id: WorkflowStageId; title: string }[] = [
  { id: "queued", title: "Queued" },
  { id: "poling", title: "Poling" },
  { id: "inspection", title: "Inspection" },
  { id: "complete", title: "Complete" }
];

const ACTIVE_ASSIGNMENT_STATUSES: readonly FabricationStatus[] = [
  "planned",
  "queued",
  "in_progress",
  "on_hold"
];

const ACTIVE_STEP_STATUSES: readonly StepStatus[] = [
  "running",
  "blocked",
  "failed",
  "queued",
  "pending"
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
  columns: WORKFLOW_COLUMNS.map((column) => ({
    ...column,
    count: 0,
    cards: []
  }))
};

function isMissingCalendarTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PGRST205"
  );
}

function extractDieLabel(metadata: Json): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "Unassigned";
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
              : null;

  return candidate?.trim() || "Unassigned";
}

function isDicedParent(metadata: Json) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  return (
    (Array.isArray(metadata.diced_child_wafer_ids) && metadata.diced_child_wafer_ids.length > 0) ||
    (Array.isArray(metadata.diced_child_die_labels) && metadata.diced_child_die_labels.length > 0)
  );
}

function stepStatusRank(status: StepStatus) {
  if (status === "running") return 0;
  if (status === "blocked") return 1;
  if (status === "failed") return 2;
  if (status === "queued") return 3;
  if (status === "pending") return 4;
  if (status === "completed") return 5;
  if (status === "skipped") return 6;
  return 9;
}

function pickCurrentExecution(
  executions: readonly WireframeExecution[],
  stepOrderById: ReadonlyMap<string, number>
) {
  const activeExecution = executions
    .filter((execution) => ACTIVE_STEP_STATUSES.includes(execution.status))
    .sort((a, b) => {
      const statusDiff = stepStatusRank(a.status) - stepStatusRank(b.status);
      if (statusDiff !== 0) return statusDiff;

      const orderA = stepOrderById.get(a.process_step_id) ?? Number.MAX_SAFE_INTEGER;
      const orderB = stepOrderById.get(b.process_step_id) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;

      return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    })[0];

  if (activeExecution) {
    return activeExecution;
  }

  return executions
    .filter((execution) => execution.status === "completed" || execution.status === "skipped")
    .sort((a, b) => {
      const orderA = stepOrderById.get(a.process_step_id) ?? Number.MIN_SAFE_INTEGER;
      const orderB = stepOrderById.get(b.process_step_id) ?? Number.MIN_SAFE_INTEGER;
      if (orderA !== orderB) return orderB - orderA;

      return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    })[0];
}

function getNextStep(
  templateSteps: readonly WireframeStep[],
  currentStep: WireframeStep | undefined,
  nextStepIdByStepId: ReadonlyMap<string, string>
) {
  if (!currentStep) {
    return (
      templateSteps.find((step) => step.node_type === "start") ??
      templateSteps.slice().sort((a, b) => a.step_order - b.step_order)[0]
    );
  }

  const nextStepId = nextStepIdByStepId.get(currentStep.id);
  return nextStepId ? templateSteps.find((step) => step.id === nextStepId) : undefined;
}

function workflowStageFor(
  assignment: WireframeAssignment,
  currentExecution: WireframeExecution | undefined,
  currentStep: WireframeStep | undefined,
  nextStep: WireframeStep | undefined
): WorkflowStageId {
  if (
    assignment.status === "completed" ||
    assignment.status === "scrapped" ||
    ((currentExecution?.status === "completed" || currentExecution?.status === "skipped") && !nextStep)
  ) {
    return "complete";
  }

  const stepText = `${currentStep?.process_area ?? ""} ${currentStep?.name ?? ""}`.toLowerCase();

  if (
    currentExecution?.status === "blocked" ||
    currentExecution?.status === "failed" ||
    stepText.includes("inspect") ||
    stepText.includes("metrology") ||
    stepText.includes("character")
  ) {
    return "inspection";
  }

  if (
    assignment.status === "in_progress" ||
    assignment.status === "on_hold" ||
    currentExecution?.status === "running"
  ) {
    return "poling";
  }

  return "queued";
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDueLabel(date: Date | null) {
  if (!date) {
    return "No date";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(date);
  due.setHours(0, 0, 0, 0);

  const dayDiff = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Tomorrow";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit"
  });
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

function groupByAssignment(executions: readonly WireframeExecution[]) {
  const grouped = new Map<string, WireframeExecution[]>();

  for (const execution of executions) {
    const existing = grouped.get(execution.assignment_id);
    if (existing) {
      existing.push(execution);
    } else {
      grouped.set(execution.assignment_id, [execution]);
    }
  }

  return grouped;
}

function groupStepsByTemplate(steps: readonly WireframeStep[]) {
  const grouped = new Map<string, WireframeStep[]>();

  for (const step of steps) {
    const existing = grouped.get(step.template_id);
    if (existing) {
      existing.push(step);
    } else {
      grouped.set(step.template_id, [step]);
    }
  }

  for (const templateSteps of grouped.values()) {
    templateSteps.sort((a, b) => a.step_order - b.step_order);
  }

  return grouped;
}

function getCardDueDate(
  assignment: WireframeAssignment,
  execution: WireframeExecution | undefined,
  futureCalendarEvents: readonly WireframeCalendarEvent[]
) {
  const plannedDate = parseDate(execution?.planned_start_at) ?? parseDate(execution?.planned_end_at);

  if (plannedDate) {
    return plannedDate;
  }

  const matchingStepEvent = futureCalendarEvents.find(
    (event) =>
      event.process_template_id === assignment.template_id &&
      event.process_step_id &&
      event.process_step_id === execution?.process_step_id
  );

  if (matchingStepEvent) {
    return parseDate(matchingStepEvent.starts_at);
  }

  const matchingTemplateEvent = futureCalendarEvents.find(
    (event) => event.process_template_id === assignment.template_id
  );

  return parseDate(matchingTemplateEvent?.starts_at);
}

function buildColumns({
  assignments,
  wafersById,
  templatesById,
  stepsById,
  stepsByTemplate,
  transitions,
  executionsByAssignment,
  profileNameById,
  calendarEvents
}: {
  assignments: readonly WireframeAssignment[];
  wafersById: ReadonlyMap<string, WireframeWafer>;
  templatesById: ReadonlyMap<string, WireframeTemplate>;
  stepsById: ReadonlyMap<string, WireframeStep>;
  stepsByTemplate: ReadonlyMap<string, readonly WireframeStep[]>;
  transitions: readonly WireframeTransition[];
  executionsByAssignment: ReadonlyMap<string, readonly WireframeExecution[]>;
  profileNameById: ReadonlyMap<string, string>;
  calendarEvents: readonly WireframeCalendarEvent[];
}): readonly WorkflowColumnModel[] {
  const columns = new Map<WorkflowStageId, WaferCardModel[]>(
    WORKFLOW_COLUMNS.map((column) => [column.id, []])
  );
  const futureCalendarEvents = calendarEvents
    .filter((event) => {
      const startsAt = parseDate(event.starts_at);
      return startsAt ? startsAt.getTime() >= Date.now() : false;
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));

  const stepOrderById = new Map(
    Array.from(stepsById.values()).map((step) => [step.id, step.step_order])
  );
  const nextStepIdByStepId = new Map<string, string>();
  for (const transition of transitions
    .filter((candidate) => candidate.edge_type === "flow")
    .slice()
    .sort((a, b) => a.priority - b.priority || Date.parse(a.created_at) - Date.parse(b.created_at))) {
    if (!nextStepIdByStepId.has(transition.from_step_id)) {
      nextStepIdByStepId.set(transition.from_step_id, transition.to_step_id);
    }
  }

  const sortedAssignments = assignments
    .slice()
    .sort((a, b) => Date.parse(b.assigned_at) - Date.parse(a.assigned_at));

  for (const assignment of sortedAssignments) {
    const wafer = wafersById.get(assignment.wafer_id);
    if (!wafer) {
      continue;
    }

    const assignmentExecutions = executionsByAssignment.get(assignment.id) ?? [];
    const inferredExecution = pickCurrentExecution(assignmentExecutions, stepOrderById);
    const currentStepId = assignment.current_step_id ?? inferredExecution?.process_step_id;
    const currentExecution = currentStepId
      ? assignmentExecutions
          .filter((execution) => execution.process_step_id === currentStepId)
          .slice()
          .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0] ?? inferredExecution
      : inferredExecution;
    const currentStep = currentStepId ? stepsById.get(currentStepId) : undefined;
    const templateSteps = stepsByTemplate.get(assignment.template_id) ?? [];
    const nextStep = getNextStep(templateSteps, currentStep, nextStepIdByStepId);
    const stage = workflowStageFor(assignment, currentExecution, currentStep, nextStep);
    const template = templatesById.get(assignment.template_id);
    const handlerId =
      currentExecution?.operator_id ??
      currentExecution?.completed_by ??
      assignment.assigned_by;
    const currentStepLabel = currentStep?.name ?? "No step execution";
    const nextStepLabel = nextStep ? `Next step: ${nextStep.name}.` : "No next step.";
    const templateLabel = template ? `${template.name} ${template.version}` : "Unassigned process";
    const executionCount = assignmentExecutions.length;

    columns.get(stage)?.push({
      id: assignment.id,
      waferCode: wafer.wafer_code,
      dieLabel: extractDieLabel(wafer.metadata as Json),
      description: `${currentStepLabel}. ${nextStepLabel} ${templateLabel}.`,
      status: currentExecution?.status ?? "pending",
      dueLabel: formatDueLabel(getCardDueDate(assignment, currentExecution, futureCalendarEvents)),
      activityLabel: `${executionCount} step${executionCount === 1 ? "" : "s"}`,
      handler: handlerId ? profileNameById.get(handlerId) : undefined
    });
  }

  const firstRunningCard = Array.from(columns.values())
    .flat()
    .find((card) => card.status === "running" || card.status === "blocked");

  if (firstRunningCard) {
    firstRunningCard.isSelected = true;
  }

  return WORKFLOW_COLUMNS.map((column) => {
    const cards = columns.get(column.id) ?? [];
    return {
      ...column,
      count: cards.length,
      cards
    };
  });
}

function makeEmptyDashboardModel(): DashboardModel {
  return {
    ...EMPTY_DASHBOARD_MODEL,
    activity: {
      ...EMPTY_DASHBOARD_MODEL.activity,
      bars: buildActivity([], []).bars
    },
    stats: EMPTY_DASHBOARD_MODEL.stats.map((stat) => ({ ...stat })),
    columns: EMPTY_DASHBOARD_MODEL.columns.map((column) => ({ ...column, cards: [] }))
  };
}

export function getEmptyWireframeDashboardModel(): DashboardModel {
  return makeEmptyDashboardModel();
}

export async function getWireframeDashboardModel(
  supabase: WireframeDashboardQueryClient = createSupabaseAdminClient(),
  processTemplateId?: string
): Promise<DashboardModel> {
  const templatesQuery = supabase
    .from("process_templates")
    .select("id, name, version, is_active")
    .order("name", { ascending: true });
  const stepsQuery = supabase
    .from("process_steps")
    .select("id, template_id, name, step_order, process_area, node_type")
    .order("step_order", { ascending: true });
  const transitionsQuery = supabase
    .from("process_step_transitions")
    .select("template_id, from_step_id, to_step_id, edge_type, priority, created_at")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });
  const assignmentsQuery = supabase
    .from("wafer_process_assignments")
    .select("id, wafer_id, template_id, assigned_by, status, assigned_at, started_at, completed_at, current_step_id")
    .is("deleted_at", null)
    .order("assigned_at", { ascending: false });
  const calendarEventsQuery = supabase
    .from("process_calendar_events")
    .select("id, process_template_id, starts_at, ends_at, process_step_id, process_step_name_snapshot, manual_action, description")
    .order("starts_at", { ascending: true });

  if (processTemplateId) {
    templatesQuery.eq("id", processTemplateId);
    stepsQuery.eq("template_id", processTemplateId);
    transitionsQuery.eq("template_id", processTemplateId);
    assignmentsQuery.eq("template_id", processTemplateId);
    calendarEventsQuery.eq("process_template_id", processTemplateId);
  }

  const [
    templatesResult,
    stepsResult,
    transitionsResult,
    assignmentsResult,
    wafersResult,
    executionsResult,
    calendarEventsResult
  ] = await Promise.all([
    templatesQuery,
    stepsQuery,
    transitionsQuery,
    assignmentsQuery,
    supabase
      .from("wafers")
      .select("id, wafer_code, project_id, metadata")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("step_executions")
      .select(
        "id, assignment_id, process_step_id, status, planned_start_at, planned_end_at, started_at, completed_at, operator_id, completed_by, created_at, updated_at"
      )
      .order("updated_at", { ascending: false }),
    calendarEventsQuery
  ]);

  const queryErrors = [
    templatesResult.error,
    stepsResult.error,
    transitionsResult.error,
    assignmentsResult.error,
    wafersResult.error,
    executionsResult.error
  ].filter((error): error is NonNullable<typeof templatesResult.error> => Boolean(error));

  if (queryErrors[0]) {
    throw queryErrors[0];
  }

  if (calendarEventsResult.error && !isMissingCalendarTableError(calendarEventsResult.error)) {
    throw calendarEventsResult.error;
  }

  const allTemplates = (templatesResult.data ?? []) as WireframeTemplate[];
  const allSteps = (stepsResult.data ?? []) as WireframeStep[];
  const allTransitions = (transitionsResult.data ?? []) as WireframeTransition[];
  const allAssignments = (assignmentsResult.data ?? []) as WireframeAssignment[];
  const allWafers = (wafersResult.data ?? []) as WireframeWafer[];
  const allExecutions = (executionsResult.data ?? []) as WireframeExecution[];
  const allCalendarEvents = (calendarEventsResult.data ?? []) as WireframeCalendarEvent[];
  const templates = allTemplates;
  const steps = allSteps;
  const transitions = allTransitions;
  const candidateAssignments = allAssignments;
  const candidateWaferIds = new Set(candidateAssignments.map((assignment) => assignment.wafer_id));
  const wafers = allWafers.filter(
    (wafer) => (!processTemplateId || candidateWaferIds.has(wafer.id)) && !isDicedParent(wafer.metadata as Json)
  );
  const visibleWaferIds = new Set(wafers.map((wafer) => wafer.id));
  const assignments = candidateAssignments.filter((assignment) => visibleWaferIds.has(assignment.wafer_id));
  const assignmentIds = new Set(assignments.map((assignment) => assignment.id));
  const executions = processTemplateId
    ? allExecutions.filter((execution) => assignmentIds.has(execution.assignment_id))
    : allExecutions;
  const calendarEvents = allCalendarEvents;

  if (templates.length === 0 && assignments.length === 0 && wafers.length === 0 && executions.length === 0) {
    return makeEmptyDashboardModel();
  }

  const profileIds = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.assigned_by) profileIds.add(assignment.assigned_by);
  }

  for (const execution of executions) {
    if (execution.operator_id) profileIds.add(execution.operator_id);
    if (execution.completed_by) profileIds.add(execution.completed_by);
  }

  const profilesResult = profileIds.size
    ? await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", Array.from(profileIds))
    : { data: [], error: null };

  if (profilesResult.error) {
    throw profilesResult.error;
  }

  const profileNameById = new Map(
    ((profilesResult.data ?? []) as WireframeProfile[]).map((profile) => [
      profile.id,
      profile.display_name?.trim() || profile.email
    ])
  );

  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const stepsById = new Map(steps.map((step) => [step.id, step]));
  const stepsByTemplate = groupStepsByTemplate(steps);
  const wafersById = new Map(wafers.map((wafer) => [wafer.id, wafer]));
  const executionsByAssignment = groupByAssignment(executions);
  const activeAssignments = assignments.filter((assignment) =>
    ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status)
  );
  const blockedFailedCount = executions.filter(
    (execution) => execution.status === "blocked" || execution.status === "failed"
  ).length;
  const progress = buildProgress(executions);
  const processQuery = processTemplateId
    ? `?processId=${encodeURIComponent(processTemplateId)}`
    : "";

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
    columns: buildColumns({
      assignments,
      wafersById,
      templatesById,
      stepsById,
      stepsByTemplate,
      transitions,
      executionsByAssignment,
      profileNameById,
      calendarEvents
    })
  };
}
