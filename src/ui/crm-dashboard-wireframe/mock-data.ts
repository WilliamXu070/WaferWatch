import { crmDashboardToolbarActions, crmDashboardWorkflowCopy } from "./copy";
import type { CrmDashboardWireframeModel, DashboardMetric, WorkflowColumn } from "./types";

export const crmDashboardMetrics = [
  {
    id: "active-wafers",
    label: "Active wafers",
    value: "18",
    delta: "+3 this week",
    tone: "positive"
  },
  {
    id: "blocked",
    label: "Blocked",
    value: "2",
    delta: "Needs handler",
    tone: "attention"
  },
  {
    id: "due-today",
    label: "Due today",
    value: "5",
    delta: "Across 3 labs",
    tone: "warning"
  },
  {
    id: "cycle-median",
    label: "Cycle median",
    value: "6.4d",
    delta: "-0.8d",
    tone: "neutral"
  }
] as const satisfies DashboardMetric[];

export const crmDashboardWorkflowColumns = [
  {
    id: "queued",
    title: crmDashboardWorkflowCopy.queued.title,
    subtitle: crmDashboardWorkflowCopy.queued.subtitle,
    countLabel: "4 wafers",
    cards: [
      {
        id: "ww-alpha-12",
        waferCode: "ALPHA-12",
        dieLabel: "D3",
        status: "queued",
        owner: "Process queue",
        location: "Toronto",
        handler: "Unassigned",
        dueLabel: "Today",
        meta: [
          { label: "Recipe", value: "R2 poling" },
          { label: "Priority", value: "Standard" }
        ]
      },
      {
        id: "ww-alpha-15",
        waferCode: "ALPHA-15",
        dieLabel: "D8",
        status: "queued",
        owner: "Process queue",
        location: "Waterloo",
        handler: "Unassigned",
        dueLabel: "Tomorrow",
        meta: [
          { label: "Recipe", value: "R1 poling" },
          { label: "Priority", value: "Low" }
        ]
      }
    ]
  },
  {
    id: "poling",
    title: crmDashboardWorkflowCopy.poling.title,
    subtitle: crmDashboardWorkflowCopy.poling.subtitle,
    countLabel: "6 wafers",
    cards: [
      {
        id: "ww-alpha-17",
        waferCode: "ALPHA-17",
        dieLabel: "D6",
        status: "blocked",
        owner: "Lab handoff",
        location: "McMaster poling station",
        handler: "Waiting on voltage recipe approval",
        dueLabel: "Blocked 2h",
        isSelected: true,
        meta: [
          { label: "Recipe", value: "R2 high field" },
          { label: "Last update", value: "10:42 AM" }
        ]
      },
      {
        id: "ww-beta-03",
        waferCode: "BETA-03",
        dieLabel: "D2",
        status: "active",
        owner: "N. Patel",
        location: "Waterloo",
        handler: "Manual probe",
        dueLabel: "In progress",
        meta: [
          { label: "Recipe", value: "R4 sweep" },
          { label: "ETA", value: "45 min" }
        ]
      }
    ]
  },
  {
    id: "inspection",
    title: crmDashboardWorkflowCopy.inspection.title,
    subtitle: crmDashboardWorkflowCopy.inspection.subtitle,
    countLabel: "5 wafers",
    cards: [
      {
        id: "ww-gamma-09",
        waferCode: "GAMMA-09",
        dieLabel: "D4",
        status: "inspection",
        owner: "A. Chen",
        location: "Toronto imaging",
        handler: "Optical inspection",
        dueLabel: "Today",
        meta: [
          { label: "Images", value: "12 pending" },
          { label: "Review", value: "Required" }
        ]
      }
    ]
  },
  {
    id: "complete",
    title: crmDashboardWorkflowCopy.complete.title,
    subtitle: crmDashboardWorkflowCopy.complete.subtitle,
    countLabel: "3 wafers",
    cards: [
      {
        id: "ww-alpha-08",
        waferCode: "ALPHA-08",
        dieLabel: "D1",
        status: "complete",
        owner: "Archive queue",
        location: "Toronto",
        handler: "Completed",
        dueLabel: "Done",
        meta: [
          { label: "Cycle time", value: "5.8d" },
          { label: "Yield", value: "92%" }
        ]
      }
    ]
  }
] as const satisfies WorkflowColumn[];

export const crmDashboardSelectedWafer = {
  waferId: "ww-alpha-17",
  title: "ALPHA-17 / D6",
  status: "blocked",
  rows: [
    { label: "Stage", value: "Poling" },
    { label: "Location", value: "McMaster poling station" },
    { label: "Handler", value: "Waiting on voltage recipe approval" },
    { label: "Due", value: "Blocked 2h" }
  ],
  nextAction: "Resolve recipe approval before continuing poling."
} as const;

export const crmDashboardWireframeModel = {
  metrics: crmDashboardMetrics,
  toolbarActions: crmDashboardToolbarActions,
  workflowColumns: crmDashboardWorkflowColumns,
  selectedWafer: crmDashboardSelectedWafer
} as const satisfies CrmDashboardWireframeModel;
