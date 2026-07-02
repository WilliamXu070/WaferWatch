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
    wafers: []
  }));

  return (
    <div className="flex flex-col gap-5 p-6">
      <section className="rounded-2xl border border-ww-border bg-white p-6">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ww-ink">{flowModel.title}</h1>
            <p className="mt-1 text-sm text-[#8a887f]">{flowModel.subtitle}</p>
          </div>
          <p className="text-xs text-[#9a988f]">Drag to pan · Scroll to zoom</p>
        </header>

        <div className="wireframe-flow-surface overflow-hidden rounded-xl border border-ww-border bg-[#fbfbf8]">
          <ProcessFlowDiagram steps={diagramSteps} />
        </div>
      </section>

      <ProcessFlowStatsBar stats={flowModel.stats} />
    </div>
  );
}
