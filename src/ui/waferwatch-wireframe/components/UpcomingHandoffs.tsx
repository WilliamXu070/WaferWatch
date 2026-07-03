import type { HandoffModel } from "../types";

const toneClass: Record<HandoffModel["tone"], string> = {
  neutral: "bg-[#f2f2e8] text-[#55534a]",
  info: "bg-[#eef1f4] text-[#64798c]",
  warning: "bg-[#faf6ea] text-[#a8863f]",
  positive: "bg-[#eef2e8] text-[#6b7f57]"
};

export function UpcomingHandoffs({ handoffs }: { handoffs: readonly HandoffModel[] }) {
  return (
    <section className="rounded-3xl border border-[#e5e5db] bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#151512]">Upcoming handoffs</h2>
          <p className="mt-1 text-sm text-[#8a887b]">
            Next work that changes owner, site, or process stage.
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-[#e0dfd2] bg-white px-4 py-2 text-sm font-medium text-[#4a483f] transition-colors hover:bg-[#f6f5ec]"
        >
          View all
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {handoffs.map((handoff) => (
          <article
            key={handoff.id}
            className="flex items-stretch gap-3 rounded-xl border border-[#e7e7df] bg-[#fbfbf6] p-3"
          >
            <span
              className={`grid shrink-0 place-items-center rounded-lg px-3 text-center text-xs font-semibold ${toneClass[handoff.tone]}`}
            >
              {handoff.dayLabel}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#151512]">
                {handoff.waferCode} · Die {handoff.dieLabel}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="truncate text-xs text-[#6b6a5f]">{handoff.note}</p>
                <span className="shrink-0 text-xs text-[#9c9a8c]">{handoff.activityLabel}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
