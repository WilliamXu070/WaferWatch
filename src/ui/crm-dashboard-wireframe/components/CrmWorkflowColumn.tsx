import type { DashboardStatus, WorkflowColumn } from "../types";
import { CrmWaferCard } from "./CrmWaferCard";

type CrmWorkflowColumnProps = {
  column: WorkflowColumn;
  selectedWaferId?: string;
  statusClassNameByState: Record<DashboardStatus, string>;
  workflowColumnClassName: string;
  selectedCardToneClassName?: string;
};

export function CrmWorkflowColumn({
  column,
  selectedWaferId,
  statusClassNameByState,
  workflowColumnClassName,
  selectedCardToneClassName,
}: CrmWorkflowColumnProps): React.JSX.Element {
  return (
    <section
      aria-label={column.title}
      className={`flex min-h-[560px] flex-col gap-2.5 rounded-[14px] border border-ww-border bg-[#fcfcf8] p-3 ${workflowColumnClassName}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 text-base font-bold leading-none text-ww-ink">
            {column.title}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#6f6f6a]">{column.subtitle}</p>
        </div>
        <p className="mb-0 mt-0.5 rounded-full border border-ww-border bg-white px-2 py-1 text-[11px] font-semibold text-[#585858]">
          {column.countLabel}
        </p>
      </header>

      <div className="grid gap-2.5">
        {column.cards.map((card) => (
          <CrmWaferCard
            key={card.id}
            card={card}
            isSelected={card.id === selectedWaferId}
            statusClassName={statusClassNameByState[card.status]}
            selectedCardToneClassName={selectedCardToneClassName}
          />
        ))}
      </div>
    </section>
  );
}
