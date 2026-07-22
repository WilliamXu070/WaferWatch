"use client";

import { useSyncExternalStore } from "react";
import type { Json } from "@/types/database";
import type { ProcessWorkspaceDelta, ProcessWorkspaceSnapshot } from "./types";

type WorkspaceState = {
  snapshot: ProcessWorkspaceSnapshot | null;
  lastDelta: ProcessWorkspaceDelta | null;
};

const states = new Map<string, WorkspaceState>();
const listeners = new Map<string, Set<() => void>>();
const emptyState: WorkspaceState = { snapshot: null, lastDelta: null };

function emit(templateId: string) {
  for (const listener of listeners.get(templateId) ?? []) listener();
}

function recordId(value: Json, key: string) {
  return value && typeof value === "object" && !Array.isArray(value) && typeof value[key] === "string"
    ? value[key] as string
    : null;
}

function mergeRows(current: Json[], changed: Json[], removed: Json | undefined, key: string) {
  const removedIds = new Set(Array.isArray(removed) ? removed.filter((id): id is string => typeof id === "string") : []);
  const byId = new Map<string, Json>();
  for (const row of current) {
    const id = recordId(row, key);
    if (id && !removedIds.has(id)) byId.set(id, row);
  }
  for (const row of changed) {
    const id = recordId(row, key);
    if (id) byId.set(id, row);
  }
  return Array.from(byId.values());
}

export function setProcessWorkspaceSnapshot(snapshot: ProcessWorkspaceSnapshot) {
  states.set(snapshot.templateId, { snapshot, lastDelta: null });
  emit(snapshot.templateId);
}

export function applyProcessWorkspaceDelta(delta: ProcessWorkspaceDelta) {
  const current = states.get(delta.templateId) ?? emptyState;
  const snapshot = current.snapshot;
  if (!snapshot || delta.hasGap) return false;
  if (delta.revision <= snapshot.revision) return true;
  if (delta.afterRevision !== snapshot.revision) return false;
  const removed = delta.removedEntityIds;
  states.set(delta.templateId, {
    snapshot: {
      ...snapshot,
      revision: delta.revision,
      processDefinition: {
        ...snapshot.processDefinition,
        stages: mergeRows(snapshot.processDefinition.stages, delta.processDefinition.stages, removed.processStageIds, "id")
      },
      currentState: mergeRows(snapshot.currentState, delta.currentState, removed.assignmentIds, "assignment_id"),
      plan: mergeRows(snapshot.plan, delta.plan, removed.plannedOperationIds, "planned_operation_id"),
      activeBatchRuns: mergeRows(snapshot.activeBatchRuns, delta.batchRuns, removed.operationRunIds, "operation_run_id")
    },
    lastDelta: delta
  });
  emit(delta.templateId);
  return true;
}

export function getProcessWorkspaceState(templateId: string) {
  return states.get(templateId) ?? emptyState;
}

export function subscribeProcessWorkspace(templateId: string, listener: () => void) {
  const bucket = listeners.get(templateId) ?? new Set();
  bucket.add(listener);
  listeners.set(templateId, bucket);
  return () => {
    bucket.delete(listener);
    if (bucket.size === 0) listeners.delete(templateId);
  };
}

export function useProcessWorkspace(templateId: string | undefined) {
  const key = templateId ?? "";
  return useSyncExternalStore(
    (listener) => subscribeProcessWorkspace(key, listener),
    () => getProcessWorkspaceState(key),
    () => emptyState
  );
}
