"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useProcessWorkspace } from "@/features/workspace/store";
import type { WaferStatusModel, WaferStatusTileModel } from "../types";
import { WaferStatusView } from "./WaferStatusView";
import { useWorkspaceSession } from "@/features/workspace/WorkspaceSessionProvider";

export function LiveWaferStatusView({
  initialModel,
  processId,
  ...props
}: Omit<Parameters<typeof WaferStatusView>[0], "model"> & {
  initialModel: WaferStatusModel;
}) {
  const workspaceSession = useWorkspaceSession();
  const effectiveProcessId = workspaceSession.activeProcessId ?? processId;
  const [model, setModel] = useState(initialModel);
  const workspace = useProcessWorkspace(effectiveProcessId);
  const lastLoadedRevisionRef = useRef(workspace.snapshot?.revision ?? 0);
  const loadedHistoryAssignmentsRef = useRef(new Set<string>());

  useEffect(() => {
    const revision = workspace.snapshot?.revision ?? 0;
    if (!workspace.lastDelta || revision <= lastLoadedRevisionRef.current) return;
    const controller = new AbortController();
    void fetch(`/api/processes/${effectiveProcessId}/status`, {
      cache: "no-store",
      signal: controller.signal
    }).then(async (response) => {
      if (!response.ok || controller.signal.aborted) return;
      loadedHistoryAssignmentsRef.current.clear();
      setModel(await response.json() as WaferStatusModel);
      lastLoadedRevisionRef.current = revision;
    }).catch(() => undefined);
    return () => controller.abort();
  }, [effectiveProcessId, workspace.lastDelta, workspace.snapshot?.revision]);

  const requestHistory = useCallback((tile: WaferStatusTileModel) => {
    if (!tile.assignmentId) return;
    const assignmentId = tile.assignmentId;
    const historyKey = `${assignmentId}:${tile.dieLabel}`;
    if (loadedHistoryAssignmentsRef.current.has(historyKey)) return;
    loadedHistoryAssignmentsRef.current.add(historyKey);
    const parameters = new URLSearchParams({
      assignmentId,
      ...(tile.dieLabel ? { dieLabel: tile.dieLabel } : {})
    });
    void fetch(`/api/processes/${effectiveProcessId}/status?${parameters}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("The selected process history could not be loaded.");
        const historyTile = await response.json() as WaferStatusTileModel | null;
        if (!historyTile) throw new Error("The selected process history is unavailable.");
        setModel((current) => ({
          ...current,
          families: current.families.map((family) => ({
            ...family,
            tiles: family.tiles.map((candidate) => candidate.id === historyTile.id ? historyTile : candidate)
          }))
        }));
      })
      .catch(() => loadedHistoryAssignmentsRef.current.delete(historyKey));
  }, [effectiveProcessId]);

  useEffect(() => {
    if (document.body.dataset.perfTestMode === "1") {
      requestAnimationFrame(() => performance.mark("waferwatch:route-dom-ready"));
    }
  }, []);

  if (effectiveProcessId !== processId) {
    return <div className="p-6 text-sm text-[#6f6f68]">Loading the selected process status…</div>;
  }

  return (
    <div data-workspace-revision={workspace.snapshot?.revision}>
      <WaferStatusView {...props} model={model} processId={processId} onHistoryRequested={requestHistory} />
    </div>
  );
}
