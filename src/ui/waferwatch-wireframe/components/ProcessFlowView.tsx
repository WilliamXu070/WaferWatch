"use client";

import { ProcessFlowDiagram } from "@/components/ProcessFlowDiagram";
import type { Json, ProcessStepExecutionMode, ProcessStepNodeType, ProcessStepTransitionType, StepStatus } from "@/types/database";
import type { CheckpointReviewerOption } from "@/components/process-flow/types";
import type { FlowStatModel } from "../types";
import { ProcessFlowStatsBar } from "./ProcessFlowStatsBar";

type ProcessFlowWaferModel = {
  assignmentId: string;
  waferId?: string;
  projectId?: string;
  currentStepExecutionId?: string | null;
  waferCode: string;
  dieLabel: string | null;
  currentStepStatus: StepStatus | null;
  currentHandlerName?: string | null;
  latestStepAttemptId?: string | null;
  latestStepAttemptSubmittedById?: string | null;
  latestStepAttemptNotes?: string | null;
  requiredReviewerId?: string | null;
  requiredReviewerName?: string | null;
  canReview?: boolean;
  canWithdraw?: boolean;
  anytimeReturnStepId?: string | null;
  anytimeReturnStepName?: string | null;
};

type ProcessFlowStepModel = {
  id: string;
  name: string;
  process_area: string;
  step_order: number;
  node_type: ProcessStepNodeType;
  execution_mode: ProcessStepExecutionMode;
  canvas_x: number | null;
  canvas_y: number | null;
  required_reviewer_id?: string | null;
  required_reviewer_name?: string | null;
  parameters_schema?: Json;
  wafers: ProcessFlowWaferModel[];
};

type ProcessFlowTransitionModel = {
  id: string;
  from_step_id: string;
  to_step_id: string;
  edge_type: ProcessStepTransitionType;
  label: string | null;
  priority: number;
};

type ProcessFlowViewProps = {
  processLabel: string;
  statusLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  steps: ProcessFlowStepModel[];
  transitions: ProcessFlowTransitionModel[];
  stats: readonly FlowStatModel[];
  canEdit?: boolean;
  processTemplateId?: string;
  suggestedWaferCode?: string;
  reviewerOptions?: CheckpointReviewerOption[];
  archiveItems?: Parameters<typeof ProcessFlowDiagram>[0]["archiveItems"];
  currentUserId?: string;
  currentUserName?: string;
  onCreateStep?: Parameters<typeof ProcessFlowDiagram>[0]["onCreateStep"];
  onCreateWaferAtProcessStart?: Parameters<typeof ProcessFlowDiagram>[0]["onCreateWaferAtProcessStart"];
  onUpdateStepPositions?: Parameters<typeof ProcessFlowDiagram>[0]["onUpdateStepPositions"];
  onUpdateStepName?: Parameters<typeof ProcessFlowDiagram>[0]["onUpdateStepName"];
  onUpdateStepNodeType?: Parameters<typeof ProcessFlowDiagram>[0]["onUpdateStepNodeType"];
  onUpdateStepExecutionMode?: Parameters<typeof ProcessFlowDiagram>[0]["onUpdateStepExecutionMode"];
  onCreateTransition?: Parameters<typeof ProcessFlowDiagram>[0]["onCreateTransition"];
  onDeleteSteps?: Parameters<typeof ProcessFlowDiagram>[0]["onDeleteSteps"];
  onDeleteTransitions?: Parameters<typeof ProcessFlowDiagram>[0]["onDeleteTransitions"];
  onDeleteWafer?: Parameters<typeof ProcessFlowDiagram>[0]["onDeleteWafer"];
  onArchiveWafers?: Parameters<typeof ProcessFlowDiagram>[0]["onArchiveWafers"];
  onRestoreArchivedWafer?: Parameters<typeof ProcessFlowDiagram>[0]["onRestoreArchivedWafer"];
  onSubmitCheckpoint?: Parameters<typeof ProcessFlowDiagram>[0]["onSubmitCheckpoint"];
  onRouteCheckpoint?: Parameters<typeof ProcessFlowDiagram>[0]["onRouteCheckpoint"];
  onMoveApprovedWafer?: Parameters<typeof ProcessFlowDiagram>[0]["onMoveApprovedWafer"];
  onSaveStepParameters?: Parameters<typeof ProcessFlowDiagram>[0]["onSaveStepParameters"];
  onUpdateStepReviewer?: Parameters<typeof ProcessFlowDiagram>[0]["onUpdateStepReviewer"];
};

export function ProcessFlowView({
  processLabel,
  statusLabel,
  emptyTitle,
  emptyDescription,
  steps,
  transitions,
  stats,
  canEdit = true,
  processTemplateId,
  suggestedWaferCode,
  reviewerOptions,
  archiveItems,
  currentUserId,
  currentUserName,
  onCreateStep,
  onCreateWaferAtProcessStart,
  onUpdateStepPositions,
  onUpdateStepName,
  onUpdateStepNodeType,
  onUpdateStepExecutionMode,
  onCreateTransition,
  onDeleteSteps,
  onDeleteTransitions,
  onDeleteWafer,
  onArchiveWafers,
  onRestoreArchivedWafer,
  onSubmitCheckpoint,
  onRouteCheckpoint,
  onMoveApprovedWafer,
  onSaveStepParameters,
  onUpdateStepReviewer
}: ProcessFlowViewProps) {
  return (
    <div className="process-flow-view flex h-full min-h-0 flex-col gap-2 p-2 md:gap-3 md:p-4">
      <section className="process-flow-workspace min-h-0 flex-1 rounded-2xl border border-[#e5e5db] bg-[#fafaf4] p-1.5 md:rounded-3xl md:p-2">
        <div className="wireframe-flow-surface flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] bg-white md:rounded-2xl">
          <div className="process-flow-heading flex shrink-0 flex-col gap-0.5 border-b border-[#eeeee4] px-3 py-2.5 md:px-4 md:py-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a887f]">
              {processLabel}
            </p>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold leading-tight text-[#151512]">Process flow</h1>
                {statusLabel ? (
                  <p className="mt-0.5 truncate text-xs text-[#7b796f]">{statusLabel}</p>
                ) : null}
              </div>
            </div>
          </div>

          {emptyTitle ? (
            <div className="process-flow-empty mx-3 mt-2 shrink-0 rounded-xl border border-dashed border-[#d8d6ca] bg-[#fbfbf7] px-3 py-2 md:mx-4">
              <p className="text-xs font-semibold text-[#151512]">{emptyTitle}</p>
              {emptyDescription ? (
                <p className="mt-0.5 max-w-3xl truncate text-xs text-[#7b796f]">{emptyDescription}</p>
              ) : null}
            </div>
          ) : null}

          <ProcessFlowDiagram
            steps={steps}
            transitions={transitions}
            processTemplateId={processTemplateId}
            suggestedWaferCode={suggestedWaferCode}
            reviewerOptions={reviewerOptions}
            archiveItems={archiveItems}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            canEdit={canEdit}
            onCreateStep={onCreateStep}
            onCreateWaferAtProcessStart={onCreateWaferAtProcessStart}
            onUpdateStepPositions={onUpdateStepPositions}
            onUpdateStepName={onUpdateStepName}
            onUpdateStepNodeType={onUpdateStepNodeType}
            onUpdateStepExecutionMode={onUpdateStepExecutionMode}
            onCreateTransition={onCreateTransition}
            onDeleteSteps={onDeleteSteps}
            onDeleteTransitions={onDeleteTransitions}
            onDeleteWafer={onDeleteWafer}
            onArchiveWafers={onArchiveWafers}
            onRestoreArchivedWafer={onRestoreArchivedWafer}
            onSubmitCheckpoint={onSubmitCheckpoint}
            onRouteCheckpoint={onRouteCheckpoint}
            onMoveApprovedWafer={onMoveApprovedWafer}
            onSaveStepParameters={onSaveStepParameters}
            onUpdateStepReviewer={onUpdateStepReviewer}
          />
        </div>
      </section>

      <ProcessFlowStatsBar stats={stats} />
    </div>
  );
}
