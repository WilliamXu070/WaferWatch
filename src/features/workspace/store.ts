"use client";

import { useSyncExternalStore } from "react";
import type { Json } from "@/types/database";
import type {
  ProcessHotBootstrap,
  ProcessWorkspaceDelta,
  ProcessWorkspaceMutationOverlay,
  ProcessWorkspaceSnapshot
} from "./types";

export type WorkspaceCalendarWeek = {
  from: string;
  to: string;
  rows: Json[];
};

export type WorkspaceState = {
  hotBootstrap: ProcessHotBootstrap | null;
  calendarWeeks: WorkspaceCalendarWeek[];
  snapshot: ProcessWorkspaceSnapshot | null;
  optimisticSnapshot: ProcessWorkspaceSnapshot | null;
  lastDelta: ProcessWorkspaceDelta | null;
  overlays: ProcessWorkspaceMutationOverlay[];
  normalizedAssignments: {
    assignmentsById: Readonly<Record<string, Json>>;
    assignmentIdsByStepId: Readonly<Record<string, readonly string[]>>;
  };
};

const states = new Map<string, WorkspaceState>();
const listeners = new Map<string, Set<() => void>>();
const lru: string[] = [];
const MAX_HOT_PROCESSES = 3;
const MAX_CALENDAR_WEEKS = 8;
const emptyState: WorkspaceState = {
  hotBootstrap: null,
  calendarWeeks: [],
  snapshot: null,
  optimisticSnapshot: null,
  lastDelta: null,
  overlays: [],
  normalizedAssignments: {
    assignmentsById: {},
    assignmentIdsByStepId: {}
  }
};

function touch(templateId: string) {
  const existing = lru.indexOf(templateId);
  if (existing >= 0) lru.splice(existing, 1);
  lru.push(templateId);
}

function pruneHotProcesses() {
  while (lru.length > MAX_HOT_PROCESSES) {
    const evicted = lru.shift();
    if (!evicted) return;
    states.delete(evicted);
    emit(evicted);
  }
}

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

function setState(templateId: string, update: Partial<Omit<WorkspaceState, "optimisticSnapshot">>) {
  const current = states.get(templateId) ?? emptyState;
  const state = { ...current, ...update };
  const normalizedAssignments = state.snapshot !== current.snapshot
    ? normalizeAssignments(state.snapshot?.currentState ?? [])
    : state.normalizedAssignments;
  states.set(templateId, {
    ...state,
    normalizedAssignments,
    optimisticSnapshot: projectOptimisticSnapshot(state.snapshot, state.overlays)
  });
  touch(templateId);
  pruneHotProcesses();
  emit(templateId);
}

function statusSummary(currentState: Json[]) {
  const waferIds = new Set<string>();
  let awaitingReviewCount = 0;
  for (const value of currentState) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (typeof value.wafer_id === "string") waferIds.add(value.wafer_id);
    if (value.latest_review_status === "awaiting_review") awaitingReviewCount += 1;
  }
  return {
    assignmentCount: currentState.length,
    waferCount: waferIds.size,
    awaitingReviewCount
  };
}

function normalizeAssignments(currentState: Json[]): WorkspaceState["normalizedAssignments"] {
  const assignmentsById: Record<string, Json> = {};
  const assignmentIdsByStepId: Record<string, string[]> = {};
  for (const value of currentState) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const assignmentId = typeof value.assignment_id === "string" ? value.assignment_id : null;
    if (!assignmentId) continue;
    assignmentsById[assignmentId] = value;
    const stepId = typeof value.current_step_id === "string" ? value.current_step_id : null;
    if (stepId) (assignmentIdsByStepId[stepId] ??= []).push(assignmentId);
  }
  return { assignmentsById, assignmentIdsByStepId };
}

function bootstrapSnapshot(bootstrap: ProcessHotBootstrap): ProcessWorkspaceSnapshot {
  return {
    templateId: bootstrap.templateId,
    revision: bootstrap.revision,
    processDefinition: bootstrap.processDefinition,
    currentState: bootstrap.currentState,
    archivedState: [],
    operationHistory: [],
    plan: [],
    activeBatchRuns: [],
    calendar: bootstrap.calendar
  };
}

export function setProcessWorkspaceHotBootstrap(bootstrap: ProcessHotBootstrap) {
  const current = states.get(bootstrap.templateId) ?? emptyState;
  const overlays = current.overlays.filter((overlay) => (
    overlay.committedRevision === undefined || overlay.committedRevision > bootstrap.revision
  ));
  const calendarWeek = {
    from: bootstrap.calendarRange.from,
    to: bootstrap.calendarRange.to,
    rows: bootstrap.calendar
  };
  const calendarWeeks = [
    ...current.calendarWeeks.filter((week) => week.from !== calendarWeek.from),
    calendarWeek
  ].slice(-MAX_CALENDAR_WEEKS);
  setState(bootstrap.templateId, {
    hotBootstrap: bootstrap,
    calendarWeeks,
    snapshot: bootstrapSnapshot(bootstrap),
    lastDelta: null,
    overlays
  });
}

export function setProcessWorkspaceCalendarWeek(
  templateId: string,
  week: WorkspaceCalendarWeek
) {
  const current = states.get(templateId) ?? emptyState;
  const calendarWeeks = [
    ...current.calendarWeeks.filter((candidate) => candidate.from !== week.from),
    week
  ].slice(-MAX_CALENDAR_WEEKS);
  setState(templateId, { calendarWeeks });
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
  const nextSnapshot = {
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
    };
  const hotBootstrap = current.hotBootstrap ? {
    ...current.hotBootstrap,
    revision: delta.revision,
    processDefinition: nextSnapshot.processDefinition,
    currentState: nextSnapshot.currentState,
    calendar: nextSnapshot.calendar,
    statusSummary: statusSummary(nextSnapshot.currentState)
  } : null;
  const calendarWeeks = current.calendarWeeks.map((week) => ({
    ...week,
    rows: mergeRows(
      week.rows,
      delta.calendar.filter((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return false;
        const startsAt = typeof row.starts_at === "string" ? row.starts_at : "";
        const endsAt = typeof row.ends_at === "string" ? row.ends_at : "";
        return endsAt >= week.from && startsAt < week.to;
      }),
      removed.calendarEventIds,
      "id"
    )
  }));
  setState(delta.templateId, {
    hotBootstrap,
    calendarWeeks,
    snapshot: nextSnapshot,
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
  if (states.has(templateId)) touch(templateId);
  return states.get(templateId) ?? emptyState;
}

export function clearProcessWorkspaceSessions() {
  const templateIds = [...states.keys()];
  states.clear();
  lru.length = 0;
  for (const templateId of templateIds) emit(templateId);
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
