import type {
  FabricationStatus,
  Json,
  ProcessStep,
  StepStatus,
  TextSurface,
  Wafer,
  WaferLot
} from "@/types/database";
import type {
  ProcessCalendarEventView,
  ProcessCalendarLocation,
  ProcessCalendarPersonOption
} from "@/features/calendar/queries";
import type {
  ProcessDashboardData,
  ProcessDashboardWaferState
} from "@/features/process-flows/queries";

export type WireframeEmptyStateKind =
  | "no-process"
  | "no-dashboard-cards"
  | "no-flow-steps"
  | "no-calendar-events"
  | "no-wafers";

export type WireframeEmptyStateDto = {
  kind: WireframeEmptyStateKind;
  title: string;
  description: string;
  actionLabel?: string;
  href?: string;
};

export type WireframeShellTeamMemberDto = {
  id: string;
  initials: string;
  name: string;
  role: string;
};

export type WireframeShellDto = {
  currentProcess: {
    id: string;
    name: string;
    version: string;
    activeDieCount: number;
  } | null;
  processes: Array<{
    id: string;
    name: string;
    version: string;
    activeDieCount: number;
  }>;
  calendarEventCount: number;
  teamMembers: WireframeShellTeamMemberDto[];
};

export type WireframeDashboardStageId =
  | "queued"
  | "poling"
  | "inspection"
  | "complete";

export type WireframeDashboardSummaryCardDto = {
  id: string;
  label: string;
  value: string;
  tone: "neutral" | "active" | "warning" | "success";
  href?: string;
};

export type WireframeDashboardActivityBarDto = {
  label: string;
  value: number;
  compareValue: number;
};

export type WireframeDashboardProgressDto = {
  percent: number;
  completedSteps: number;
  totalSteps: number;
  caption: string;
};

export type WireframeDashboardCardDto = {
  id: string;
  assignmentId: string;
  waferId: string;
  waferCode: string;
  dieLabel: string;
  description: string;
  status: StepStatus | FabricationStatus | "not_started";
  stageId: WireframeDashboardStageId;
  stepLabel: string;
  dueLabel: string;
  activityLabel: string;
  handlerName: string | null;
};

export type WireframeDashboardColumnDto = {
  id: WireframeDashboardStageId;
  title: string;
  count: number;
  cards: WireframeDashboardCardDto[];
};

export type WireframeDashboardDto = {
  process: {
    id: string;
    name: string;
    version: string;
  } | null;
  summaryCards: WireframeDashboardSummaryCardDto[];
  activity: {
    max: number;
    bars: WireframeDashboardActivityBarDto[];
  };
  progress: WireframeDashboardProgressDto;
  columns: WireframeDashboardColumnDto[];
  emptyStates: WireframeEmptyStateDto[];
};

export type WireframeProcessFlowWaferDto = {
  assignmentId: string;
  waferId: string;
  waferCode: string;
  dieLabel: string;
  currentStepStatus: StepStatus | null;
};

export type WireframeProcessFlowNodeDto = Pick<
  ProcessStep,
  "id" | "name" | "process_area" | "step_order"
> & {
  role: "start" | "procedure" | "end";
  status: StepStatus | "empty";
  wafers: WireframeProcessFlowWaferDto[];
  nextStepIds: string[];
  returnStepIds: string[];
  x?: number;
  y?: number;
};

export type WireframeProcessFlowDto = {
  process: WireframeDashboardDto["process"];
  nodes: WireframeProcessFlowNodeDto[];
  wafers: WireframeProcessFlowWaferDto[];
  stats: {
    totalSteps: number;
    activeStepCount: number;
    blockedStepCount: number;
    activeWaferCount: number;
  };
  emptyStates: WireframeEmptyStateDto[];
};

export type WireframeCalendarEventDto = ProcessCalendarEventView;

export type WireframeCalendarDto = {
  processId: string;
  fromIso: string;
  toIso: string;
  locations: ProcessCalendarLocation[];
  people: ProcessCalendarPersonOption[];
  events: WireframeCalendarEventDto[];
  emptyStates: WireframeEmptyStateDto[];
};

export type WireframeWaferViewerStatus =
  | "queued"
  | "litho"
  | "etch"
  | "inspection"
  | "bond"
  | "test"
  | "dice";

export type WireframeWaferViewerItemDto = {
  id: string;
  waferId: string;
  code: string;
  familyId: string;
  familyName: string;
  dieLabel: string;
  stepLabel: string;
  status: WireframeWaferViewerStatus;
  fabricationStatus: FabricationStatus;
  waferStateName: string;
  isUndiced: boolean;
  notes: string | null;
  textSurfaces: Record<string, string>;
  metadata: Json;
};

export type WireframeWaferViewerFamilyDto = {
  id: string;
  name: string;
  status: "active" | "paused" | "setup";
  items: WireframeWaferViewerItemDto[];
};

export type WireframeWaferViewerDto = {
  projectId: string;
  metrics: {
    totalWafers: number;
    activeWafers: number;
    undicedWafers: number;
    familyCount: number;
  };
  families: WireframeWaferViewerFamilyDto[];
  emptyStates: WireframeEmptyStateDto[];
};

export type WireframeWaferLotSource = Pick<
  WaferLot,
  "id" | "lot_code" | "status" | "substrate_material"
>;

export type WireframeWaferSource = Pick<
  Wafer,
  | "id"
  | "project_id"
  | "wafer_code"
  | "status"
  | "notes"
  | "metadata"
  | "created_at"
> & {
  wafer_lots?: WireframeWaferLotSource | WireframeWaferLotSource[] | null;
};

export type WireframeTextSurfaceSource = Pick<
  TextSurface,
  "scope_type" | "scope_key" | "field_key" | "value"
>;

export type WireframeDashboardSource = ProcessDashboardData;
export type WireframeWaferStateSource = ProcessDashboardWaferState;
