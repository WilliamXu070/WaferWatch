"use client";

import { useEffect, useMemo } from "react";
import type { ProcessFlowActions } from "@/components/process-flow/types";
import { isArchiveEligibleAfterCurrentStep } from "@/features/process-flows/archiveEligibility";
import { useProcessWorkspace } from "@/features/workspace/store";
import type {
  Json,
  ProcessStepExecutionMode,
  ProcessStepNodeType,
  ProcessStepTransitionType,
  StepStatus
} from "@/types/database";
import type { FlowStatModel } from "../types";
import { ProcessFlowView } from "./ProcessFlowView";
import { useWorkspaceSession } from "@/features/workspace/WorkspaceSessionProvider";

function record(value: Json) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : null;
}

function string(value: Json | undefined) {
  return typeof value === "string" ? value : null;
}

function number(value: Json | undefined) {
  return typeof value === "number" ? value : null;
}

function statusFromState(state: Record<string, Json | undefined>): StepStatus | null {
  if (state.assignment_status === "completed") return "completed";
  if (state.current_member_status === "awaiting_review") return "awaiting_checkpoint";
  if (state.current_member_status === "rejected") return "redo_required";
  const memberStatus = string(state.current_member_status);
  if (memberStatus && ["queued", "running", "blocked", "completed", "skipped", "failed", "redo_required"].includes(memberStatus)) {
    return memberStatus as StepStatus;
  }
  if (state.assignment_status === "planned") return "pending";
  if (state.assignment_status === "queued") return "queued";
  if (state.assignment_status === "on_hold") return "blocked";
  if (state.assignment_status === "in_progress") return "running";
  return null;
}

export function HotProcessFlowView({
  processId,
  currentUserId,
  currentUserName,
  canEdit,
  actions
}: {
  processId: string;
  currentUserId: string;
  currentUserName: string;
  canEdit: boolean;
  actions?: ProcessFlowActions;
}) {
  const workspaceSession = useWorkspaceSession();
  const effectiveProcessId = workspaceSession.activeProcessId ?? processId;
  const workspace = useProcessWorkspace(effectiveProcessId);
  const snapshot = workspace.optimisticSnapshot ?? workspace.snapshot;
  const bootstrap = workspace.hotBootstrap;

  const { steps, transitions } = useMemo(() => {
    const stepRows = snapshot?.processDefinition.steps.flatMap((value) => {
      const row = record(value);
      return row && typeof row.id === "string" ? [row] : [];
    }) ?? [];
    const stepNameById = new Map(stepRows.map((row) => [row.id as string, string(row.name) ?? "Process step"]));
    const mappedSteps = stepRows
      .sort((left, right) => (number(left.step_order) ?? 0) - (number(right.step_order) ?? 0))
      .map((step) => {
        const stepId = step.id as string;
        const stepStates = (workspace.normalizedAssignments.assignmentIdsByStepId[stepId] ?? []).flatMap((assignmentId) => {
          const state = record(workspace.normalizedAssignments.assignmentsById[assignmentId]);
          return state && state.assignment_status !== "scrapped" ? [state] : [];
        });
        return {
          id: stepId,
          name: string(step.name) ?? "Process step",
          process_area: string(step.process_area) ?? "General",
          step_order: number(step.step_order) ?? 0,
          node_type: (string(step.node_type) ?? "procedure") as ProcessStepNodeType,
          execution_mode: (string(step.execution_mode) ?? "standard") as ProcessStepExecutionMode,
          canvas_x: number(step.canvas_x),
          canvas_y: number(step.canvas_y),
          required_reviewer_id: string(step.required_reviewer_id),
          required_reviewer_name: stepStates.map((state) => string(state.required_reviewer_name)).find(Boolean) ?? null,
          parameters_schema: step.parameters_schema ?? {},
          revision: number(step.revision) ?? 1,
          wafers: stepStates.flatMap((state) => {
            const assignmentId = string(state.assignment_id);
            const waferId = string(state.wafer_id);
            const waferCode = string(state.wafer_code);
            const projectId = string(state.project_id);
            if (!assignmentId || !waferId || !waferCode || !projectId) return [];
            const currentStepStatus = statusFromState(state);
            const requiredReviewerId = string(state.required_reviewer_id);
            return [{
              assignmentId,
              waferId,
              projectId,
              currentStepExecutionId: string(state.legacy_step_execution_id),
              waferCode,
              dieLabel: string(state.die_label),
              currentStepStatus,
              currentHandlerName: string(state.current_handler_name),
              latestStepAttemptId: string(state.latest_attempt_id),
              latestStepAttemptSubmittedById: string(state.latest_attempt_submitted_by),
              latestStepAttemptNotes: string(state.latest_attempt_notes),
              requiredReviewerId,
              requiredReviewerName: string(state.required_reviewer_name),
              canReview: currentUserId === requiredReviewerId,
              canWithdraw: currentUserId === string(state.latest_attempt_submitted_by),
              canUndoHistory: Boolean(state.latest_attempt_id || state.checkpoint_route_source_step_id),
              historyCorrectionCount: 0,
              canCorrectCheckpointRoute: state.can_correct_checkpoint_route === true,
              checkpointRouteSourceStepId: string(state.checkpoint_route_source_step_id),
              isArchivable: isArchiveEligibleAfterCurrentStep(currentStepStatus, currentUserId === requiredReviewerId),
              anytimeReturnStepId: string(state.anytime_return_step_id),
              anytimeReturnStepName: string(state.anytime_return_step_id)
                ? stepNameById.get(string(state.anytime_return_step_id)!) ?? null
                : null
            }];
          })
        };
      });
    const mappedTransitions = snapshot?.processDefinition.transitions.flatMap((value) => {
      const row = record(value);
      const id = string(row?.id);
      const from = string(row?.from_step_id);
      const to = string(row?.to_step_id);
      if (!id || !from || !to) return [];
      return [{
        id,
        from_step_id: from,
        to_step_id: to,
        edge_type: (string(row?.edge_type) ?? "flow") as ProcessStepTransitionType,
        label: string(row?.label),
        priority: number(row?.priority) ?? 0
      }];
    }) ?? [];
    return { steps: mappedSteps, transitions: mappedTransitions };
  }, [currentUserId, snapshot?.processDefinition, workspace.normalizedAssignments]);

  const stats = useMemo<FlowStatModel[]>(() => {
    const wafers = steps.flatMap((step) => step.wafers);
    const count = (...statuses: StepStatus[]) => wafers.filter((wafer) => (
      wafer.currentStepStatus && statuses.includes(wafer.currentStepStatus)
    )).length;
    return [
      { id: "total-steps", icon: "total", label: "Steps", value: String(steps.length), caption: bootstrap?.processSummary.name ?? "Loading process" },
      { id: "active-wafers", icon: "stack", label: "Active wafers", value: String(wafers.length), caption: "Current projection" },
      { id: "active-steps", icon: "target", label: "Active steps", value: String(steps.filter((step) => step.wafers.length).length), caption: `${steps.length} backend steps` },
      { id: "running", icon: "handoff", label: "Running", value: String(count("running")), caption: "Operation runs" },
      { id: "blocked", icon: "warning", label: "Needs attention", value: String(count("blocked", "failed", "redo_required")), caption: "Blocked, failed, or redo" },
      { id: "scheduled", icon: "check", label: "Scheduled", value: String(snapshot?.calendar.length ?? 0), caption: "Current calendar week" }
    ];
  }, [bootstrap?.processSummary.name, snapshot?.calendar.length, steps]);

  useEffect(() => {
    if (!snapshot || document.body.dataset.perfTestMode !== "1") return;
    requestAnimationFrame(() => performance.mark("waferwatch:route-dom-ready"));
  }, [snapshot]);

  const processLabel = bootstrap
    ? `${bootstrap.processSummary.name}${bootstrap.processSummary.version ? ` · ${bootstrap.processSummary.version}` : ""}`
    : "Loading process";

  return (
    <ProcessFlowView
      key={effectiveProcessId}
      processLabel={processLabel}
      statusLabel={snapshot ? undefined : "Loading the bounded process workspace…"}
      emptyTitle={snapshot && steps.length === 0 ? "No process flow data" : undefined}
      emptyDescription={snapshot && steps.length === 0 ? "This process has no active steps." : undefined}
      steps={steps}
      transitions={transitions}
      stats={stats}
      processTemplateId={effectiveProcessId}
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      canEdit={canEdit}
      actions={actions}
      workspaceRevision={snapshot?.revision}
      directDeltaReconciliation
    />
  );
}
