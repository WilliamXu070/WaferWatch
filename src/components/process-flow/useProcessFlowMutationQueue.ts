"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProcessFlowSyncState } from "./types";

export type ProcessFlowMutationQueueItem = {
  assignmentId: string;
  label: string;
  mutationId: string;
  state: ProcessFlowSyncState;
  detail?: string;
  retry?: () => void;
};

const LOCKED_STATES = new Set<ProcessFlowSyncState>([
  "saving_move",
  "awaiting_parameters",
  "saving_parameters"
]);

export function isProcessFlowAssignmentLocked(state: ProcessFlowSyncState) {
  return LOCKED_STATES.has(state);
}

export function useProcessFlowMutationQueue() {
  const [items, setItems] = useState<ProcessFlowMutationQueueItem[]>([]);
  const syncTimersRef = useRef(new Map<string, number>());

  const upsert = useCallback((nextItems: readonly ProcessFlowMutationQueueItem[]) => {
    setItems((current) => {
      const byAssignmentId = new Map(current.map((item) => [item.assignmentId, item]));
      nextItems.forEach((item) => byAssignmentId.set(item.assignmentId, item));
      return Array.from(byAssignmentId.values());
    });
  }, []);

  const setState = useCallback((
    assignmentIds: readonly string[],
    state: ProcessFlowSyncState,
    detail?: string
  ) => {
    const assignmentIdSet = new Set(assignmentIds);
    setItems((current) => current.map((item) => assignmentIdSet.has(item.assignmentId)
      ? { ...item, state, detail, retry: state === "failed" ? item.retry : undefined }
      : item));

    if (state === "synced") {
      assignmentIds.forEach((assignmentId) => {
        const currentTimer = syncTimersRef.current.get(assignmentId);
        if (currentTimer) window.clearTimeout(currentTimer);
        syncTimersRef.current.set(assignmentId, window.setTimeout(() => {
          setItems((current) => current.filter((item) =>
            item.assignmentId !== assignmentId || item.state !== "synced"
          ));
          syncTimersRef.current.delete(assignmentId);
        }, 1800));
      });
    }
  }, []);

  const dismiss = useCallback((assignmentId: string) => {
    const currentTimer = syncTimersRef.current.get(assignmentId);
    if (currentTimer) window.clearTimeout(currentTimer);
    syncTimersRef.current.delete(assignmentId);
    setItems((current) => current.filter((item) => item.assignmentId !== assignmentId));
  }, []);

  const lockedAssignmentIds = useMemo(() => new Set(
    items.filter((item) => isProcessFlowAssignmentLocked(item.state)).map((item) => item.assignmentId)
  ), [items]);
  const syncStateByAssignmentId = useMemo(() => new Map(
    items.map((item) => [item.assignmentId, item.state])
  ), [items]);

  useEffect(() => {
    if (!items.some((item) => item.state === "uploading_files")) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "Files are still uploading.";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [items]);

  useEffect(() => () => {
    syncTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    syncTimersRef.current.clear();
  }, []);

  return {
    items,
    upsert,
    setState,
    dismiss,
    lockedAssignmentIds,
    syncStateByAssignmentId
  };
}
