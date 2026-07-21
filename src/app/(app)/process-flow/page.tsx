import {
  moveApprovedCheckpointWafer,
  persistProcessFlowMutationsBatch,
  routeCheckpointSubmission,
  submitStepCheckpoint,
  undoDieProcessHistoryState,
} from "@/features/runs/actions";
import {
  archiveCompletedProcessWafers,
  createWaferAtProcessStart,
  createProcessFlowStep,
  createProcessStepTransition,
  deleteProcessFlowWafer,
  deleteProcessSteps,
  deleteProcessStepTransitions,
  restoreArchivedProcessWafer,
  updateProcessStepName,
  updateProcessStepParameters,
  updateProcessStepExecutionMode,
  updateProcessStepPositions,
  updateProcessStepCheckpointReviewer,
  saveStepParameterRecord,
  saveStepParameterRecordsBatch
} from "@/features/process-flows/actions";
import {
  getProcessArchiveItems,
  getProcessDashboardData,
  type ProcessDashboardData
} from "@/features/process-flows/queries";
import { isArchiveEligibleAfterCurrentStep } from "@/features/process-flows/archiveEligibility";
import { getNextGreekWaferCode } from "@/features/process-flows/waferNaming";
import { canEditProject, canManageProcessLibrary, getCurrentAccount } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProcessFlowView } from "@/ui/waferwatch-wireframe/components/ProcessFlowView";
import type { FlowStatModel } from "@/ui/waferwatch-wireframe/types";
import type { Json, ProcessStepExecutionMode, ProcessStepNodeType, ProcessStepTransitionType, StepStatus } from "@/types/database";

export const dynamic = "force-dynamic";

export const metadata = { title: "Process flow · WaferWatch" };

type ProcessFlowSearchParams = { processId?: string | string[] };

type DiagramStep = {
  id: string;
  name: string;
  process_area: string;
  step_order: number;
  node_type: ProcessStepNodeType;
  execution_mode: ProcessStepExecutionMode;
  canvas_x: number | null;
  canvas_y: number | null;
  wafers: {
    assignmentId: string;
    waferId: string;
    projectId: string;
    currentStepExecutionId: string | null;
    waferCode: string;
    dieLabel: string | null;
    currentStepStatus: StepStatus | null;
    currentHandlerName: string | null;
    latestStepAttemptId: string | null;
    latestStepAttemptSubmittedById: string | null;
    latestStepAttemptNotes: string | null;
    requiredReviewerId: string | null;
    requiredReviewerName: string | null;
    canReview: boolean;
    canWithdraw: boolean;
    canUndoHistory: boolean;
    historyCorrectionCount: number;
    canCorrectCheckpointRoute: boolean;
    checkpointRouteSourceStepId: string | null;
    isArchivable: boolean;
    anytimeReturnStepId: string | null;
    anytimeReturnStepName: string | null;
  }[];
  required_reviewer_id: string | null;
  required_reviewer_name: string | null;
  parameters_schema: Json;
  revision: number;
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

function toFlowColumns(data: ProcessDashboardData, currentUserId: string | null): DiagramStep[] {
  const flowStates = data.workspaceWaferStates.filter((state) => state.assignmentStatus !== "scrapped");
  return [...data.process.process_steps]
    .sort((a, b) => a.step_order - b.step_order)
    .map((step) => ({
      id: step.id,
      name: step.name,
      process_area: step.process_area,
      step_order: step.step_order,
      node_type: step.node_type,
      execution_mode: step.execution_mode,
      canvas_x: step.canvas_x,
      canvas_y: step.canvas_y,
      required_reviewer_id: step.required_reviewer_id,
      required_reviewer_name: flowStates.find((state) => state.currentStepId === step.id)?.requiredReviewerName ?? null,
      parameters_schema: step.parameters_schema,
      revision: step.revision,
      wafers: flowStates
        .filter((state) => state.currentStepId === step.id)
        .map((state) => ({
          assignmentId: state.assignmentId,
          waferId: state.waferId,
          projectId: state.projectId,
          currentStepExecutionId: state.currentStepExecutionId,
          waferCode: state.waferCode,
          dieLabel: state.dieLabel,
          currentStepStatus: state.currentStepStatus,
          currentHandlerName: state.currentHandlerName,
          latestStepAttemptId: state.latestStepAttemptId,
          latestStepAttemptSubmittedById: state.latestStepAttemptSubmittedById,
          latestStepAttemptNotes: state.latestStepAttemptNotes,
          requiredReviewerId: state.requiredReviewerId,
          requiredReviewerName: state.requiredReviewerName,
          canReview: Boolean(currentUserId && currentUserId === state.requiredReviewerId),
          canWithdraw: Boolean(currentUserId && currentUserId === state.latestStepAttemptSubmittedById),
          canUndoHistory: state.canUndoHistory,
          historyCorrectionCount: state.historyCorrectionCount,
          canCorrectCheckpointRoute: state.canCorrectCheckpointRoute,
          checkpointRouteSourceStepId: state.checkpointRouteSourceStepId,
          isArchivable: isArchiveEligibleAfterCurrentStep(state.currentStepStatus),
          anytimeReturnStepId: state.anytimeReturnStepId,
          anytimeReturnStepName: state.anytimeReturnStepName
        }))
    }));
}

async function getReviewerOptions(data: ProcessDashboardData | null) {
  if (!data) return [];
  const supabase = await createServerSupabaseClient();
  const projectId = data.process.owner_project_id;
  let eligibleIds: string[] = [];

  if (projectId) {
    const [projectResult, membersResult] = await Promise.all([
      supabase.from("projects").select("owner_id").eq("id", projectId).maybeSingle(),
      supabase.from("project_members").select("user_id, role").eq("project_id", projectId).in("role", ["owner", "editor"])
    ]);
    eligibleIds = [
      projectResult.data?.owner_id,
      ...(membersResult.data ?? []).map((member) => member.user_id)
    ].filter((value): value is string => Boolean(value));
  } else {
    const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin").eq("is_active", true);
    eligibleIds = (admins ?? []).map((profile) => profile.id);
  }

  if (!eligibleIds.length) return [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", Array.from(new Set(eligibleIds)))
    .eq("is_active", true);
  return (profiles ?? [])
    .map((profile) => ({ id: profile.id, name: profile.display_name?.trim() || profile.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
    (total, column) => total + column.wafers.filter(
      (wafer) => wafer.currentStepStatus && statuses.includes(wafer.currentStepStatus)
    ).length,
    0
  );
}

function toFlowStats(data: ProcessDashboardData | null, columns: DiagramStep[]): FlowStatModel[] {
  const activeWaferCount = new Set(columns.flatMap((column) => column.wafers.map((wafer) => wafer.assignmentId))).size;
  const activeStepCount = columns.filter((column) => column.wafers.length > 0).length;
  const runningCount = countStatuses(columns, ["running"]);
  const attentionCount = countStatuses(columns, ["blocked", "failed", "redo_required"]);
  const queuedCount = countStatuses(columns, ["queued", "pending", "awaiting_checkpoint", "ready_to_move"]);
  const totalCalendarEvents = data?.calendarDays.reduce((total, day) => total + day.events.length, 0) ?? 0;

  return [
    { id: "total-steps", icon: "total", label: "Steps", value: String(columns.length), caption: data ? data.process.name : "No process loaded" },
    { id: "active-wafers", icon: "stack", label: "Active wafers", value: String(activeWaferCount), caption: "From assignments" },
    { id: "active-steps", icon: "target", label: "Active steps", value: String(activeStepCount), caption: `${columns.length} backend steps` },
    { id: "running", icon: "handoff", label: "Running", value: String(runningCount), caption: "Step executions" },
    { id: "blocked", icon: "warning", label: "Needs attention", value: String(attentionCount), caption: "Blocked, failed, or redo" },
    { id: "scheduled", icon: "check", label: "Scheduled", value: String(totalCalendarEvents || queuedCount), caption: totalCalendarEvents ? "Calendar events" : "Queued or checkpointed" }
  ];
}

async function loadProcessFlowData(
  requestedProcessId: string | undefined,
  account: Awaited<ReturnType<typeof getCurrentAccount>>
) {
  if (!requestedProcessId) return null;
  if (!account) return null;
  return getProcessDashboardData(requestedProcessId, 14, false).catch(() => null);
}

async function getCanEditProcessFlow(
  data: ProcessDashboardData | null,
  account: Awaited<ReturnType<typeof getCurrentAccount>>
) {
  if (!data) return false;
  if (!account) return false;
  return data.process.owner_project_id
    ? canEditProject(data.process.owner_project_id, account)
    : canManageProcessLibrary(account.profile.role);
}

async function getSuggestedWaferCode(data: ProcessDashboardData | null) {
  if (!data) return undefined;
  const fallbackCodes = data.workspaceWaferStates.map((wafer) => wafer.waferCode);
  const projectId = data.process.owner_project_id ?? data.workspaceWaferStates[0]?.projectId;
  if (!projectId) return getNextGreekWaferCode(fallbackCodes);
  const supabase = await createServerSupabaseClient();
  const { data: wafers, error } = await supabase
    .from("wafers")
    .select("wafer_code")
    .eq("project_id", projectId)
    .is("deleted_at", null);
  return getNextGreekWaferCode(error ? fallbackCodes : (wafers ?? []).map((wafer) => wafer.wafer_code));
}

export default async function ProcessFlowWireframePage({
  searchParams
}: {
  searchParams: Promise<ProcessFlowSearchParams>;
}) {
  const requestedProcessId = firstSearchValue((await searchParams).processId);
  const account = await getCurrentAccount();
  const dashboardData = await loadProcessFlowData(requestedProcessId, account);
  const [canEdit, suggestedWaferCode, reviewerOptions, archiveItems] = await Promise.all([
    getCanEditProcessFlow(dashboardData, account),
    getSuggestedWaferCode(dashboardData),
    getReviewerOptions(dashboardData),
    dashboardData
      ? getProcessArchiveItems(dashboardData.process.id).catch(() => [])
      : Promise.resolve([])
  ]);
  const flowColumns = dashboardData ? toFlowColumns(dashboardData, account?.userId ?? null) : [];
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
      emptyDescription={flowColumns.length === 0
        ? requestedProcessId
          ? "Sign in with access to an active process template, or assign wafers to a process. No wireframe fallback data is injected."
          : "Select a process first. The process flow stays hidden until a process and this sub-view are selected."
        : undefined}
      steps={flowColumns}
      transitions={flowTransitions}
      stats={toFlowStats(dashboardData, flowColumns)}
      processTemplateId={dashboardData?.process.id}
      suggestedWaferCode={suggestedWaferCode}
      reviewerOptions={reviewerOptions}
      archiveItems={archiveItems}
      currentUserId={account?.userId}
      currentUserName={account?.profile.display_name ?? account?.email ?? undefined}
      canEdit={canEdit}
      actions={canEdit ? {
        createStep: createProcessFlowStep,
        createWafer: createWaferAtProcessStart,
        updatePositions: updateProcessStepPositions,
        updateName: updateProcessStepName,
        updateStepTemplate: updateProcessStepParameters,
        updateExecutionMode: updateProcessStepExecutionMode,
        createTransition: createProcessStepTransition,
        deleteSteps: deleteProcessSteps,
        deleteTransitions: deleteProcessStepTransitions,
        deleteWafer: deleteProcessFlowWafer,
        archiveWafers: archiveCompletedProcessWafers,
        restoreWafer: restoreArchivedProcessWafer,
        submitCheckpoint: submitStepCheckpoint,
        routeCheckpoint: routeCheckpointSubmission,
        moveApprovedWafer: moveApprovedCheckpointWafer,
        persistMutationsBatch: persistProcessFlowMutationsBatch,
        undoHistory: undoDieProcessHistoryState,
        saveParameters: saveStepParameterRecord,
        saveParameterRecordsBatch: saveStepParameterRecordsBatch,
        updateReviewer: updateProcessStepCheckpointReviewer
      } : undefined}
    />
  );
}
