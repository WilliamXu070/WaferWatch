import type { DashboardModel } from "../types";

const yTicks = [30, 20, 10, 0];

export function ProcessActivityChart({ activity }: { activity: DashboardModel["activity"] }) {
  const { bars, max, title } = activity;

  return (
    <section aria-label={title} className="dashboard-activity-card flex min-w-0 flex-col">
      <h2 className="text-[15px] font-semibold text-[#151512]">{title}</h2>

      <div className="mt-5 flex min-w-0 gap-3">
        <div className="flex flex-col justify-between py-1 text-[11px] text-[#9c9a8c]">
          {yTicks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0 flex flex-col justify-between">
            {yTicks.map((tick) => (
              <span key={tick} className="h-px w-full bg-[#e6e5d8]" />
            ))}
          </div>

          <div className="dashboard-activity-plot relative flex h-[188px] items-end justify-between gap-4 px-1">
            {bars.map((bar) => (
              <div key={bar.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex h-full w-full items-end justify-center gap-1.5">
                  <div
                    className="w-[26%] rounded-t-[3px] bg-[#141412]"
                    style={{ height: `${(bar.value / max) * 100}%` }}
                    aria-label={`${bar.label} ${bar.value}`}
                  />
                  <div
                    className="w-[26%] rounded-t-[3px] border border-[#deddd0] bg-white"
                    style={{ height: `${(bar.compareValue / max) * 100}%` }}
                    aria-hidden
                  />
                </div>
                <span className="text-xs font-semibold text-[#6b6a5f]">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
