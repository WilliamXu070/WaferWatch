import type { StepStatus } from "@/types/database";
import type { ProcessCalendarLocation } from "@/features/calendar/queries";
export type {
  WireframeCalendarDto,
  WireframeDashboardCardDto,
  WireframeDashboardDto,
  WireframeDashboardStageId,
  WireframeEmptyStateDto,
  WireframeProcessFlowDto,
  WireframeProcessFlowNodeDto,
  WireframeProcessFlowWaferDto,
  WireframeWaferViewerDto,
  WireframeWaferViewerFamilyDto,
  WireframeWaferViewerItemDto
} from "@/features/wireframe/types";

/**
 * View-model types for the WaferWatch wireframe preview.
 *
 * These intentionally re-use the real backend enums/shapes (`StepStatus`,
 * `ProcessCalendarLocation`) so the static mock data stays faithful to what the
 * live Supabase queries return. The wireframe re-skins chrome only; the flow and
 * calendar 2D surfaces are the real `ProcessFlowDiagram` / `ProcessCalendarBoard`.
 */

export type WorkflowStageId = "queued" | "poling" | "inspection" | "complete";

/** Mirrors the meaningful fields of `ProcessDashboardWaferState`. */
export type WaferCardModel = {
  id: string;
  /** e.g. "ALPHA-04" (waferCode) */
  waferCode: string;
  /** e.g. "A7" (dieLabel) */
  dieLabel: string;
  /** Free-text status/handoff note (maps to a text_surface / step note). */
  description: string;
  /** Current step status from the real StepStatus enum. */
  status: StepStatus;
  /** Due / schedule chip label, e.g. "Today", "10 Mar", "No date". */
  dueLabel: string;
  /** Count chip, e.g. "2 notes" or "4 logs". */
  activityLabel: string;
  /** Optional handler display name (currentHandlerName). */
  handler?: string;
  isSelected?: boolean;
};

export type WorkflowColumnModel = {
  id: WorkflowStageId;
  title: string;
  count: number;
  cards: readonly WaferCardModel[];
};

export type ActivityBar = {
  label: string;
  value: number;
  /** Secondary/comparison series (prior period). */
  compareValue: number;
};

export type DashboardStat = {
  id: string;
  value: string;
  label: string;
  icon: "activity" | "warning";
  href: string;
};

export type DashboardModel = {
  activity: {
    title: string;
    max: number;
    bars: readonly ActivityBar[];
  };
  progress: {
    title: string;
    percent: number;
    caption: string;
    footer: string;
  };
  stats: readonly DashboardStat[];
  columns: readonly WorkflowColumnModel[];
};

/** Mirrors the `process_steps` rows that feed `ProcessFlowDiagram`. */
export type FlowStepModel = {
  id: string;
  name: string;
  process_area: string;
  step_order: number;
  status: StepStatus | "active";
  wafers?: readonly {
    assignmentId: string;
    waferCode: string;
    dieLabel: string;
    currentStepStatus: StepStatus | null;
  }[];
  role?: "normal" | "start" | "end";
  icon?: "start" | "file" | "droplet" | "scan" | "etch" | "characterization";
  x?: number;
  y?: number;
  nextStepIds?: readonly string[];
  returnStepIds?: readonly string[];
};

export type FlowStatModel = {
  id: string;
  icon:
    | "total"
    | "target"
    | "check"
    | "warning"
    | "handoff"
    | "stack";
  label: string;
  value: string;
  caption: string;
};

export type FlowModel = {
  title: string;
  subtitle: string;
  steps: readonly FlowStepModel[];
  stats: readonly FlowStatModel[];
};

/** Mirrors `ProcessCalendarPersonOption`. */
export type CalendarPersonModel = {
  id: string;
  display_name: string;
};

/** Mirrors `ProcessCalendarEventView` (shape passed into the real board). */
export type CalendarEventModel = {
  id: string;
  process_template_id: string;
  location: ProcessCalendarLocation;
  starts_at: string;
  ends_at: string;
  process_step_id: string | null;
  manual_action: string | null;
  description: string | null;
  people: CalendarPersonModel[];
};

export type CalendarSiteModel = {
  id: ProcessCalendarLocation;
  name: string;
  region: string;
};

export type HandoffModel = {
  id: string;
  dayLabel: string;
  waferCode: string;
  dieLabel: string;
  note: string;
  activityLabel: string;
  tone: "neutral" | "info" | "warning" | "positive";
};

export type CalendarModel = {
  title: string;
  subtitle: string;
  rangeLabel: string;
  sites: readonly CalendarSiteModel[];
  people: readonly CalendarPersonModel[];
  events: readonly CalendarEventModel[];
  handoffs: readonly HandoffModel[];
};

export type ProcessSummary = {
  id: string;
  name: string;
  version: string;
  activeDieCount: number;
};

export type WaferFamilyStatus = "active" | "paused" | "setup";

export type WaferTileStatus = "litho" | "etch" | "inspection" | "bond" | "test" | "dice" | "queued";

export type WaferStatusTileModel = {
  id: string;
  code: string;
  family: string;
  dieLabel: string;
  stepLabel: string;
  status: WaferTileStatus;
  waferStateName: string;
  isUndiced?: boolean;
  isSelected?: boolean;
};

export type WaferFamilyModel = {
  id: string;
  name: string;
  status: WaferFamilyStatus;
  tiles: readonly WaferStatusTileModel[];
};

export type WaferStatusMetric = {
  id: string;
  label: string;
  value: string;
  tone: "neutral" | "active" | "running" | "yield";
};

export type WaferStatusModel = {
  metrics: readonly WaferStatusMetric[];
  families: readonly WaferFamilyModel[];
};
