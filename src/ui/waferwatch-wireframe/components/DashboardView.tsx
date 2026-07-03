import { ActivityIcon, ArrowRightIcon, WarningIcon } from "../icons";
import { dashboardModel } from "../mock-data";
import type { DashboardStat } from "../types";
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
    <div className="flex flex-col justify-between border-l border-[#dcdbca] pl-6 pr-2">
      <span className="grid h-9 w-9 place-items-center self-start rounded-full border border-[#dcdbca] bg-white text-[#4a483f]">
        <Icon />
      </span>
      <div>
        <p className="text-[40px] font-semibold leading-none tracking-tight text-[#151512]">
          {stat.value}
        </p>
        <p className="mt-2 text-[13px] text-[#8a887b]">{stat.label}</p>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#55534a] hover:text-[#151512]"
        >
          View all
          <ArrowRightIcon />
        </button>
      </div>
    </div>
  );
}

export function DashboardView() {
  const { columns } = dashboardModel;

  return (
    <div className="flex flex-col">
      <section className="bg-[#f2f2e8] px-8 pb-8 pt-4">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_repeat(2,minmax(0,0.6fr))]">
          <ProcessActivityChart activity={dashboardModel.activity} />
          <StepProgressGauge progress={dashboardModel.progress} />
          {dashboardModel.stats.map((stat) => (
            <StatTile key={stat.id} stat={stat} />
          ))}
        </div>
      </section>

      <section
        aria-label="Workflow board"
        className="grid grid-cols-1 gap-6 bg-white px-8 py-7 md:grid-cols-2 xl:grid-cols-4 xl:gap-0 xl:divide-x xl:divide-[#ececdf]"
      >
        {columns.map((column) => (
          <div key={column.id} className="flex flex-col gap-4 xl:px-6 xl:first:pl-0 xl:last:pr-0">
            <header className="flex items-center gap-2.5">
              <h2 className="text-[19px] font-semibold leading-none tracking-tight text-[#151512]">{column.title}</h2>
              <span className="min-w-[26px] rounded-lg bg-[#efefe3] px-1.5 py-0.5 text-center text-[12px] font-semibold text-[#55534a]">
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
