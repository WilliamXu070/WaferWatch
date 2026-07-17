import type { CSSProperties, KeyboardEvent } from "react";
import type { StepVisitHistoryItem } from "./stepVisitHistoryModel";

const timelineAccentByFamily: Record<string, { accent: string; selected: string }> = {
  ALPHA: { accent: "#3f7534", selected: "#f3f8f1" },
  BETA: { accent: "#326b98", selected: "#f2f7fb" },
  GAMMA: { accent: "#9f493f", selected: "#fbf3f2" }
};

function formatVisitTime(value: string | null) {
  if (!value) return "Time not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto"
  }).format(date);
}

function getHistoryAction(
  visit: StepVisitHistoryItem,
  precedingVisits: readonly StepVisitHistoryItem[]
) {
  if (visit.historyAction) return visit.historyAction;
  if (visit.state === "returned" && visit.redoDestinationStepName) {
    return { kind: "redo" as const, targetStepName: visit.redoDestinationStepName };
  }
  if (
    visit.state === "current" &&
    precedingVisits.some((candidate) =>
      candidate.state === "returned" &&
      candidate.redoDestinationStepName === visit.stepName
    )
  ) {
    return { kind: "continue" as const, targetStepName: visit.stepName };
  }
  return null;
}

function formatHistoryAction(action: NonNullable<StepVisitHistoryItem["historyAction"]>) {
  const label = action.kind === "redo" ? "Redo" : action.kind === "undo" ? "Undo" : "Continue";
  return `${label} → ${action.targetStepName}`;
}

export function SequentialStepPicker({
  visits,
  family,
  selectedVisitId,
  onSelectVisit
}: {
  visits: readonly StepVisitHistoryItem[];
  family: string;
  selectedVisitId?: string | null;
  onSelectVisit: (visitId: string) => void;
}) {
  const palette = timelineAccentByFamily[family.trim().toUpperCase()] ?? {
    accent: "#171714",
    selected: "#f5f5f2"
  };
  const pickerStyle = {
    "--step-history-accent": palette.accent,
    "--step-history-selected": palette.selected
  } as CSSProperties;

  const selectVisitByKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = visits.length - 1;
    const nextIndex = event.key === "ArrowDown" || event.key === "ArrowRight"
      ? index === lastIndex ? 0 : index + 1
      : event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? index === 0 ? lastIndex : index - 1
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? lastIndex
            : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextVisit = visits[nextIndex];
    if (!nextVisit) return;
    onSelectVisit(nextVisit.id);
    const buttons = Array.from(event.currentTarget.closest("ol")?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    buttons[nextIndex]?.focus();
  };

  return (
    <ol
      aria-label={visits.length > 1 ? "Step history timeline, swipe for more" : "Step history"}
      className="wafer-step-picker relative"
      style={pickerStyle}
    >
      {visits.map((visit, index) => {
        const isSelected = selectedVisitId === visit.id;
        const wasReturned = visit.state === "returned";
        const historyAction = getHistoryAction(visit, visits.slice(0, index));
        const visitTimeLabel = visit.completedAt
          ? formatVisitTime(visit.completedAt)
          : visit.state === "current"
            ? "Current step"
            : formatVisitTime(visit.startedAt ?? visit.occurredAt);
        const markerColor = wasReturned ? "#a65d22" : palette.accent;
        const rowBackground = wasReturned
          ? isSelected ? "#f5dfca" : "#fff6eb"
          : isSelected ? palette.selected : undefined;

        return (
          <li
            key={visit.id}
            data-visit-state={visit.state}
            className={`wafer-step-picker__item relative pb-1.5 last:pb-0 ${historyAction ? "wafer-step-picker__item--has-action" : ""}`}
          >
            <button
              type="button"
              aria-pressed={isSelected}
              aria-current={isSelected ? "step" : undefined}
              onClick={() => onSelectVisit(visit.id)}
              onKeyDown={(event) => selectVisitByKeyboard(event, index)}
              style={{ backgroundColor: rowBackground }}
              className="wafer-step-picker__button grid min-h-[54px] w-full grid-cols-[32px_minmax(0,1fr)] items-center gap-2 rounded-md px-1 py-1.5 text-left outline-none transition-colors hover:bg-[#f7f7f3] focus-visible:ring-2 focus-visible:ring-[#171714] focus-visible:ring-offset-1 motion-reduce:transition-none"
            >
              <span
                className="wafer-step-picker__marker relative z-10 grid h-7 w-7 place-items-center rounded-full border text-[11px] font-semibold text-[#fffefb]"
                style={{
                  backgroundColor: wasReturned ? markerColor : isSelected ? "#171714" : markerColor,
                  borderColor: wasReturned ? markerColor : isSelected ? "#171714" : markerColor,
                  boxShadow: wasReturned && isSelected ? "0 0 0 2px #171714" : undefined
                }}
                aria-hidden
              >
                {visit.sequence}
              </span>

              <span className="min-w-0">
                <strong className="block truncate text-[13px] font-semibold leading-4 text-[#171714]">
                  {visit.stepName}
                </strong>
                <span className="mt-0.5 block min-w-0 text-[11px] font-medium leading-4 text-[#8a8a83]">
                  <span className="wafer-step-picker__time block min-w-0 truncate">
                    {visitTimeLabel}
                  </span>
                  {historyAction ? (
                    <span
                      title={formatHistoryAction(historyAction)}
                      aria-label={formatHistoryAction(historyAction)}
                      className={[
                        "wafer-step-picker__action mt-0.5 inline-flex max-w-full rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                        historyAction.kind === "redo"
                          ? "bg-[#f3d4b3] text-[#7c3a0b]"
                          : historyAction.kind === "undo"
                            ? "bg-[#e8edf7] text-[#3b557a]"
                            : "bg-[#dff3ef] text-[#14665e]"
                      ].join(" ")}
                    >
                      {formatHistoryAction(historyAction)}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
