import type { Json } from "@/types/database";

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
