import { ActivityIcon, ArrowRightIcon, WarningIcon } from "../icons";
import type { DashboardModel, DashboardStat } from "../types";
import { KanbanCard } from "./KanbanCard";
import { ProcessActivityChart } from "./ProcessActivityChart";
import { StepProgressGauge } from "./StepProgressGauge";

const statIcon = {
  activity: ActivityIcon,
  warning: WarningIcon
} as const;

function StatTile({ stat }: { stat: DashboardStat }) {
  const Icon = statIcon[stat.icon];
  return (
    <div className="flex flex-col justify-between border-l border-ww-border pl-6 pr-2">
      <span className="grid h-9 w-9 place-items-center self-start rounded-full border border-ww-border bg-white text-[#4c4a44]">
        <Icon />
      </span>
      <div>
        <p className="text-[40px] font-semibold leading-none tracking-tight text-ww-ink">
          {stat.value}
        </p>
        <p className="mt-2 text-[13px] text-[#8a887f]">{stat.label}</p>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#4c4a44] hover:text-ww-ink"
        >
          View all
          <ArrowRightIcon />
        </button>
      </div>
    </div>
  );
}

export function DashboardView({ dashboard }: { dashboard: DashboardModel }) {
  const { columns } = dashboard;

  return (
    <div className="flex flex-col gap-5 p-6">
      <section className="rounded-2xl border border-ww-border bg-[#f5f5ef] p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_repeat(2,minmax(0,0.6fr))]">
          <ProcessActivityChart activity={dashboard.activity} />
          <StepProgressGauge progress={dashboard.progress} />
          {dashboard.stats.map((stat) => (
            <StatTile key={stat.id} stat={stat} />
          ))}
        </div>
      </section>

      <section aria-label="Workflow board" className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column) => (
          <div key={column.id} className="flex flex-col gap-4">
            <header className="flex items-center gap-2.5">
              <h2 className="text-lg font-semibold text-ww-ink">{column.title}</h2>
              <span className="min-w-[26px] rounded-lg bg-[#e9e9e2] px-2 py-0.5 text-center text-xs font-semibold text-[#5f5d57]">
                {column.count}
              </span>
            </header>
            <div className="flex flex-col gap-4">
              {column.cards.map((card) => (
                <KanbanCard key={card.id} card={card} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
