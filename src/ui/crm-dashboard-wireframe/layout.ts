import type { WorkflowStageId } from "./types";

export const crmDashboardLayout = {
  shell: {
    maxWidthPx: 1154,
    minHeightPx: 1000
  },
  toolbar: {
    heightPx: 64,
    actionOrder: ["search", "sort", "filter"]
  },
  metricsBand: {
    columns: 4,
    minCardWidthPx: 172
  },
  workflowBoard: {
    columns: ["queued", "poling", "inspection", "complete"] satisfies WorkflowStageId[],
    minColumnWidthPx: 238,
    selectedCardColumn: "poling" satisfies WorkflowStageId
  },
  selectedCard: {
    minWidthPx: 248,
    crampedRowsToExpand: ["Location", "Handler"]
  }
} as const;
