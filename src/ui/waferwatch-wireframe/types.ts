import type { Json, StepStatus } from "@/types/database";
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
 * `ProcessCalendarLocation`) so the wireframe models stay faithful to what the
 * live Supabase queries return. The wireframe re-skins chrome only; the flow and
 * calendar 2D surfaces are the real `ProcessFlowDiagram` / `ProcessCalendarBoard`.
 */

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

export type BatchProcessHistoryStatus =
  | "planned"
  | "awaiting_review"
  | "approved"
  | "redo"
  | "withdrawn"
  | "mixed";

export type BatchProcessHistorySample = {
  attemptId: string;
  label: string;
  status: Exclude<BatchProcessHistoryStatus, "mixed">;
};

export type BatchProcessHistoryItem = {
  id: string;
  batchId: string | null;
  processStepId: string;
  processName: string;
  submittedAt: string;
  operatorName: string;
  note: string | null;
  status: BatchProcessHistoryStatus;
  samples: readonly BatchProcessHistorySample[];
  scheduledStartAt?: string | null;
  location?: string | null;
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
  plannedBatches: readonly BatchProcessHistoryItem[];
  reviewQueue: readonly BatchProcessHistoryItem[];
  batchHistory: readonly BatchProcessHistoryItem[];
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
  process_step_name_snapshot: string | null;
  manual_action: string | null;
  description: string | null;
  revision: number;
  wafer_id: string | null;
  wafer: { id: string; wafer_code: string } | null;
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

export type WaferDisplayMode = "diced" | "undiced";

export type DiePolingParameterField =
  | "voltage"
  | "width"
  | "pulseCount"
  | "postPulseVoltage"
  | "postPulseWidth"
  | "peakVoltage"
  | "pulseDuration"
  | "description";

export type DiePolingCellValues = Partial<Record<DiePolingParameterField, string>>;

export type DiePolingRows = Record<string, Record<string, DiePolingCellValues>>;

export type WaferStatusStepParameterValue = {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "select";
  value: string | number | boolean | null;
  unit: string;
  notes: string;
  scope: "global" | "local";
};

export type WaferStatusStepParameterRecord = {
  id: string;
  processEventId?: string | null;
  historyVisitId?: string | null;
  revision: number;
  movementMutationId: string;
  recordedAt: string;
  recordedById: string | null;
  recordedByName: string | null;
  notes: string | null;
  values: WaferStatusStepParameterValue[];
};

export type WaferStatusHistoryCorrection = {
  id: string;
  kind: "insert" | "remove";
  visitId: string;
  targetVisitId: string | null;
  anchorVisitId: string | null;
  placement: "before" | "after" | null;
  stepId: string | null;
  stepName: string | null;
  processArea: string | null;
  completedAt: string | null;
  occurredAt: string;
  reason: string | null;
  actor: WaferStatusTimelineActor;
};

export type WaferStatusProcessStepModel = {
  id: string;
  name: string;
  processArea: string;
  executionMode: "main" | "anytime";
  stepOrder: number;
  status: StepStatus | "pending";
  executionId: string | null;
  noteAuthorId: string | null;
  noteAuthorName: string | null;
  runNote: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  parametersSchema?: Json;
  parameterRecords?: WaferStatusStepParameterRecord[];
  branchLabel?: string | null;
};

export type WaferStatusRevertEvent = {
  id: string;
  fromStepId: string;
  toStepId: string;
  occurredAt: string;
  reason: string | null;
};

export type WaferStatusTimelineActor = {
  id: string | null;
  name: string | null;
};

export type WaferStatusTimelineInheritance = {
  waferId: string;
  waferCode: string;
};

export type WaferStatusCheckpointSubmission = {
  id: string;
  occurredAt: string;
  actor: WaferStatusTimelineActor;
  note: string | null;
};

export type WaferStatusCheckpointWithdrawal = {
  id: string;
  occurredAt: string;
  actor: WaferStatusTimelineActor;
  note: string | null;
};

export type WaferStatusCheckpointDecision = {
  id: string;
  outcome: "approve" | "redo";
  occurredAt: string;
  actor: WaferStatusTimelineActor;
  note: string | null;
  destinationStepId: string | null;
  destinationStepName: string | null;
  supersedesDecisionId: string | null;
  isEffective: boolean;
};

export type WaferStatusCheckpointAttemptEntry = {
  kind: "attempt";
  id: string;
  inheritedFromParent?: WaferStatusTimelineInheritance;
  stepId: string;
  stepName: string;
  attemptNumber: number;
  state: "in_progress" | "awaiting_checkpoint" | "approved" | "redo_required" | "withdrawn";
  occurredAt: string;
  startedAt: string | null;
  submission: WaferStatusCheckpointSubmission | null;
  withdrawals: readonly WaferStatusCheckpointWithdrawal[];
  decisions: readonly WaferStatusCheckpointDecision[];
  effectiveDecision: WaferStatusCheckpointDecision | null;
};

export type WaferStatusLegacyTimelineEntry = {
  kind: "legacy_transition";
  id: string;
  inheritedFromParent?: WaferStatusTimelineInheritance;
  sourceEventId: string | null;
  legacyType: "step_execution" | "wafer_step_moved" | "wafer_step_reverted" | "checkpoint_step_entered";
  occurredAt: string;
  actor: WaferStatusTimelineActor;
  note: string | null;
  fromStepId: string | null;
  fromStepName: string | null;
  toStepId: string | null;
  toStepName: string | null;
  recordedStatus: string | null;
};

export type WaferStatusCheckpointHistoryEntry =
  | WaferStatusCheckpointAttemptEntry
  | WaferStatusLegacyTimelineEntry;

export type WaferStatusTileModel = {
  id: string;
  projectId: string;
  waferId: string;
  assignmentId?: string | null;
  historyRevision?: number;
  code: string;
  family: string;
  dieLabel: string;
  stepLabel: string;
  status: WaferTileStatus;
  waferStateName: string;
  appearance?: {
    attachmentId: string;
    imageUrl: string | null;
    version: number;
  } | null;
  legacyNote?: string | null;
  notesSurfaceValue?: string | null;
  notesSurfaceValuesByStepId?: Record<string, string | null>;
  currentStepId?: string | null;
  currentStepExecutionId?: string | null;
  processSteps?: readonly WaferStatusProcessStepModel[];
  revertHistory?: readonly WaferStatusRevertEvent[];
  checkpointHistory?: readonly WaferStatusCheckpointHistoryEntry[];
  historyCorrections?: readonly WaferStatusHistoryCorrection[];
  mode?: WaferDisplayMode;
  isUndiced?: boolean;
  isSelected?: boolean;
  diePolingParameters?: Record<string, DiePolingRows>;
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
