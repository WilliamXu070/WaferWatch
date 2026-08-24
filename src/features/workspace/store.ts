"use client";

import { useSyncExternalStore } from "react";
import type { Json } from "@/types/database";
import type {
  ProcessWorkspaceDelta,
  ProcessWorkspaceMutationOverlay,
  ProcessWorkspaceSnapshot
} from "./types";

type WorkspaceState = {
  snapshot: ProcessWorkspaceSnapshot | null;
  optimisticSnapshot: ProcessWorkspaceSnapshot | null;
  lastDelta: ProcessWorkspaceDelta | null;
  overlays: ProcessWorkspaceMutationOverlay[];
};

const states = new Map<string, WorkspaceState>();
const listeners = new Map<string, Set<() => void>>();
const emptyState: WorkspaceState = {
  snapshot: null,
  optimisticSnapshot: null,
  lastDelta: null,
  overlays: []
};

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

function mutationIdFromChange(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return typeof value.client_mutation_id === "string" ? value.client_mutation_id : null;
}

function projectOptimisticSnapshot(
  snapshot: ProcessWorkspaceSnapshot | null,
  overlays: ProcessWorkspaceMutationOverlay[]
) {
  if (!snapshot) return null;
  return overlays.reduce<ProcessWorkspaceSnapshot>((current, overlay) => {
    const patch = overlay.patch;
    const removed = patch.removedEntityIds ?? {};
    return {
      ...current,
      processDefinition: {
        stages: mergeRows(
          current.processDefinition.stages,
          patch.processDefinition?.stages ?? [],
          removed.processStageIds,
          "id"
        ),
        steps: mergeRows(
          current.processDefinition.steps,
          patch.processDefinition?.steps ?? [],
          removed.processStepIds,
          "id"
        ),
        transitions: mergeRows(
          current.processDefinition.transitions,
          patch.processDefinition?.transitions ?? [],
          removed.processTransitionIds,
          "id"
        )
      },
      currentState: mergeRows(current.currentState, patch.currentState ?? [], removed.assignmentIds, "assignment_id"),
      archivedState: mergeRows(current.archivedState, patch.archivedState ?? [], removed.archivedAssignmentIds, "assignment_id"),
      operationHistory: mergeRows(
        current.operationHistory,
        patch.operationHistory ?? [],
        removed.operationRunMemberIds,
        "operation_run_member_id"
      ),
      plan: mergeRows(current.plan, patch.plan ?? [], removed.plannedOperationIds, "planned_operation_id"),
      activeBatchRuns: mergeRows(
        current.activeBatchRuns,
        patch.activeBatchRuns ?? [],
        removed.operationRunIds,
        "operation_run_id"
      ),
      calendar: mergeRows(current.calendar, patch.calendar ?? [], removed.calendarEventIds, "id")
    };
  }, snapshot);
}

function setState(templateId: string, state: Omit<WorkspaceState, "optimisticSnapshot">) {
  states.set(templateId, {
    ...state,
    optimisticSnapshot: projectOptimisticSnapshot(state.snapshot, state.overlays)
  });
  emit(templateId);
}

export function setProcessWorkspaceSnapshot(snapshot: ProcessWorkspaceSnapshot) {
  const current = states.get(snapshot.templateId) ?? emptyState;
  const overlays = current.overlays.filter((overlay) => (
    overlay.committedRevision === undefined || overlay.committedRevision > snapshot.revision
  ));
  setState(snapshot.templateId, { snapshot, lastDelta: null, overlays });
}

export function applyProcessWorkspaceDelta(delta: ProcessWorkspaceDelta) {
  const current = states.get(delta.templateId) ?? emptyState;
  const snapshot = current.snapshot;
  if (!snapshot || delta.hasGap) return false;
  if (delta.revision <= snapshot.revision) return true;
  if (delta.afterRevision !== snapshot.revision) return false;
  const removed = delta.removedEntityIds;
  const settledMutationIds = new Set(delta.changes.map(mutationIdFromChange).filter(Boolean));
  const overlays = current.overlays.filter((overlay) => (
    !settledMutationIds.has(overlay.mutationId)
    && (overlay.committedRevision === undefined || overlay.committedRevision > delta.revision)
  ));
  setState(delta.templateId, {
    snapshot: {
      ...snapshot,
      revision: delta.revision,
      processDefinition: {
        stages: mergeRows(snapshot.processDefinition.stages, delta.processDefinition.stages, removed.processStageIds, "id"),
        steps: mergeRows(snapshot.processDefinition.steps, delta.processDefinition.steps, removed.processStepIds, "id"),
        transitions: mergeRows(
          snapshot.processDefinition.transitions,
          delta.processDefinition.transitions,
          removed.processTransitionIds,
          "id"
        )
      },
      currentState: mergeRows(snapshot.currentState, delta.currentState, removed.assignmentIds, "assignment_id"),
      archivedState: mergeRows(snapshot.archivedState, delta.archivedState, removed.assignmentIds, "assignment_id"),
      operationHistory: mergeRows(
        snapshot.operationHistory,
        delta.operationHistory,
        removed.operationRunMemberIds,
        "operation_run_member_id"
      ),
      plan: mergeRows(snapshot.plan, delta.plan, removed.plannedOperationIds, "planned_operation_id"),
      activeBatchRuns: mergeRows(snapshot.activeBatchRuns, delta.batchRuns, removed.operationRunIds, "operation_run_id"),
      calendar: mergeRows(snapshot.calendar, delta.calendar, removed.calendarEventIds, "id")
    },
    lastDelta: delta,
    overlays
  });
  return true;
}

export function addProcessWorkspaceOverlay(
  templateId: string,
  overlay: ProcessWorkspaceMutationOverlay
) {
  const current = states.get(templateId) ?? emptyState;
  const overlays = [
    ...current.overlays.filter((candidate) => candidate.mutationId !== overlay.mutationId),
    overlay
  ];
  setState(templateId, { snapshot: current.snapshot, lastDelta: current.lastDelta, overlays });
}

export function markProcessWorkspaceOverlayCommitted(
  templateId: string,
  mutationId: string,
  committedRevision: number
) {
  const current = states.get(templateId) ?? emptyState;
  const overlays = current.overlays.map((overlay) => (
    overlay.mutationId === mutationId ? { ...overlay, committedRevision } : overlay
  ));
  setState(templateId, { snapshot: current.snapshot, lastDelta: current.lastDelta, overlays });
}

export function rejectProcessWorkspaceOverlay(templateId: string, mutationId: string) {
  const current = states.get(templateId) ?? emptyState;
  const overlays = current.overlays.filter((overlay) => overlay.mutationId !== mutationId);
  setState(templateId, { snapshot: current.snapshot, lastDelta: current.lastDelta, overlays });
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
