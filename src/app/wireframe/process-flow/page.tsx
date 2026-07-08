import { moveWaferToProcessStep } from "@/features/runs/actions";
import {
  createWaferAtProcessStart,
  createProcessFlowStep,
  createProcessStepTransition,
  deleteProcessFlowWafer,
  deleteProcessSteps,
  deleteProcessStepTransitions,
  updateProcessStepName,
  updateProcessStepNodeType,
  updateProcessStepPositions
} from "@/features/process-flows/actions";
import {
  getProcessDashboardData,
  type ProcessDashboardData
} from "@/features/process-flows/queries";
import { canEditProject, canManageProcessLibrary, getCurrentAccount } from "@/lib/auth/session";
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
  if (!requestedProcessId) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return null;
  }

  return getProcessDashboardData(requestedProcessId, 14, false).catch(() => null);
}

async function getCanEditProcessFlow(data: ProcessDashboardData | null) {
  if (!data) {
    return false;
  }

  const account = await getCurrentAccount();
  if (!account) {
    return false;
  }

  if (data.process.owner_project_id) {
    return canEditProject(data.process.owner_project_id);
  }

  return canManageProcessLibrary(account.profile.role);
}

export default async function ProcessFlowWireframePage({
  searchParams
}: {
  searchParams: Promise<ProcessFlowSearchParams>;
}) {
  const requestedProcessId = firstSearchValue((await searchParams).processId);
  const dashboardData = await loadProcessFlowData(requestedProcessId);
  const canEdit = await getCanEditProcessFlow(dashboardData);
  const flowColumns = dashboardData ? toFlowColumns(dashboardData) : [];
  const flowTransitions = toFlowTransitions(dashboardData);
  const processLabel = dashboardData
    ? `${dashboardData.process.name}${dashboardData.process.version ? ` · ${dashboardData.process.version}` : ""}`
    : requestedProcessId ? "No active process" : "Select a process";
  const statusLabel = dashboardData
    ? undefined
    : requestedProcessId
      ? "No authenticated process template or wafer assignment data is available."
      : "Choose a process from the sidebar, then open Process Flow.";

  return (
    <ProcessFlowView
      processLabel={processLabel}
      statusLabel={statusLabel}
      emptyTitle={flowColumns.length === 0 ? (requestedProcessId ? "No process flow data" : "No process selected") : undefined}
      emptyDescription={
        flowColumns.length === 0
          ? requestedProcessId
            ? "Sign in with access to an active process template, or assign wafers to a process. No wireframe fallback data is injected."
            : "Select a process first. The process flow stays hidden until a process and this sub-view are selected."
          : undefined
      }
      steps={flowColumns}
      transitions={flowTransitions}
      stats={toFlowStats(dashboardData, flowColumns)}
      processTemplateId={dashboardData?.process.id}
      canEdit={canEdit}
      onCreateStep={canEdit ? createProcessFlowStep : undefined}
      onCreateWaferAtProcessStart={canEdit ? createWaferAtProcessStart : undefined}
      onUpdateStepPositions={canEdit ? updateProcessStepPositions : undefined}
      onUpdateStepName={canEdit ? updateProcessStepName : undefined}
      onUpdateStepNodeType={canEdit ? updateProcessStepNodeType : undefined}
      onCreateTransition={canEdit ? createProcessStepTransition : undefined}
      onDeleteSteps={canEdit ? deleteProcessSteps : undefined}
      onDeleteTransitions={canEdit ? deleteProcessStepTransitions : undefined}
      onDeleteWafer={canEdit ? deleteProcessFlowWafer : undefined}
      onMoveWafer={canEdit ? moveWaferToProcessStep : undefined}
    />
  );
}
