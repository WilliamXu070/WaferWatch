import type { CSSProperties } from "react";
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

  return (
    <ol
      aria-label="Step history"
      className="wafer-step-picker relative before:absolute before:bottom-4 before:left-[16px] before:top-4 before:w-px before:bg-[#d9d9d3]"
      style={pickerStyle}
    >
      {visits.map((visit) => {
        const isSelected = selectedVisitId === visit.id;
        const wasReturned = visit.state === "returned";
        const markerColor = wasReturned ? "#a65d22" : palette.accent;

        return (
          <li key={visit.id} className="wafer-step-picker__item relative pb-1.5 last:pb-0">
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectVisit(visit.id)}
              style={{ backgroundColor: isSelected ? palette.selected : undefined }}
              className="wafer-step-picker__button grid min-h-[54px] w-full grid-cols-[32px_minmax(0,1fr)] items-center gap-2 rounded-md px-1 py-1.5 text-left outline-none transition-colors hover:bg-[#f7f7f3] focus-visible:ring-2 focus-visible:ring-[#171714] focus-visible:ring-offset-1 motion-reduce:transition-none"
            >
              <span
                className="relative z-10 grid h-7 w-7 place-items-center rounded-full border text-[11px] font-semibold text-[#fffefb]"
                style={{
                  backgroundColor: isSelected ? "#171714" : markerColor,
                  borderColor: isSelected ? "#171714" : markerColor
                }}
                aria-hidden
              >
                {visit.sequence}
              </span>

              <span className="min-w-0">
                <strong className="block truncate text-[13px] font-semibold leading-4 text-[#171714]">
                  {visit.stepName}
                </strong>
                <span className="mt-0.5 block truncate text-[11px] font-medium leading-4 text-[#8a8a83]">
                  {formatVisitTime(visit.completedAt ?? visit.startedAt ?? visit.occurredAt)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
