"use client";

import { useMemo } from "react";
import type { StepStatus } from "@/types/database";
import type { ProcessDashboardWaferState } from "@/features/process-flows/queries";
import { WaferCutVisualizer } from "@/components/WaferCutVisualizer";

type ChipWorkspaceProps = {
  states: ProcessDashboardWaferState[];
};

const DEFAULT_SEED_FILTER = "alpha";

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
    return states.filter((state) => matchesAlphaSeed(state.waferCode));
  }, [states]);

  const visualizerWafers = availableStates.map((state) => ({
    id: state.assignmentId,
    waferId: state.waferId,
    projectId: state.projectId,
    name: state.waferCode,
    stateName: state.currentStepName,
    statusLabel: normalizeStatusLabel(state.currentStepStatus),
    assignmentLabel: state.assignmentStatus.replace(/_/g, " "),
    nextStepName: state.nextStepName,
    currentHandlerName: state.currentHandlerName,
    dieDescriptions: state.dieDescriptions,
    diePolingParameters: state.diePolingParameters
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
