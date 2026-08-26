import type { Json } from "@/types/database";

export type WorkspaceHotLoadingMode = "off" | "shadow" | "on";

export type ProcessWorkspaceSnapshot = {
  templateId: string;
  revision: number;
  processDefinition: {
    stages: Json[];
    steps: Json[];
    transitions: Json[];
  };
  currentState: Json[];
  archivedState: Json[];
  operationHistory: Json[];
  plan: Json[];
  activeBatchRuns: Json[];
  calendar: Json[];
};

export type ProcessHotBootstrap = {
  templateId: string;
  revision: number;
  generatedAt: string;
  calendarRange: {
    from: string;
    to: string;
  };
  processSummary: {
    id: string;
    name: string;
    version: string;
    ownerProjectId: string | null;
  };
  statusSummary: {
    assignmentCount: number;
    waferCount: number;
    awaitingReviewCount: number;
  };
  processDefinition: ProcessWorkspaceSnapshot["processDefinition"];
  currentState: Json[];
  calendar: Json[];
};

export type ProcessWorkspaceDelta = {
  templateId: string;
  afterRevision: number;
  revision: number;
  currentRevision: number;
  hasMore: boolean;
  hasGap: boolean;
  changes: Json[];
  removedEntityIds: Record<string, Json | undefined>;
  currentState: Json[];
  archivedState: Json[];
  operationHistory: Json[];
  batchRuns: Json[];
  plan: Json[];
  calendar: Json[];
  processDefinition: {
    stages: Json[];
    steps: Json[];
    transitions: Json[];
  };
};

export type ProcessWorkspaceOverlayPatch = {
  processDefinition?: Partial<ProcessWorkspaceSnapshot["processDefinition"]>;
  currentState?: Json[];
  archivedState?: Json[];
  operationHistory?: Json[];
  plan?: Json[];
  activeBatchRuns?: Json[];
  calendar?: Json[];
  removedEntityIds?: Record<string, Json | undefined>;
};

export type ProcessWorkspaceMutationOverlay = {
  mutationId: string;
  commandKind: string;
  baseRevision: number;
  committedRevision?: number;
  patch: ProcessWorkspaceOverlayPatch;
};

function asRecord(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value: Json | undefined) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: Json | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function parseHotBootstrap(value: Json): ProcessHotBootstrap {
  const record = asRecord(value);
  const definition = asRecord(record.processDefinition ?? null);
  const summary = asRecord(record.processSummary ?? null);
  const status = asRecord(record.statusSummary ?? null);
  const calendarRange = asRecord(record.calendarRange ?? null);
  return {
    templateId: typeof record.templateId === "string" ? record.templateId : "",
    revision: asNumber(record.revision),
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : "",
    calendarRange: {
      from: typeof calendarRange.from === "string" ? calendarRange.from : "",
      to: typeof calendarRange.to === "string" ? calendarRange.to : ""
    },
    processSummary: {
      id: typeof summary.id === "string" ? summary.id : "",
      name: typeof summary.name === "string" ? summary.name : "",
      version: typeof summary.version === "string" ? summary.version : "",
      ownerProjectId: typeof summary.ownerProjectId === "string" ? summary.ownerProjectId : null
    },
    statusSummary: {
      assignmentCount: asNumber(status.assignmentCount),
      waferCount: asNumber(status.waferCount),
      awaitingReviewCount: asNumber(status.awaitingReviewCount)
    },
    processDefinition: {
      stages: asArray(definition.stages),
      steps: asArray(definition.steps),
      transitions: asArray(definition.transitions)
    },
    currentState: asArray(record.currentState),
    calendar: asArray(record.calendar)
  };
}

export function parseWorkspaceSnapshot(value: Json): ProcessWorkspaceSnapshot {
  const record = asRecord(value);
  const definition = asRecord(record.processDefinition ?? null);
  return {
    templateId: typeof record.templateId === "string" ? record.templateId : "",
    revision: typeof record.revision === "number" ? record.revision : 0,
    processDefinition: {
      stages: asArray(definition.stages),
      steps: asArray(definition.steps),
      transitions: asArray(definition.transitions)
    },
    currentState: asArray(record.currentState),
    archivedState: asArray(record.archivedState),
    operationHistory: asArray(record.operationHistory),
    plan: asArray(record.plan),
    activeBatchRuns: asArray(record.activeBatchRuns),
    calendar: asArray(record.calendar)
  };
}

export function parseWorkspaceDelta(value: Json): ProcessWorkspaceDelta {
  const record = asRecord(value);
  const definition = asRecord(record.processDefinition ?? null);
  return {
    templateId: typeof record.templateId === "string" ? record.templateId : "",
    afterRevision: typeof record.afterRevision === "number" ? record.afterRevision : 0,
    revision: typeof record.revision === "number" ? record.revision : 0,
    currentRevision: typeof record.currentRevision === "number" ? record.currentRevision : 0,
    hasMore: record.hasMore === true,
    hasGap: record.hasGap === true,
    changes: asArray(record.changes),
    removedEntityIds: asRecord(record.removedEntityIds ?? null),
    currentState: asArray(record.currentState),
    archivedState: asArray(record.archivedState),
    operationHistory: asArray(record.operationHistory),
    batchRuns: asArray(record.batchRuns),
    plan: asArray(record.plan),
    calendar: asArray(record.calendar),
    processDefinition: {
      stages: asArray(definition.stages),
      steps: asArray(definition.steps),
      transitions: asArray(definition.transitions)
    }
  };
}
