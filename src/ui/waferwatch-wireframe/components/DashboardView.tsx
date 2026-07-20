import Link from "next/link";
import { ActivityIcon, ArrowRightIcon, WarningIcon } from "../icons";
import type { DashboardModel, DashboardStat } from "../types";
import { BatchProcessHistoryCard } from "./BatchProcessHistory";
import { DashboardScrollRow } from "./DashboardScrollRow";
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
        <Link
          href={stat.href}
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#55534a] hover:text-[#151512]"
        >
          View all
          <ArrowRightIcon />
        </Link>
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
  const hasDashboardData =
    dashboard.batchHistory.length > 0 ||
    dashboard.stats.some((stat) => stat.value !== "0");

  return (
    <div className="dashboard-view flex flex-col">
      <section className="dashboard-overview-band bg-[#f2f2e8] px-4 pb-5 pt-4 md:px-8 md:pb-8">
        <DashboardScrollRow label="Dashboard overview" className="dashboard-overview-row">
          <div className="dashboard-overview-item dashboard-overview-item--activity">
            <ProcessActivityChart activity={dashboard.activity} />
          </div>
          <div className="dashboard-overview-item dashboard-overview-item--progress">
            <StepProgressGauge progress={dashboard.progress} />
          </div>
          {dashboard.stats.map((stat) => (
            <div key={stat.id} className="dashboard-overview-item dashboard-overview-item--stat">
              <StatTile stat={stat} />
            </div>
          ))}
        </DashboardScrollRow>
      </section>

      <section className="min-w-0 bg-white px-4 py-5 md:px-8 md:py-7" aria-labelledby="batch-process-history-title">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#99978a]">
              Newest first
            </p>
            <h2 id="batch-process-history-title" className="mt-1 text-[21px] font-semibold tracking-tight text-[#151512]">
              Batch Process History
            </h2>
          </div>
          <p className="text-[12px] font-medium text-[#8a887b]">
            {dashboard.batchHistory.length} recent {dashboard.batchHistory.length === 1 ? "batch" : "batches"}
          </p>
        </header>

        {dashboard.batchHistory.length ? (
          <DashboardScrollRow label="Batch process history" className="dashboard-history-row">
            {dashboard.batchHistory.map((item) => (
              <BatchProcessHistoryCard key={item.id} item={item} />
            ))}
          </DashboardScrollRow>
        ) : hasDashboardData ? (
          <div className="border-y border-dashed border-[#d8d6ca] bg-[#fbfbf7] px-4 py-8 text-left">
            <h3 className="text-[16px] font-semibold text-[#151512]">No completed batch processes yet</h3>
            <p className="mt-1 max-w-[560px] text-[13px] leading-5 text-[#77756b]">
              Complete one or more selected samples in Process Flow to create the first history entry.
            </p>
          </div>
        ) : null}
      </section>

      {!hasDashboardData ? (
        <DashboardEmptyState
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : null}
    </div>
  );
}
