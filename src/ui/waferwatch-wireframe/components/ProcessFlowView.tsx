"use client";

import { ProcessFlowDiagram } from "@/components/ProcessFlowDiagram";
import { flowModel } from "../mock-data";
import { ProcessFlowStatsBar } from "./ProcessFlowStatsBar";

export function ProcessFlowView() {
  const diagramSteps = flowModel.steps.map((step) => ({
    id: step.id,
    name: step.name,
    process_area: step.process_area,
    step_order: step.step_order,
    wafers: [...(step.wafers ?? [])],
    role: step.role,
    icon: step.icon,
    x: step.x,
    y: step.y,
    nextStepIds: step.nextStepIds ? [...step.nextStepIds] : undefined,
    returnStepIds: step.returnStepIds ? [...step.returnStepIds] : undefined
  }));

  return (
    <div className="flex flex-col gap-5 p-6">
      <section className="rounded-3xl border border-[#e5e5db] bg-[#fafaf4] p-3">
        <div className="wireframe-flow-surface overflow-hidden rounded-2xl bg-white">
          <ProcessFlowDiagram steps={diagramSteps} wireframeMode />
        </div>
      </section>

      <ProcessFlowStatsBar stats={flowModel.stats} />
    </div>
  );
}
