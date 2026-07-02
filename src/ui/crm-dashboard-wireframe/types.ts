export type FigmaWireframeSource = {
  fileName: string;
  fileKey: string;
  pageName: string;
  nodeId: string;
  frameName: string;
  frameSize: {
    width: number;
    height: number;
  };
  url: string;
};

export type DashboardStatus = "queued" | "active" | "blocked" | "inspection" | "complete";

export type WorkflowStageId = "queued" | "poling" | "inspection" | "complete";

export type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  delta?: string;
  tone: "neutral" | "attention" | "positive" | "warning";
};

export type ToolbarAction = {
  id: "search" | "sort" | "filter";
  label: string;
  controlLabel: string;
};

export type WaferCardMetaRow = {
  label: string;
  value: string;
};

export type WireframeWaferCard = {
  id: string;
  waferCode: string;
  dieLabel: string;
  status: DashboardStatus;
  owner: string;
  location: string;
  handler: string;
  dueLabel: string;
  meta: readonly WaferCardMetaRow[];
  isSelected?: boolean;
};

export type WorkflowColumn = {
  id: WorkflowStageId;
  title: string;
  subtitle: string;
  countLabel: string;
  cards: readonly WireframeWaferCard[];
};

export type SelectedWaferPanel = {
  waferId: string;
  title: string;
  status: DashboardStatus;
  rows: readonly WaferCardMetaRow[];
  nextAction: string;
};

export type CrmDashboardWireframeModel = {
  metrics: readonly DashboardMetric[];
  toolbarActions: readonly ToolbarAction[];
  workflowColumns: readonly WorkflowColumn[];
  selectedWafer: SelectedWaferPanel;
};
