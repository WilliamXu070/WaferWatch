import type { DashboardStatus, WorkflowStageId } from "./types";

export const crmDashboardTokens = {
  radius: {
    shell: "20px",
    panel: "14px",
    control: "8px",
    card: "8px"
  },
  spacing: {
    shellPaddingX: "24px",
    shellPaddingY: "20px",
    toolbarGap: "12px",
    columnGap: "14px",
    cardGap: "10px"
  },
  typography: {
    title: "1.25rem",
    section: "0.875rem",
    label: "0.75rem",
    body: "0.8125rem",
    metric: "1.375rem"
  },
  color: {
    canvas: "#f4f4f1",
    panel: "#fbfbf8",
    raised: "#ffffff",
    ink: "#141414",
    muted: "#5f5f5a",
    faint: "#85857d",
    border: "#d6d6d0",
    selected: "#1f2421",
    selectedInk: "#f7f7f2",
    accent: "#58cc02"
  }
} as const;

export const crmDashboardStatusTone: Record<
  DashboardStatus,
  {
    label: string;
    chipClassName: string;
    boardClassName: string;
  }
> = {
  queued: {
    label: "Queued",
    chipClassName: "border-zinc-300 bg-zinc-100 text-zinc-700",
    boardClassName: "bg-zinc-50"
  },
  active: {
    label: "Active",
    chipClassName: "border-lime-300 bg-lime-100 text-lime-800",
    boardClassName: "bg-lime-50"
  },
  blocked: {
    label: "Blocked",
    chipClassName: "border-amber-300 bg-amber-100 text-amber-900",
    boardClassName: "bg-amber-50"
  },
  inspection: {
    label: "Inspection",
    chipClassName: "border-sky-300 bg-sky-100 text-sky-800",
    boardClassName: "bg-sky-50"
  },
  complete: {
    label: "Complete",
    chipClassName: "border-emerald-300 bg-emerald-100 text-emerald-800",
    boardClassName: "bg-emerald-50"
  }
};

export const crmDashboardStageTone: Record<
  WorkflowStageId,
  {
    label: string;
    accentClassName: string;
  }
> = {
  queued: {
    label: "Queued",
    accentClassName: "text-zinc-700"
  },
  poling: {
    label: "Poling",
    accentClassName: "text-lime-800"
  },
  inspection: {
    label: "Inspection",
    accentClassName: "text-sky-800"
  },
  complete: {
    label: "Complete",
    accentClassName: "text-emerald-800"
  }
};
