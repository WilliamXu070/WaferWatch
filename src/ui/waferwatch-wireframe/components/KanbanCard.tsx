import { CalendarPinIcon, DotsIcon } from "../icons";
import type { WaferCardModel } from "../types";

export function KanbanCard({ card }: { card: WaferCardModel }) {
  const isDark = card.status === "blocked";
  const isSelected = Boolean(card.isSelected);

  return (
    <article
      className={[
        "group rounded-2xl border p-4 transition-all duration-200",
        isDark
          ? "border-[#131311] bg-[#131311] text-[#f0efe8] shadow-[0_20px_34px_-22px_rgba(18,18,15,0.55)]"
          : "border-[#e7e7df] bg-white text-[#151512] hover:-translate-y-px hover:border-[#d4d3c5] hover:shadow-[0_18px_30px_-26px_rgba(30,29,22,0.35)]",
        isSelected ? "ring-2 ring-[#151512] ring-offset-1 ring-offset-white" : ""
      ].join(" ")}
      aria-current={isSelected ? "true" : undefined}
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-semibold">
          {card.waferCode} · Die {card.dieLabel}
        </h3>
        <button
          type="button"
          aria-label="Card options"
          className={isDark ? "text-[#8f8e83] hover:text-white" : "text-[#a3a194] hover:text-[#151512]"}
        >
          <DotsIcon />
        </button>
      </header>

      <p className={`mt-2.5 text-[13px] leading-relaxed ${isDark ? "text-[#c9c8bd]" : "text-[#6b6a5f]"}`}>
        {card.description}
      </p>

      {card.handler ? (
        <p className={`mt-3 text-[13px] ${isDark ? "text-[#c9c8bd]" : "text-[#6b6a5f]"}`}>
          Handler {card.handler}
        </p>
      ) : null}

      <footer className="mt-5 flex items-center justify-between">
        <span
          className={[
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium",
            isDark
              ? "border-[#2b2b26] bg-[#1e1e1a] text-[#d8d7cc]"
              : "border-[#e7e7df] bg-[#f4f4ea] text-[#55534a]"
          ].join(" ")}
        >
          <CalendarPinIcon />
          {card.dueLabel}
        </span>
        <span className={`text-xs ${isDark ? "text-[#8f8e83]" : "text-[#8a887b]"}`}>
          {card.activityLabel}
        </span>
      </footer>
    </article>
  );
}
