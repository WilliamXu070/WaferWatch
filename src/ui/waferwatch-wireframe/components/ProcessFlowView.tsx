"use client";

import { ProcessFlowDiagram } from "@/components/ProcessFlowDiagram";
import type { Json, ProcessStepExecutionMode, ProcessStepNodeType, ProcessStepTransitionType, StepStatus } from "@/types/database";
import type { CheckpointReviewerOption, ProcessFlowActions } from "@/components/process-flow/types";
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
  canUndoHistory?: boolean;
  canCorrectCheckpointRoute?: boolean;
  checkpointRouteSourceStepId?: string | null;
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
  actions?: ProcessFlowActions;
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
  actions
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
            actions={actions}
          />
        </div>
      </section>

      <ProcessFlowStatsBar stats={stats} />
    </div>
  );
}
