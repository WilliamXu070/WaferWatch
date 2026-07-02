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
    <div className="grid grid-cols-2 divide-x divide-ww-border rounded-2xl border border-ww-border bg-white sm:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat) => {
        const Icon = flowStatIcon[stat.icon];
        return (
          <div key={stat.id} className="flex flex-col gap-2 px-5 py-4">
            <span className="inline-flex items-center gap-2 text-[12px] font-medium text-[#8a887f]">
              <Icon />
              {stat.label}
            </span>
            <span className="text-2xl font-semibold leading-none text-ww-ink">{stat.value}</span>
            <span className="text-[11px] text-[#9a988f]">{stat.caption}</span>
          </div>
        );
      })}
    </div>
  );
}
