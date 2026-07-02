import type { ToolbarAction, WorkflowStageId } from "./types";

export const crmDashboardCopy = {
  title: "WaferWatch",
  eyebrow: "CRM Dashboard",
  toolbarPlaceholder: "Search wafers, dies, handlers",
  metricBandLabel: "Dashboard metrics",
  workflowBoardLabel: "Workflow board",
  selectedWaferLabel: "Selected wafer"
} as const;

export const crmDashboardToolbarActions = [
  {
    id: "search",
    label: "Search",
    controlLabel: "Search dashboard"
  },
  {
    id: "sort",
    label: "Sort",
    controlLabel: "Sort workflow cards"
  },
  {
    id: "filter",
    label: "Filter",
    controlLabel: "Filter workflow cards"
  }
] as const satisfies ToolbarAction[];

export const crmDashboardWorkflowCopy: Record<
  WorkflowStageId,
  {
    title: string;
    subtitle: string;
  }
> = {
  queued: {
    title: "Queued",
    subtitle: "Ready for the next process step"
  },
  poling: {
    title: "Poling",
    subtitle: "Active lab work and handler assignment"
  },
  inspection: {
    title: "Inspection",
    subtitle: "Post-process review and imaging"
  },
  complete: {
    title: "Complete",
    subtitle: "Done or ready to archive"
  }
};
