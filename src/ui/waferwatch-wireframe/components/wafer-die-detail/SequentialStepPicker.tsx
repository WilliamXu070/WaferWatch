import { Check, CornerDownLeft } from "lucide-react";
import type { StepVisitHistoryItem } from "./stepVisitHistoryModel";

function formatVisitTime(value: string | null) {
  if (!value) return "Time not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function SequentialStepPicker({
  visits,
  selectedVisitId,
  onSelectVisit
}: {
  visits: readonly StepVisitHistoryItem[];
  selectedVisitId?: string | null;
  onSelectVisit: (visitId: string) => void;
}) {
  return (
    <ol
      aria-label="Step history"
      className="relative before:absolute before:bottom-6 before:left-[17px] before:top-6 before:w-px before:bg-[#ddddd6]"
    >
      {visits.map((visit) => {
        const isSelected = selectedVisitId === visit.id;
        const isCurrent = visit.state === "current";
        const wasReturned = visit.state === "returned";

        return (
          <li key={visit.id} className="relative pb-2 last:pb-0">
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectVisit(visit.id)}
              className={`grid min-h-20 w-full grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-lg px-1 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#171714] focus-visible:ring-offset-2 motion-reduce:transition-none ${
                isSelected ? "bg-[#f0f0eb]" : "hover:bg-[#f7f7f3]"
              }`}
            >
              <span
                className={`relative z-10 grid h-9 w-9 place-items-center rounded-full border text-[12px] font-bold ${
                  isCurrent
                    ? "border-[#171714] bg-[#171714] text-white"
                    : wasReturned
                      ? "border-[#b97736] bg-[#fff7ed] text-[#94501a]"
                      : "border-[#4f7f56] bg-[#4f7f56] text-white"
                }`}
                aria-hidden
              >
                {isCurrent ? visit.sequence : wasReturned ? <CornerDownLeft size={15} /> : <Check size={15} />}
              </span>

              <span className="min-w-0 py-0.5">
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <strong className="text-[14px] font-semibold text-[#171714]">{visit.stepName}</strong>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                    isCurrent
                      ? "bg-[#e9e9e4] text-[#4d4d47]"
                      : wasReturned
                        ? "bg-[#fff0df] text-[#94501a]"
                        : "bg-[#eaf4ec] text-[#35613b]"
                  }`}>
                    {isCurrent ? "Current" : wasReturned ? "Returned" : "Completed"}
                  </span>
                </span>
                <span className="mt-1 block text-[12px] text-[#74746d]">
                  {visit.processArea || "Process step"}
                  {visit.visitNumber > 1 ? ` · Visit ${visit.visitNumber}` : ""}
                </span>
                <span className="mt-1.5 block text-[11px] font-medium text-[#8a8a83]">
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
