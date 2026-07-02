import type { DashboardModel } from "../types";

const yTicks = [30, 20, 10, 0];

export function ProcessActivityChart({ activity }: { activity: DashboardModel["activity"] }) {
  const { bars, max, title } = activity;

  return (
    <section aria-label={title} className="flex flex-col">
      <h2 className="text-[15px] font-semibold text-ww-ink">{title}</h2>

      <div className="mt-5 flex gap-3">
        <div className="flex flex-col justify-between py-1 text-[11px] text-[#9a988f]">
          {yTicks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>

        <div className="relative flex-1">
          <div className="absolute inset-0 flex flex-col justify-between">
            {yTicks.map((tick) => (
              <span key={tick} className="h-px w-full bg-[#ecebe4]" />
            ))}
          </div>

          <div className="relative flex h-[188px] items-end justify-between gap-4 px-1">
            {bars.map((bar) => (
              <div key={bar.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-[188px] w-full items-end justify-center gap-1.5">
                  <div
                    className="w-[26%] rounded-t-[3px] bg-ww-ink"
                    style={{ height: `${(bar.value / max) * 100}%` }}
                    aria-label={`${bar.label} ${bar.value}`}
                  />
                  <div
                    className="w-[26%] rounded-t-[3px] border border-[#dcdbd3] bg-[#f0efe9]"
                    style={{ height: `${(bar.compareValue / max) * 100}%` }}
                    aria-hidden
                  />
                </div>
                <span className="text-xs font-semibold text-[#6f6d66]">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
