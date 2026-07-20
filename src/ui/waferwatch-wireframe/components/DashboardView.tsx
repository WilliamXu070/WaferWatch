import Link from "next/link";
import { ActivityIcon, ArrowRightIcon, WarningIcon } from "../icons";
import type { DashboardModel, DashboardStat } from "../types";
import { BatchProcessHistoryCard } from "./BatchProcessHistory";
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
    dashboard.plannedBatches.length > 0 ||
    dashboard.reviewQueue.length > 0 ||
    dashboard.batchHistory.length > 0 ||
    dashboard.stats.some((stat) => stat.value !== "0");

  return (
    <div className="dashboard-view flex flex-col">
      <section className="dashboard-overview-band bg-[#f2f2e8] px-4 pb-5 pt-4 md:px-8 md:pb-8">
        <div className="dashboard-overview-row">
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
        </div>
      </section>

      <section className="dashboard-batch-board bg-white px-4 py-5 md:px-8 md:py-7" aria-label="Batch lifecycle">
        <BatchColumn title="Planned Batches" detail="Scheduled work first" items={dashboard.plannedBatches} column="planned" empty="Move selected samples into a step to create a planned batch." />
        <BatchColumn title="Review Queue" detail="Oldest submissions first" items={dashboard.reviewQueue} column="review" empty="Checkpoint submissions needing review appear here." />
        <BatchColumn title="History" detail="Newest resolved work first" items={dashboard.batchHistory} column="history" empty="Approved, redo, and withdrawn work is retained here." />
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

function BatchColumn({
  title,
  detail,
  items,
  column,
  empty
}: {
  title: string;
  detail: string;
  items: readonly DashboardModel["batchHistory"][number][];
  column: "planned" | "review" | "history";
  empty: string;
}) {
  return (
    <section className="dashboard-batch-column" aria-label={title}>
      <header className="dashboard-batch-column-header">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-[#151512]">{title}</h2>
          <p className="mt-1 text-[11px] font-medium text-[#939185]">{detail}</p>
        </div>
        <span className="rounded-full border border-[#e2e0d4] bg-[#fbfbf7] px-2 py-0.5 text-[11px] font-semibold text-[#77756b]">{items.length}</span>
      </header>
      <div className="dashboard-batch-list" tabIndex={0} aria-label={`${title} cards`}>
        {items.length ? items.map((item) => (
          <BatchProcessHistoryCard key={item.id} item={item} column={column} />
        )) : <p className="dashboard-batch-empty">{empty}</p>}
      </div>
    </section>
  );
}
