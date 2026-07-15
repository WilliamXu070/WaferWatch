import { Check, Clock3, RotateCcw } from "lucide-react";
import type {
  WaferStatusCheckpointAttemptEntry,
  WaferStatusProcessStepModel,
  WaferStatusTileModel
} from "../../types";

function getStepLabel(step: WaferStatusProcessStepModel, currentStepId: string | null | undefined) {
  if (step.status === "redo_required") return { label: "Redo required", tone: "redo" as const };
  if (step.status === "awaiting_checkpoint") return { label: "Awaiting checkpoint", tone: "review" as const };
  if (step.status === "completed" || step.status === "skipped") return { label: "Complete", tone: "complete" as const };
  if (step.id === currentStepId || ["queued", "running"].includes(step.status)) {
    return { label: "In progress", tone: "current" as const };
  }
  if (["blocked", "failed"].includes(step.status)) return { label: "Needs attention", tone: "redo" as const };
  return { label: "Upcoming", tone: "upcoming" as const };
}

function attemptsForStep(tile: WaferStatusTileModel, stepId: string) {
  return (tile.checkpointHistory ?? []).filter(
    (entry): entry is WaferStatusCheckpointAttemptEntry => entry.kind === "attempt" && entry.stepId === stepId
  );
}

export function SequentialStepPicker({
  tile,
  selectedStepId,
  onSelectStep
}: {
  tile: WaferStatusTileModel;
  selectedStepId?: string | null;
  onSelectStep: (stepId: string) => void;
}) {
  const steps = [...(tile.processSteps ?? [])].sort(
    (left, right) => left.stepOrder - right.stepOrder || left.name.localeCompare(right.name)
  );

  return (
    <ol
      aria-label="Sequential process steps"
      className="relative before:absolute before:bottom-6 before:left-[17px] before:top-6 before:w-px before:bg-[#ddddD6]"
    >
      {steps.map((step, index) => {
        const state = getStepLabel(step, tile.currentStepId);
        const attempts = attemptsForStep(tile, step.id);
        const redoCount = attempts.filter((attempt) => attempt.effectiveDecision?.outcome === "redo").length;
        const isSelected = selectedStepId === step.id;

        return (
          <li key={step.id} className="relative pb-2 last:pb-0">
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectStep(step.id)}
              className={`grid min-h-20 w-full grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-lg px-1 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#171714] focus-visible:ring-offset-2 motion-reduce:transition-none ${
                isSelected ? "bg-[#f0f0eb]" : "hover:bg-[#f7f7f3]"
              }`}
            >
              <span
                className={`relative z-10 grid h-9 w-9 place-items-center rounded-full border text-[12px] font-bold ${
                  state.tone === "redo"
                    ? "border-[#c56f21] bg-[#fff7ed] text-[#9a4f12]"
                    : state.tone === "review"
                      ? "border-[#c59031] bg-[#fff9e8] text-[#805b14]"
                      : state.tone === "complete"
                        ? "border-[#4f7f56] bg-[#4f7f56] text-white"
                        : state.tone === "current"
                          ? "border-[#171714] bg-[#171714] text-white"
                          : "border-[#d1d1ca] bg-white text-[#7a7a73]"
                }`}
                aria-hidden
              >
                {state.tone === "redo" ? <RotateCcw size={15} /> : state.tone === "complete" ? <Check size={15} /> : index + 1}
              </span>

              <span className="min-w-0 py-0.5">
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <strong className="text-[14px] font-semibold text-[#171714]">{step.name}</strong>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                      state.tone === "redo"
                        ? "bg-[#fff0df] text-[#9a4f12]"
                        : state.tone === "review"
                          ? "bg-[#fff1c7] text-[#76510b]"
                          : state.tone === "complete"
                            ? "bg-[#eaf4ec] text-[#35613b]"
                            : "bg-[#e9e9e4] text-[#5f5f59]"
                    }`}
                  >
                    {state.label}
                  </span>
                </span>
                <span className="mt-1 block text-[12px] text-[#74746d]">{step.processArea || "Process step"}</span>
                {attempts.length ? (
                  <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium text-[#6d6d66]">
                    <span className="inline-flex items-center gap-1"><Clock3 size={12} aria-hidden /> {attempts.length} {attempts.length === 1 ? "attempt" : "attempts"}</span>
                    {redoCount ? <span className="font-semibold text-[#9a4f12]">{redoCount} redo</span> : null}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
