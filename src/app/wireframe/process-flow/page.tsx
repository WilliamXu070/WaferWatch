import { moveWaferToProcessStep } from "@/features/runs/actions";
import {
  createProcessFlowStep,
  createProcessStepTransition,
  deleteProcessSteps,
  updateProcessStepName,
  updateProcessStepNodeType,
  updateProcessStepPositions
} from "@/features/process-flows/actions";
import {
  getFirstActiveProcessTemplateId,
  getProcessDashboardData,
  type ProcessDashboardData
} from "@/features/process-flows/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProcessFlowView } from "@/ui/waferwatch-wireframe";
import type { FlowStatModel } from "@/ui/waferwatch-wireframe/types";
import type { ProcessStepNodeType, ProcessStepTransitionType, StepStatus } from "@/types/database";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Process flow wireframe"
};

type ProcessFlowSearchParams = {
  processId?: string | string[];
};

type DiagramStep = {
  id: string;
  name: string;
  process_area: string;
  step_order: number;
  node_type: ProcessStepNodeType;
  canvas_x: number | null;
  canvas_y: number | null;
  wafers: {
    assignmentId: string;
    waferCode: string;
    dieLabel: string | null;
    currentStepStatus: StepStatus | null;
  }[];
};

type DiagramTransition = {
  id: string;
  from_step_id: string;
  to_step_id: string;
  edge_type: ProcessStepTransitionType;
  label: string | null;
  priority: number;
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toFlowColumns(data: ProcessDashboardData): DiagramStep[] {
  return [...data.process.process_steps]
    .sort((a, b) => a.step_order - b.step_order)
    .map((step) => ({
      id: step.id,
      name: step.name,
      process_area: step.process_area,
      step_order: step.step_order,
      node_type: step.node_type,
      canvas_x: step.canvas_x,
      canvas_y: step.canvas_y,
      wafers: data.activeWaferStates
        .filter((state) => state.currentStepId === step.id)
        .map((state) => ({
          assignmentId: state.assignmentId,
          waferCode: state.waferCode,
          dieLabel: state.dieLabel,
          currentStepStatus: state.currentStepStatus
        }))
    }));
}

function toFlowTransitions(data: ProcessDashboardData | null): DiagramTransition[] {
  return (data?.process.process_step_transitions ?? []).map((transition) => ({
    id: transition.id,
    from_step_id: transition.from_step_id,
    to_step_id: transition.to_step_id,
    edge_type: transition.edge_type,
    label: transition.label,
    priority: transition.priority
  }));
}

function countStatuses(columns: DiagramStep[], statuses: readonly StepStatus[]) {
  return columns.reduce(
    (total, column) =>
      total + column.wafers.filter((wafer) => wafer.currentStepStatus && statuses.includes(wafer.currentStepStatus)).length,
    0
  );
}

function toFlowStats(data: ProcessDashboardData | null, columns: DiagramStep[]): FlowStatModel[] {
  const activeWaferCount = new Set(columns.flatMap((column) => column.wafers.map((wafer) => wafer.assignmentId))).size;
  const activeStepCount = columns.filter((column) => column.wafers.length > 0).length;
  const runningCount = countStatuses(columns, ["running"]);
  const blockedCount = countStatuses(columns, ["blocked", "failed"]);
  const queuedCount = countStatuses(columns, ["queued", "pending"]);
  const totalCalendarEvents = data?.calendarDays.reduce((total, day) => total + day.events.length, 0) ?? 0;

  return [
    {
      id: "total-steps",
      icon: "total",
      label: "Steps",
      value: String(columns.length),
      caption: data ? data.process.name : "No process loaded"
    },
    {
      id: "active-wafers",
      icon: "stack",
      label: "Active wafers",
      value: String(activeWaferCount),
      caption: "From assignments"
    },
    {
      id: "active-steps",
      icon: "target",
      label: "Active steps",
      value: String(activeStepCount),
      caption: `${columns.length} backend steps`
    },
    {
      id: "running",
      icon: "handoff",
      label: "Running",
      value: String(runningCount),
      caption: "Step executions"
    },
    {
      id: "blocked",
      icon: "warning",
      label: "Blocked",
      value: String(blockedCount),
      caption: "Blocked or failed"
    },
    {
      id: "scheduled",
      icon: "check",
      label: "Scheduled",
      value: String(totalCalendarEvents || queuedCount),
      caption: totalCalendarEvents ? "Calendar events" : "Queued or pending"
    }
  ];
}

async function loadProcessFlowData(requestedProcessId: string | undefined) {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return null;
  }

  const processId = requestedProcessId ?? await getFirstActiveProcessTemplateId();
  if (!processId) {
    return null;
  }

  return getProcessDashboardData(processId, 14, false).catch(() => null);
}

export default async function ProcessFlowWireframePage({
  searchParams
}: {
  searchParams: Promise<ProcessFlowSearchParams>;
}) {
  const requestedProcessId = firstSearchValue((await searchParams).processId);
  const dashboardData = await loadProcessFlowData(requestedProcessId);
  const flowColumns = dashboardData ? toFlowColumns(dashboardData) : [];
  const flowTransitions = toFlowTransitions(dashboardData);
  const processLabel = dashboardData
    ? `${dashboardData.process.name}${dashboardData.process.version ? ` · ${dashboardData.process.version}` : ""}`
    : "No active process";
  const statusLabel = dashboardData
    ? `${dashboardData.activeWaferStates.length} active wafer${dashboardData.activeWaferStates.length === 1 ? "" : "s"} loaded from Supabase`
    : "No authenticated process template or wafer assignment data is available.";

  return (
    <ProcessFlowView
      processLabel={processLabel}
      statusLabel={statusLabel}
      emptyTitle={flowColumns.length === 0 ? "No process flow data" : undefined}
      emptyDescription={
        flowColumns.length === 0
          ? "Sign in with access to an active process template, or assign wafers to a process. No wireframe fallback data is injected."
          : undefined
      }
      steps={flowColumns}
      transitions={flowTransitions}
      stats={toFlowStats(dashboardData, flowColumns)}
      processTemplateId={dashboardData?.process.id}
      onCreateStep={createProcessFlowStep}
      onUpdateStepPositions={updateProcessStepPositions}
      onUpdateStepName={updateProcessStepName}
      onUpdateStepNodeType={updateProcessStepNodeType}
      onCreateTransition={createProcessStepTransition}
      onDeleteSteps={deleteProcessSteps}
      onMoveWafer={moveWaferToProcessStep}
    />
  );
}
