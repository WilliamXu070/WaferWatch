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
    <div className="dashboard-stat-tile flex min-h-[116px] min-w-0 flex-col justify-between border-b border-[#dcdbca] pb-4 pr-2">
      <span className="grid h-9 w-9 place-items-center self-start rounded-full border border-[#dcdbca] bg-white text-[#4a483f]">
        <Icon />
      </span>
      <div>
        <p className="dashboard-stat-value text-[40px] font-semibold leading-none tracking-tight text-[#151512]">
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

function DashboardEmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-[#d8d6ca] bg-[#fbfbf7] p-10 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98968a]">
        Backend dashboard
      </p>
      <h2 className="mt-2 text-[24px] font-semibold leading-tight text-[#151512]">
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-[560px] text-[14px] leading-6 text-[#6b6a5f]">
        {description}
      </p>
    </section>
  );
}

export function DashboardView({
  dashboard,
  emptyTitle = "No wafer assignments",
  emptyDescription = "Authenticated Supabase data loaded, but no wafer assignments are visible to the current session."
}: {
  dashboard: DashboardModel;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const { columns } = dashboard;
  const hasCards = columns.some((column) => column.cards.length > 0);

  return (
    <div className="dashboard-view flex flex-col">
      <section className="dashboard-overview-band bg-[#f2f2e8] px-4 pb-5 pt-4 md:px-8 md:pb-8">
        <div className="dashboard-overview-grid">
          <ProcessActivityChart activity={dashboard.activity} />
          <StepProgressGauge progress={dashboard.progress} />
          {dashboard.stats.map((stat) => (
            <StatTile key={stat.id} stat={stat} />
          ))}
        </div>
      </section>

      <section
        aria-label="Workflow board"
        className="grid grid-cols-1 gap-6 bg-white px-4 py-5 md:grid-cols-2 md:px-8 md:py-7 xl:grid-cols-4 xl:gap-0 xl:divide-x xl:divide-[#ececdf]"
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

      {!hasCards ? (
        <DashboardEmptyState
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : null}
    </div>
  );
}
