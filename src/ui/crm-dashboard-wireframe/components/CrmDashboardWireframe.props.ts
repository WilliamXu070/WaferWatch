import type {
  CrmDashboardWireframeModel,
  DashboardStatus,
  WorkflowStageId,
} from "../types";

export type CrmDashboardWireframeProps = {
  model: CrmDashboardWireframeModel;
  statusClassNameByState: Record<DashboardStatus, string>;
  workflowColumnClassNameByStage: Record<WorkflowStageId, string>;
  selectedCardClassName?: string;
  shellClassName?: string;
  shellAriaLabel?: string;
};
