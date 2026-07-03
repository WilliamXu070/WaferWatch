"use client";

import { ProcessFlowDiagram } from "@/components/ProcessFlowDiagram";
import type { ActionResult } from "@/lib/action-result";
import type { StepStatus } from "@/types/database";
import type { FlowStatModel } from "../types";
import { ProcessFlowStatsBar } from "./ProcessFlowStatsBar";

type ProcessFlowWaferModel = {
  assignmentId: string;
  waferCode: string;
  dieLabel: string | null;
  currentStepStatus: StepStatus | null;
};

type ProcessFlowStepModel = {
  id: string;
  name: string;
  process_area: string;
  step_order: number;
  wafers: ProcessFlowWaferModel[];
};

type MoveWaferToProcessStepAction = (input: {
  assignmentId: string;
  targetStepId: string;
  note?: string | null;
}) => Promise<ActionResult<unknown>>;

type ProcessFlowViewProps = {
  processLabel: string;
  statusLabel: string;
  emptyTitle?: string;
  emptyDescription?: string;
  steps: ProcessFlowStepModel[];
  stats: readonly FlowStatModel[];
  onMoveWafer?: MoveWaferToProcessStepAction;
};

export function ProcessFlowView({
  processLabel,
  statusLabel,
  emptyTitle,
  emptyDescription,
  steps,
  stats,
  onMoveWafer
}: ProcessFlowViewProps) {
  return (
    <div className="flex flex-col gap-5 p-6">
      <section className="rounded-3xl border border-[#e5e5db] bg-[#fafaf4] p-3">
        <div className="wireframe-flow-surface overflow-hidden rounded-2xl bg-white">
          <div className="flex flex-col gap-1 border-b border-[#eeeee4] px-6 py-5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a887f]">
              {processLabel}
            </p>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-[#151512]">Process flow</h1>
                <p className="mt-1 text-sm text-[#7b796f]">{statusLabel}</p>
              </div>
              <span className="rounded-lg border border-[#e5e5db] bg-[#fbfbf8] px-3 py-1.5 text-[12px] font-semibold text-[#6f6d66]">
                Backend only
              </span>
            </div>
          </div>

          {emptyTitle ? (
            <div className="mx-6 mt-5 rounded-2xl border border-dashed border-[#d8d6ca] bg-[#fbfbf7] p-4">
              <p className="text-sm font-semibold text-[#151512]">{emptyTitle}</p>
              {emptyDescription ? (
                <p className="mt-1 max-w-3xl text-sm text-[#7b796f]">{emptyDescription}</p>
              ) : null}
            </div>
          ) : null}

          <ProcessFlowDiagram steps={steps} onMoveWafer={onMoveWafer} />
        </div>
      </section>

      <ProcessFlowStatsBar stats={stats} />
    </div>
  );
}
