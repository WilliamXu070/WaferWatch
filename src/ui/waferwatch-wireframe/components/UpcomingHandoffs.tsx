import type { HandoffModel } from "../types";

const toneClass: Record<HandoffModel["tone"], string> = {
  neutral: "bg-[#f0efe9] text-[#5f5d57]",
  info: "bg-[#e8eefb] text-[#3f5aa8]",
  warning: "bg-[#fbeae6] text-[#b4593f]",
  positive: "bg-[#e9f3e6] text-[#4c8a3f]"
};

export function UpcomingHandoffs({ handoffs }: { handoffs: readonly HandoffModel[] }) {
  return (
    <section className="rounded-2xl border border-ww-border bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ww-ink">Upcoming handoffs</h2>
          <p className="mt-1 text-sm text-[#8a887f]">
            Next work that changes owner, site, or process stage.
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-ww-border bg-white px-4 py-2 text-sm font-medium text-[#48453f] transition-colors hover:bg-[#f4f4ef]"
        >
          View all
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {handoffs.map((handoff) => (
          <article
            key={handoff.id}
            className="flex items-stretch gap-3 rounded-xl border border-ww-border bg-[#fbfbf8] p-3"
          >
            <span
              className={`grid shrink-0 place-items-center rounded-lg px-3 text-center text-xs font-semibold ${toneClass[handoff.tone]}`}
            >
              {handoff.dayLabel}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ww-ink">
                {handoff.waferCode} · Die {handoff.dieLabel}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="truncate text-xs text-[#7c7a73]">{handoff.note}</p>
                <span className="shrink-0 text-xs text-[#9a988f]">{handoff.activityLabel}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
