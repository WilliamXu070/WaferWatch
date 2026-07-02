import type { DashboardMetric, DashboardStatus, WorkflowStageId } from "./types";

export const crmDashboardStyles = {
  shell:
    "mx-auto flex w-full max-w-shell flex-col gap-5 bg-ww-bg px-4 py-5 text-ww-ink md:px-6",
  toolbar:
    "flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-panel border border-ww-border bg-white px-4 py-3 shadow-panel",
  toolbarTitle: "flex min-w-0 flex-col gap-0.5",
  eyebrow: "text-[11px] font-semibold uppercase tracking-[0.16em] text-ww-muted",
  title: "text-xl font-semibold leading-tight tracking-tight text-ww-ink",
  toolbarActions: "flex flex-wrap items-center gap-2",
  searchInput:
    "min-h-10 min-w-[220px] rounded-lg border border-ww-border bg-white px-3 text-sm text-ww-ink outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200",
  controlButton:
    "inline-flex min-h-10 items-center justify-center rounded-lg border border-ww-border bg-white px-3 text-sm font-medium text-ww-ink transition hover:bg-zinc-100 active:scale-[0.98]",
  metricsBand: "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4",
  metricCard: "rounded-xl border border-ww-border bg-white p-4 shadow-panel",
  metricLabel: "text-xs font-medium uppercase tracking-[0.08em] text-ww-muted",
  metricValue: "mt-2 text-[1.375rem] font-semibold leading-none tracking-tight text-ww-ink",
  metricDelta: "mt-2 text-sm text-ww-muted",
  workflowBoard: "grid grid-cols-1 gap-3 lg:grid-cols-4",
  workflowColumn:
    "flex min-h-[420px] flex-col gap-3 rounded-panel border border-ww-border bg-white p-3 shadow-panel",
  workflowColumnHeader: "flex items-start justify-between gap-3",
  workflowColumnTitle: "text-sm font-semibold text-ww-ink",
  workflowColumnSubtitle: "mt-1 text-xs leading-relaxed text-ww-muted",
  workflowCount:
    "shrink-0 rounded-full border border-ww-border bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-ww-muted",
  waferCard:
    "grid gap-2 rounded-lg border border-ww-border bg-white p-3 text-left shadow-[0_12px_26px_-22px_rgba(20,20,20,0.45)] transition hover:-translate-y-[1px]",
  waferCardSelected:
    "border-zinc-900 bg-zinc-900 text-zinc-50 shadow-[0_16px_34px_-18px_rgba(20,20,20,0.55)]",
  waferCardHeader: "flex items-start justify-between gap-3",
  waferCardTitle: "min-w-0 text-sm font-semibold leading-snug",
  waferCardMeta: "grid gap-1 text-xs leading-relaxed text-ww-muted",
  waferCardSelectedMeta: "text-zinc-300",
  statusChip:
    "inline-flex min-h-6 shrink-0 items-center rounded-full border px-2 text-[11px] font-semibold",
  selectedPanel: "rounded-panel border border-ww-border bg-white p-4 shadow-panel",
  selectedPanelTitle: "text-base font-semibold leading-tight text-ww-ink",
  selectedPanelRows: "mt-3 grid gap-2",
  selectedPanelRow: "grid grid-cols-[88px_1fr] gap-3 text-sm",
  selectedPanelLabel: "text-xs font-semibold uppercase tracking-[0.08em] text-ww-muted",
  selectedPanelValue: "min-w-0 text-ww-ink"
} as const;

export const crmDashboardMetricToneClassName: Record<DashboardMetric["tone"], string> = {
  neutral: "border-ww-border",
  attention: "border-amber-300 bg-amber-50",
  positive: "border-emerald-300 bg-emerald-50",
  warning: "border-lime-300 bg-lime-50"
};

export const crmDashboardStatusClassName: Record<DashboardStatus, string> = {
  queued: "border-zinc-300 bg-zinc-100 text-zinc-700",
  active: "border-lime-300 bg-lime-100 text-lime-800",
  blocked: "border-amber-300 bg-amber-100 text-amber-900",
  inspection: "border-sky-300 bg-sky-100 text-sky-800",
  complete: "border-emerald-300 bg-emerald-100 text-emerald-800"
};

export const crmDashboardWorkflowColumnClassName: Record<WorkflowStageId, string> = {
  queued: "bg-zinc-50",
  poling: "bg-lime-50",
  inspection: "bg-sky-50",
  complete: "bg-emerald-50"
};
