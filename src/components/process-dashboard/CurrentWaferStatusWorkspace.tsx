"use client";

import { useMemo, useState } from "react";
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

function statusPillClass(status: StepStatus | null) {
  const normalized = normalizeStatusLabel(status).toLowerCase();

  if (normalized === "running" || normalized === "queued") {
    return "wafer-card-chip-status wafer-card-chip-status--active";
  }

  if (normalized === "blocked" || normalized === "failed") {
    return "wafer-card-chip-status wafer-card-chip-status--warning";
  }

  if (normalized === "completed" || normalized === "done") {
    return "wafer-card-chip-status wafer-card-chip-status--success";
  }

  return "wafer-card-chip-status";
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

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const selected = availableStates.find((state) => state.assignmentId === selectedAssignmentId) ?? null;

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

      {selected ? (
        <div className="wafer-workspace-selected">
          <div className="wafer-workspace-selected__toolbar">
            <button
              type="button"
              className="button button-secondary wafer-workspace-back"
              onClick={() => setSelectedAssignmentId(null)}
            >
              ← Back to wafers
            </button>
            <h3 style={{ margin: 0 }}>{selected.waferCode}</h3>
            <p className="muted">Current step: {selected.currentStepName ?? "Waiting to start"}</p>
          </div>

            <WaferCutVisualizer waferStateName={selected.currentStepName} />
          </div>
      ) : (
        <div className="panel wafer-card-panel">
          <div className="wafer-card-panel__list">
            {availableStates.map((state) => {
              const waferLabel = state.waferCode;
              const stepLabel = state.currentStepName ?? "Waiting to start";
              const assignmentLabel = state.assignmentStatus.replace(/_/g, " ");

              return (
                <button
                  type="button"
                  key={state.assignmentId}
                  className="wafer-card"
                  onClick={() => setSelectedAssignmentId(state.assignmentId)}
                >
                  <strong>{waferLabel}</strong>
                  <p className="muted">{state.dieLabel ? `Die ${state.dieLabel}` : "Die unknown"}</p>
                  <p className="muted">Current step: {stepLabel}</p>
                  <p className="muted">Assignment: {assignmentLabel}</p>
                  <span className={statusPillClass(state.currentStepStatus)}>{normalizeStatusLabel(state.currentStepStatus)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
