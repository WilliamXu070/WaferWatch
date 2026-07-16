import {
  CheckCircleIcon,
  HandoffIcon,
  StackIcon,
  TargetIcon,
  TotalStepsIcon,
  WarningIcon
} from "../icons";
import type { FlowStatModel } from "../types";

const flowStatIcon = {
  total: TotalStepsIcon,
  target: TargetIcon,
  check: CheckCircleIcon,
  warning: WarningIcon,
  handoff: HandoffIcon,
  stack: StackIcon
} as const;

export function ProcessFlowStatsBar({ stats }: { stats: readonly FlowStatModel[] }) {
  return (
    <div className="process-flow-stats grid shrink-0 grid-cols-3 divide-x divide-y divide-[#e9e9df] overflow-hidden rounded-xl border border-[#e5e5db] bg-white md:divide-y-0 xl:grid-cols-6">
      {stats.map((stat) => {
        const Icon = flowStatIcon[stat.icon];
        return (
          <div key={stat.id} className="process-flow-stat flex min-w-0 items-center gap-2 px-2 py-1.5 md:px-3 md:py-2">
            <span className="inline-flex shrink-0 items-center text-[#8a887b]" aria-hidden="true">
              <Icon />
            </span>
            <span className="min-w-0">
              <span className="flex items-baseline gap-1.5">
                <span className="text-base font-semibold leading-none text-[#151512] md:text-lg">{stat.value}</span>
                <span className="truncate text-[10px] font-medium text-[#8a887b] md:text-[11px]">{stat.label}</span>
              </span>
              <span className="hidden truncate text-[10px] text-[#9c9a8c] xl:block">{stat.caption}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
