import type { DashboardStatus, WorkflowColumn, WorkflowStageId } from "../types";
import { CrmWorkflowColumn } from "./CrmWorkflowColumn";

type CrmWorkflowBoardProps = {
  columns: readonly WorkflowColumn[];
  selectedWaferId?: string;
  statusClassNameByState: Record<DashboardStatus, string>;
  workflowColumnClassNameByStage: Record<WorkflowStageId, string>;
  selectedCardToneClassName?: string;
};

export function CrmWorkflowBoard({
  columns,
  selectedWaferId,
  statusClassNameByState,
  workflowColumnClassNameByStage,
  selectedCardToneClassName,
}: CrmWorkflowBoardProps): React.JSX.Element {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
      {columns.map((column) => (
        <CrmWorkflowColumn
          key={column.id}
          column={column}
          selectedWaferId={selectedWaferId}
          statusClassNameByState={statusClassNameByState}
          workflowColumnClassName={workflowColumnClassNameByStage[column.id]}
          selectedCardToneClassName={selectedCardToneClassName}
        />
      ))}
    </section>
  );
}
