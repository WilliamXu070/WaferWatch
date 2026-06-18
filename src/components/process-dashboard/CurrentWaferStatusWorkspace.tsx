"use client";

import { useMemo } from "react";
import type { StepStatus } from "@/types/database";
import type { ProcessDashboardWaferState } from "@/features/process-flows/queries";
import { WaferCutVisualizer } from "@/components/WaferCutVisualizer";

type ChipWorkspaceProps = {
  states: ProcessDashboardWaferState[];
};

const DEFAULT_SEED_FILTER = "alpha";
const EMPTY_FALLBACK_SEEDS: Array<{ assignmentId: string; waferCode: string; dieLabel: string | null }> = [
  {
    assignmentId: "seed-fallback-alpha",
    waferCode: "Alpha",
    dieLabel: null
  }
];
const FALLBACK_ALPHA_STEP_NAME = "Post EBL";

function normalizeStatusLabel(status: StepStatus | null) {
  if (!status) {
    return "Pending";
  }

  if (status === "running") {
    return "Running";
  }

  if (status === "queued") {
    return "Queued";
  }

  if (status === "blocked" || status === "failed") {
    return status === "blocked" ? "Blocked" : "Failed";
  }

  if (status === "completed") {
    return "Completed";
  }

  if (status === "skipped") {
    return "Skipped";
  }

  return "Done";
}

function matchesAlphaSeed(waferCode: string) {
  return waferCode.toLowerCase().includes(DEFAULT_SEED_FILTER);
}

export function CurrentWaferStatusWorkspace({ states }: ChipWorkspaceProps) {
  const availableStates = useMemo(() => {
    const seeded = states.filter((state) => matchesAlphaSeed(state.waferCode));

    if (seeded.length > 0) {
      return seeded;
    }

    return EMPTY_FALLBACK_SEEDS.map((seed) => ({
      assignmentId: seed.assignmentId,
      assignmentStatus: "planned",
      waferId: seed.assignmentId,
      waferCode: seed.waferCode,
      projectId: "seed-fallback",
      dieLabel: seed.dieLabel,
      currentStepId: null,
      currentStepName: FALLBACK_ALPHA_STEP_NAME,
      currentStepOrder: null,
      currentStepStatus: "running" as StepStatus,
      currentStepArea: null,
      currentToolId: null
    }));
  }, [states]);

  const visualizerWafers = availableStates.map((state) => ({
    id: state.assignmentId,
    name: state.waferCode,
    stateName: state.currentStepName,
    statusLabel: normalizeStatusLabel(state.currentStepStatus),
    assignmentLabel: state.assignmentStatus.replace(/_/g, " ")
  }));

  if (availableStates.length === 0) {
    return (
      <div className="wafer-workspace-placeholder">
        <p className="muted">No wafers are currently available for this process.</p>
      </div>
    );
  }

  return (
    <section className="wafer-workspace-shell">
      <header className="wafer-workspace-header">
        <h2>Current wafers / die status</h2>
        <p className="muted">Select a wafer to open the die viewer.</p>
      </header>

      <WaferCutVisualizer wafers={visualizerWafers} />
    </section>
  );
}
