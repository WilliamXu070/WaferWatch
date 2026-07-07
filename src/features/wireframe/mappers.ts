import type {
  ProcessCalendarLocation,
  ProcessCalendarPersonOption
} from "@/features/calendar/queries";
import type { Json, StepStatus } from "@/types/database";
import type {
  WireframeCalendarDto,
  WireframeDashboardCardDto,
  WireframeDashboardColumnDto,
  WireframeDashboardDto,
  WireframeDashboardSource,
  WireframeDashboardStageId,
  WireframeEmptyStateDto,
  WireframeEmptyStateKind,
  WireframeProcessFlowDto,
  WireframeProcessFlowNodeDto,
  WireframeProcessFlowWaferDto,
  WireframeTextSurfaceSource,
  WireframeWaferSource,
  WireframeWaferStateSource,
  WireframeWaferViewerDto,
  WireframeWaferViewerFamilyDto,
  WireframeWaferViewerItemDto,
  WireframeWaferViewerStatus
} from "./types";

const DASHBOARD_COLUMNS: Array<Pick<WireframeDashboardColumnDto, "id" | "title">> = [
  { id: "queued", title: "Queued" },
  { id: "poling", title: "Poling" },
  { id: "inspection", title: "Inspection" },
  { id: "complete", title: "Complete" }
];

const CALENDAR_LOCATIONS: ProcessCalendarLocation[] = ["McMaster", "Waterloo", "Toronto"];

export function createWireframeEmptyState(
  kind: WireframeEmptyStateKind,
  overrides: Partial<Omit<WireframeEmptyStateDto, "kind">> = {}
): WireframeEmptyStateDto {
  const defaults: Record<WireframeEmptyStateKind, Omit<WireframeEmptyStateDto, "kind">> = {
    "no-process": {
      title: "No process selected",
      description: "Choose a process template before loading this wireframe surface."
    },
    "no-dashboard-cards": {
      title: "No wafers in this workflow",
      description: "The backend returned no active wafer assignments for this process."
    },
    "no-flow-steps": {
      title: "No process steps",
      description: "This process template has no saved steps to render."
    },
    "no-calendar-events": {
      title: "No scheduled events",
      description: "The selected process has no calendar events in this range."
    },
    "no-wafers": {
      title: "No wafers",
      description: "The selected project has no wafer records."
    }
  };

  return {
    kind,
    ...defaults[kind],
    ...overrides
  };
}

export function createEmptyWireframeDashboardDto(): WireframeDashboardDto {
  return {
    process: null,
    summaryCards: [],
    activity: {
      max: 0,
      bars: []
    },
    progress: {
      percent: 0,
      completedSteps: 0,
      totalSteps: 0,
      caption: "No process selected"
    },
    columns: createEmptyDashboardColumns(),
    emptyStates: [createWireframeEmptyState("no-process")]
  };
}

export function createEmptyWireframeProcessFlowDto(): WireframeProcessFlowDto {
  return {
    process: null,
    nodes: [],
    wafers: [],
    stats: {
      totalSteps: 0,
      activeStepCount: 0,
      blockedStepCount: 0,
      activeWaferCount: 0
    },
    emptyStates: [
      createWireframeEmptyState("no-process"),
      createWireframeEmptyState("no-flow-steps")
    ]
  };
}

export function createEmptyWireframeWaferViewerDto(projectId: string): WireframeWaferViewerDto {
  return {
    projectId,
    metrics: {
      totalWafers: 0,
      activeWafers: 0,
      undicedWafers: 0,
      familyCount: 0
    },
    families: [],
    emptyStates: [createWireframeEmptyState("no-wafers")]
  };
}

function createEmptyDashboardColumns(): WireframeDashboardColumnDto[] {
  return DASHBOARD_COLUMNS.map((column) => ({
    ...column,
    count: 0,
    cards: []
  }));
}

function getMetadataObject(metadata: Json): Record<string, Json | undefined> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata
    : {};
}

function getMetadataString(metadata: Json, keys: string[]): string | null {
  const metadataObject = getMetadataObject(metadata);
  for (const key of keys) {
    const value = metadataObject[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getMetadataBoolean(metadata: Json, keys: string[]): boolean | null {
  const metadataObject = getMetadataObject(metadata);
  for (const key of keys) {
    const value = metadataObject[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "1", "undiced", "pre-dice"].includes(normalized)) {
        return true;
      }
      if (["false", "no", "0", "diced", "post-dice"].includes(normalized)) {
        return false;
      }
    }
  }

  return null;
}

function countNestedStringLeaves(value: unknown): number {
  if (typeof value === "string" && value.trim()) {
    return 1;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }

  return Object.values(value).reduce((total, child) => total + countNestedStringLeaves(child), 0);
}

function getWaferDescription(waferState: WireframeWaferStateSource) {
  if (waferState.dieLabel) {
    const description = waferState.dieDescriptions[waferState.dieLabel];
    if (description?.trim()) {
      return description.trim();
    }
  }

  if (waferState.currentStepName) {
    return waferState.nextStepName
      ? `${waferState.currentStepName}. Next: ${waferState.nextStepName}.`
      : waferState.currentStepName;
  }

  return "No saved status text.";
}

function getDashboardStage(waferState: WireframeWaferStateSource): WireframeDashboardStageId {
  if (waferState.assignmentStatus === "completed" || waferState.assignmentStatus === "scrapped") {
    return "complete";
  }

  if (
    waferState.currentStepStatus === "completed" ||
    waferState.currentStepStatus === "skipped"
  ) {
    return "complete";
  }

  if (
    waferState.currentStepStatus === "blocked" ||
    waferState.currentStepStatus === "failed" ||
    waferState.currentStepArea?.toLowerCase().includes("inspect") ||
    waferState.currentStepArea?.toLowerCase().includes("metrology") ||
    waferState.currentStepArea?.toLowerCase().includes("character")
  ) {
    return "inspection";
  }

  if (waferState.currentStepStatus === "running" || waferState.assignmentStatus === "in_progress") {
    return "poling";
  }

  return "queued";
}

function getActivityLabel(waferState: WireframeWaferStateSource) {
  const savedTextCount =
    Object.values(waferState.dieDescriptions).filter((value) => value.trim()).length +
    countNestedStringLeaves(waferState.diePolingParameters);

  return savedTextCount === 1 ? "1 saved field" : `${savedTextCount} saved fields`;
}

function getDashboardCard(waferState: WireframeWaferStateSource): WireframeDashboardCardDto {
  const stageId = getDashboardStage(waferState);

  return {
    id: waferState.assignmentId,
    assignmentId: waferState.assignmentId,
    waferId: waferState.waferId,
    waferCode: waferState.waferCode,
    dieLabel: waferState.dieLabel ?? "Unassigned die",
    description: getWaferDescription(waferState),
    status: waferState.currentStepStatus ?? waferState.assignmentStatus ?? "not_started",
    stageId,
    stepLabel: waferState.currentStepName ?? "No active step",
    dueLabel: "No schedule",
    activityLabel: getActivityLabel(waferState),
    handlerName: waferState.currentHandlerName
  };
}

function getProgress(source: WireframeDashboardSource) {
  const totalSteps = source.process.process_steps.length;
  if (totalSteps === 0 || source.workspaceWaferStates.length === 0) {
    return {
      percent: 0,
      completedSteps: 0,
      totalSteps,
      caption: totalSteps === 0 ? "No steps defined" : "No assigned wafers"
    };
  }

  const completedSteps = source.workspaceWaferStates.reduce((total, waferState) => {
    if (
      waferState.currentStepStatus === "completed" ||
      waferState.currentStepStatus === "skipped"
    ) {
      return total + Math.max(waferState.currentStepOrder ?? 0, 1);
    }

    return total + Math.max((waferState.currentStepOrder ?? 1) - 1, 0);
  }, 0);
  const totalAssignableSteps = totalSteps * source.workspaceWaferStates.length;
  const percent =
    totalAssignableSteps === 0
      ? 0
      : Math.round((completedSteps / totalAssignableSteps) * 100);

  return {
    percent,
    completedSteps,
    totalSteps: totalAssignableSteps,
    caption: `${completedSteps} of ${totalAssignableSteps} wafer-steps complete`
  };
}

export function mapProcessDashboardDataToWireframeDashboard(
  source: WireframeDashboardSource
): WireframeDashboardDto {
  const cards = source.workspaceWaferStates.map(getDashboardCard);
  const columns = createEmptyDashboardColumns().map((column) => {
    const columnCards = cards.filter((card) => card.stageId === column.id);
    return {
      ...column,
      count: columnCards.length,
      cards: columnCards
    };
  });
  const blockedCount = source.workspaceWaferStates.filter(
    (waferState) =>
      waferState.currentStepStatus === "blocked" || waferState.currentStepStatus === "failed"
  ).length;
  const completedCount = source.workspaceWaferStates.filter(
    (waferState) =>
      waferState.assignmentStatus === "completed" ||
      waferState.currentStepStatus === "completed" ||
      waferState.currentStepStatus === "skipped"
  ).length;
  const bars = source.calendarDays.map((day) => ({
    label: day.dateLabel,
    value: day.events.length,
    compareValue: 0
  }));
  const max = Math.max(0, ...bars.map((bar) => bar.value));
  const emptyStates: WireframeEmptyStateDto[] = [];

  if (cards.length === 0) {
    emptyStates.push(createWireframeEmptyState("no-dashboard-cards"));
  }

  return {
    process: {
      id: source.process.id,
      name: source.process.name,
      version: source.process.version
    },
    summaryCards: [
      {
        id: "active-wafers",
        label: "Active wafers",
        value: String(source.activeWaferStates.length),
        tone: "active",
        href: "/process-flow"
      },
      {
        id: "blocked-failed",
        label: "Blocked / failed",
        value: String(blockedCount),
        tone: blockedCount > 0 ? "warning" : "neutral",
        href: "/process-flow"
      },
      {
        id: "completed",
        label: "Completed",
        value: String(completedCount),
        tone: "success",
        href: "/wafer-status"
      }
    ],
    activity: {
      max,
      bars
    },
    progress: getProgress(source),
    columns,
    emptyStates
  };
}

function getFlowStatus(wafers: WireframeProcessFlowWaferDto[]): StepStatus | "empty" {
  const statuses = wafers
    .map((wafer) => wafer.currentStepStatus)
    .filter((status): status is StepStatus => Boolean(status));

  if (statuses.length === 0) return "empty";
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("running")) return "running";
  if (statuses.includes("queued")) return "queued";
  if (statuses.includes("pending")) return "pending";
  if (statuses.every((status) => status === "completed" || status === "skipped")) {
    return "completed";
  }

  return statuses[0];
}

export function mapProcessDashboardDataToWireframeProcessFlow(
  source: WireframeDashboardSource
): WireframeProcessFlowDto {
  const sortedSteps = [...source.process.process_steps].sort((a, b) => a.step_order - b.step_order);
  const wafersByStepId = new Map<string, WireframeProcessFlowWaferDto[]>();

  for (const waferState of source.workspaceWaferStates) {
    if (!waferState.currentStepId) {
      continue;
    }

    const wafer: WireframeProcessFlowWaferDto = {
      assignmentId: waferState.assignmentId,
      waferId: waferState.waferId,
      waferCode: waferState.waferCode,
      dieLabel: waferState.dieLabel ?? "Unassigned die",
      currentStepStatus: waferState.currentStepStatus
    };
    const existing = wafersByStepId.get(waferState.currentStepId);
    if (existing) {
      existing.push(wafer);
    } else {
      wafersByStepId.set(waferState.currentStepId, [wafer]);
    }
  }

  const nodes: WireframeProcessFlowNodeDto[] = sortedSteps.map((step, index) => {
    const wafers = wafersByStepId.get(step.id) ?? [];
    const nextStep = sortedSteps[index + 1];
    const isFirst = index === 0;
    const isLast = index === sortedSteps.length - 1;

    return {
      id: step.id,
      name: step.name,
      process_area: step.process_area,
      step_order: step.step_order,
      role: isFirst ? "start" : isLast ? "end" : "procedure",
      status: getFlowStatus(wafers),
      wafers,
      nextStepIds: nextStep ? [nextStep.id] : [],
      returnStepIds: [],
      x: 420,
      y: 18 + index * 114
    };
  });
  const activeStepCount = nodes.filter((node) =>
    ["running", "queued", "pending"].includes(node.status)
  ).length;
  const blockedStepCount = nodes.filter((node) =>
    ["blocked", "failed"].includes(node.status)
  ).length;
  const emptyStates: WireframeEmptyStateDto[] = [];

  if (nodes.length === 0) {
    emptyStates.push(createWireframeEmptyState("no-flow-steps"));
  }

  return {
    process: {
      id: source.process.id,
      name: source.process.name,
      version: source.process.version
    },
    nodes,
    wafers: Array.from(wafersByStepId.values()).flat(),
    stats: {
      totalSteps: nodes.length,
      activeStepCount,
      blockedStepCount,
      activeWaferCount: source.activeWaferStates.length
    },
    emptyStates
  };
}

export function mapProcessCalendarScheduleToWireframeCalendar(input: {
  processId: string;
  fromIso: string;
  toIso: string;
  events: WireframeCalendarDto["events"];
  people: ProcessCalendarPersonOption[];
}): WireframeCalendarDto {
  return {
    processId: input.processId,
    fromIso: input.fromIso,
    toIso: input.toIso,
    locations: CALENDAR_LOCATIONS,
    people: input.people,
    events: input.events,
    emptyStates:
      input.events.length === 0 ? [createWireframeEmptyState("no-calendar-events")] : []
  };
}

function getWaferLot(wafer: WireframeWaferSource) {
  if (!wafer.wafer_lots) {
    return null;
  }

  return Array.isArray(wafer.wafer_lots) ? wafer.wafer_lots[0] ?? null : wafer.wafer_lots;
}

function getFamilyName(wafer: WireframeWaferSource) {
  const lot = getWaferLot(wafer);
  if (lot?.lot_code?.trim()) {
    return lot.lot_code.trim();
  }

  const metadataFamily = getMetadataString(wafer.metadata, ["family", "wafer_family", "lot"]);
  if (metadataFamily) {
    return metadataFamily;
  }

  const prefixMatch = wafer.wafer_code.match(/^[A-Za-z]+/);
  return prefixMatch ? prefixMatch[0].toUpperCase() : "Unassigned";
}

function getTextSurfaceKey(surface: WireframeTextSurfaceSource) {
  return `${surface.scope_type}:${surface.scope_key}:${surface.field_key}`;
}

function groupTextSurfacesByScope(surfaces: ReadonlyArray<WireframeTextSurfaceSource>) {
  const byScope = new Map<string, Record<string, string>>();

  for (const surface of surfaces) {
    const keys = [surface.scope_key, getTextSurfaceKey(surface)];
    for (const key of keys) {
      const existing = byScope.get(key) ?? {};
      existing[surface.field_key] = surface.value;
      byScope.set(key, existing);
    }
  }

  return byScope;
}

function getWaferStatus(
  wafer: WireframeWaferSource,
  textSurfaces: Record<string, string>
): WireframeWaferViewerStatus {
  const statusText = (
    textSurfaces.status ??
    getMetadataString(wafer.metadata, ["wireframe_status", "status_label", "current_area"]) ??
    ""
  ).toLowerCase();

  if (statusText.includes("lith")) return "litho";
  if (statusText.includes("etch")) return "etch";
  if (statusText.includes("inspect") || statusText.includes("metro")) return "inspection";
  if (statusText.includes("bond")) return "bond";
  if (statusText.includes("test") || statusText.includes("character")) return "test";
  if (statusText.includes("dic")) return "dice";

  if (wafer.status === "queued" || wafer.status === "planned") {
    return "queued";
  }

  if (wafer.status === "completed") {
    return "test";
  }

  return "inspection";
}

function getWaferStateName(
  wafer: WireframeWaferSource,
  textSurfaces: Record<string, string>,
  isUndiced: boolean
) {
  return (
    textSurfaces.wafer_state_name?.trim() ||
    textSurfaces.geometry_mode?.trim() ||
    getMetadataString(wafer.metadata, [
      "wafer_state_name",
      "geometry_mode",
      "gds_state",
      "cut_state"
    ]) ||
    (isUndiced ? "Pre-dice clean" : "Post-dice clean")
  );
}

function getWaferStepLabel(wafer: WireframeWaferSource, textSurfaces: Record<string, string>) {
  return (
    textSurfaces.step_label?.trim() ||
    textSurfaces.current_step?.trim() ||
    getMetadataString(wafer.metadata, ["step_label", "current_step", "current_process_step"]) ||
    wafer.status.replaceAll("_", " ")
  );
}

function mapWaferToViewerItem(
  wafer: WireframeWaferSource,
  textSurfaces: Record<string, string>
): WireframeWaferViewerItemDto {
  const familyName = getFamilyName(wafer);
  const familyId = familyName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "unassigned";
  const textSurfaceUndiced = textSurfaces.is_undiced?.trim().toLowerCase();
  const isUndiced =
    getMetadataBoolean(wafer.metadata, ["is_undiced", "undiced", "pre_dice"]) ??
    (textSurfaceUndiced ? ["true", "yes", "1", "undiced", "pre-dice"].includes(textSurfaceUndiced) : false);
  const dieLabel =
    textSurfaces.die_label?.trim() ||
    getMetadataString(wafer.metadata, ["current_die", "die", "chip", "chip_id", "die_id"]) ||
    "";

  return {
    id: wafer.id,
    waferId: wafer.id,
    code: wafer.wafer_code,
    familyId,
    familyName,
    dieLabel,
    stepLabel: getWaferStepLabel(wafer, textSurfaces),
    status: getWaferStatus(wafer, textSurfaces),
    fabricationStatus: wafer.status,
    waferStateName: getWaferStateName(wafer, textSurfaces, isUndiced),
    isUndiced,
    notes: wafer.notes,
    textSurfaces,
    metadata: wafer.metadata
  };
}

function getFamilyStatus(items: WireframeWaferViewerItemDto[]): WireframeWaferViewerFamilyDto["status"] {
  if (items.every((item) => item.fabricationStatus === "planned")) {
    return "setup";
  }

  if (items.every((item) => item.fabricationStatus === "on_hold" || item.fabricationStatus === "scrapped")) {
    return "paused";
  }

  return "active";
}

export function mapWafersToWireframeWaferViewer(input: {
  projectId: string;
  wafers: ReadonlyArray<WireframeWaferSource>;
  textSurfaces?: ReadonlyArray<WireframeTextSurfaceSource>;
}): WireframeWaferViewerDto {
  if (input.wafers.length === 0) {
    return createEmptyWireframeWaferViewerDto(input.projectId);
  }

  const surfacesByScope = groupTextSurfacesByScope(input.textSurfaces ?? []);
  const items = input.wafers
    .map((wafer) => {
      const textSurfaces = {
        ...(surfacesByScope.get(wafer.id) ?? {}),
        ...(surfacesByScope.get(wafer.wafer_code) ?? {})
      };
      return mapWaferToViewerItem(wafer, textSurfaces);
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  const familiesById = new Map<string, WireframeWaferViewerItemDto[]>();

  for (const item of items) {
    const existing = familiesById.get(item.familyId);
    if (existing) {
      existing.push(item);
    } else {
      familiesById.set(item.familyId, [item]);
    }
  }

  const families = Array.from(familiesById.entries())
    .map(([id, familyItems]) => ({
      id,
      name: familyItems[0]?.familyName ?? "Unassigned",
      status: getFamilyStatus(familyItems),
      items: familyItems
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const activeWafers = items.filter((item) =>
    ["planned", "queued", "in_progress", "on_hold"].includes(item.fabricationStatus)
  ).length;

  return {
    projectId: input.projectId,
    metrics: {
      totalWafers: items.length,
      activeWafers,
      undicedWafers: items.filter((item) => item.isUndiced).length,
      familyCount: families.length
    },
    families,
    emptyStates: []
  };
}
