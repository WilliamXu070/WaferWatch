import type { StepStatus } from "@/types/database";
import { CalendarPinIcon, DotsIcon } from "../icons";
import type { WaferCardModel } from "../types";

const statusDot: Record<StepStatus, string> = {
  pending: "bg-[#c7c6bd]",
  queued: "bg-[#c7c6bd]",
  running: "bg-[#3f7fd8]",
  blocked: "bg-[#e0803a]",
  completed: "bg-[#4c8a3f]",
  skipped: "bg-[#c7c6bd]",
  failed: "bg-[#cf4d3f]"
};

export function KanbanCard({ card }: { card: WaferCardModel }) {
  const isDark = card.status === "blocked";
  const isSelected = Boolean(card.isSelected);

  return (
    <article
      className={[
        "group rounded-2xl border p-4 transition-shadow",
        isDark
          ? "border-[#181816] bg-[#141414] text-[#f0f0ec] shadow-[0_16px_34px_-24px_rgba(20,20,20,0.6)]"
          : "border-ww-border bg-white text-ww-ink",
        isSelected ? "ring-2 ring-[#3f7fd8] ring-offset-1 ring-offset-ww-bg" : ""
      ].join(" ")}
      aria-current={isSelected ? "true" : undefined}
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <span className={`h-2 w-2 rounded-full ${statusDot[card.status]}`} aria-hidden />
          {card.waferCode} · Die {card.dieLabel}
        </h3>
        <button
          type="button"
          aria-label="Card options"
          className={isDark ? "text-[#9d9d97] hover:text-white" : "text-[#a3a199] hover:text-ww-ink"}
        >
          <DotsIcon />
        </button>
      </header>

      <p className={`mt-2.5 text-[13px] leading-relaxed ${isDark ? "text-[#c7c7c1]" : "text-[#6c6a63]"}`}>
        {card.description}
      </p>

      {card.handler ? (
        <p className={`mt-3 text-[13px] ${isDark ? "text-[#c7c7c1]" : "text-[#6c6a63]"}`}>
          Handler {card.handler}
        </p>
      ) : null}

      <footer className="mt-5 flex items-center justify-between">
        <span
          className={[
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium",
            isDark
              ? "border-[#33332f] bg-[#1f1f1d] text-[#d6d6d0]"
              : "border-ww-border bg-[#f6f6f1] text-[#5f5d57]"
          ].join(" ")}
        >
          <CalendarPinIcon />
          {card.dueLabel}
        </span>
        <span className={`text-xs ${isDark ? "text-[#9d9d97]" : "text-[#8a887f]"}`}>
          {card.activityLabel}
        </span>
      </footer>
    </article>
  );
}
