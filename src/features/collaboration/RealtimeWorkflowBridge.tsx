"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getWorkflowRefreshDebounceMs,
  getWorkflowProcessTopic,
  isWorkflowBroadcastPayload,
  isWorkflowRevisionBroadcastPayload,
  WORKFLOW_BROADCAST_EVENT,
  WORKFLOW_DELTA_EVENT,
  WORKFLOW_LIBRARY_TOPIC,
  WORKFLOW_REVISION_BROADCAST_EVENT,
  WORKFLOW_REALTIME_EVENT
} from "./realtime";
import { parseHotBootstrap, parseWorkspaceDelta, parseWorkspaceSnapshot, type WorkspaceHotLoadingMode } from "@/features/workspace/types";
import {
  applyProcessWorkspaceDelta,
  getProcessWorkspaceState,
  setProcessWorkspaceHotBootstrap,
  setProcessWorkspaceSnapshot
} from "@/features/workspace/store";
import { useWorkspaceSession } from "@/features/workspace/WorkspaceSessionProvider";

export function RealtimeWorkflowBridge({
  activeProcessId,
  hotLoadingMode = "off",
  enabled = true
}: {
  activeProcessId: string | null;
  hotLoadingMode?: WorkspaceHotLoadingMode;
  enabled?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const workspaceSession = useWorkspaceSession();
  const processTemplateId = hotLoadingMode === "on"
    ? workspaceSession.activeProcessId
    : activeProcessId;
  const appliesOrderedWorkspace = hotLoadingMode === "on" || pathname !== "/wafer-status";
  const refreshTimerRef = useRef<number | null>(null);
  const revisionRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const supabase = createClient();
    const channels: ReturnType<typeof supabase.channel>[] = [];
    let active = true;
    let deltaQueue = Promise.resolve();
    revisionRef.current = processTemplateId
      ? getProcessWorkspaceState(processTemplateId).snapshot?.revision ?? 0
      : 0;
    const scheduleRefresh = (payload: unknown) => {
      if (!isWorkflowBroadcastPayload(payload)) return;
      window.dispatchEvent(new CustomEvent(WORKFLOW_REALTIME_EVENT, { detail: payload }));
      if (hotLoadingMode === "on") return;
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        router.refresh();
      }, getWorkflowRefreshDebounceMs(payload));
    };

    const loadSnapshot = async () => {
      if (!processTemplateId) return;
      const response = await fetch(`/api/processes/${processTemplateId}/workspace`, { cache: "no-store" });
      if (!response.ok) throw new Error("The process workspace snapshot could not be loaded.");
      const snapshot = parseWorkspaceSnapshot(await response.json());
      if (!active) return;
      revisionRef.current = snapshot.revision;
      setProcessWorkspaceSnapshot(snapshot);

      if (hotLoadingMode === "shadow") {
        const bootstrapResponse = await fetch(`/api/processes/${processTemplateId}/bootstrap`, { cache: "no-store" });
        if (!bootstrapResponse.ok) return;
        const bootstrap = parseHotBootstrap(await bootstrapResponse.json());
        const mismatch = bootstrap.templateId !== snapshot.templateId
          || bootstrap.revision !== snapshot.revision
          || bootstrap.currentState.length !== snapshot.currentState.length
          || bootstrap.processDefinition.steps.length !== snapshot.processDefinition.steps.length
          || bootstrap.processDefinition.transitions.length !== snapshot.processDefinition.transitions.length;
        if (mismatch) {
          window.dispatchEvent(new CustomEvent("waferwatch:workspace-shadow-mismatch", {
            detail: {
              templateId: processTemplateId,
              bootstrapRevision: bootstrap.revision,
              snapshotRevision: snapshot.revision
            }
          }));
        }
      }
    };

    const loadHotBootstrap = async () => {
      if (!processTemplateId) return;
      const response = await fetch(`/api/processes/${processTemplateId}/bootstrap`, { cache: "no-store" });
      if (!response.ok) throw new Error("The process hot bootstrap could not be loaded.");
      const bootstrap = parseHotBootstrap(await response.json());
      if (!active) return;
      revisionRef.current = bootstrap.revision;
      setProcessWorkspaceHotBootstrap(bootstrap);
    };

    const recoverWorkspace = async () => {
      if (hotLoadingMode === "on") return loadHotBootstrap();
      return loadSnapshot();
    };

    const applyCommittedRevisions = async (targetRevision: number) => {
      if (!processTemplateId || targetRevision <= revisionRef.current) return;
      let hasMore = true;
      while (active && hasMore && revisionRef.current < targetRevision) {
        const response = await fetch(
          `/api/processes/${processTemplateId}/workspace?afterRevision=${revisionRef.current}`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("The process workspace delta could not be loaded.");
        const delta = parseWorkspaceDelta(await response.json());
        if (delta.hasGap || !applyProcessWorkspaceDelta(delta)) {
          await recoverWorkspace();
          return;
        }
        revisionRef.current = delta.revision;
        window.dispatchEvent(new CustomEvent(WORKFLOW_DELTA_EVENT, { detail: delta }));
        if (document.body.dataset.perfTestMode === "1") {
          performance.mark("waferwatch:second-session-delta-applied");
        }
        hasMore = delta.hasMore;
      }
    };

    const scheduleDelta = (payload: unknown) => {
      if (!isWorkflowRevisionBroadcastPayload(payload) || payload.processTemplateId !== processTemplateId) return;
      const cachedRevision = processTemplateId
        ? getProcessWorkspaceState(processTemplateId).snapshot?.revision ?? 0
        : 0;
      if (cachedRevision >= payload.revision) {
        revisionRef.current = Math.max(revisionRef.current, cachedRevision);
        return;
      }
      if (!appliesOrderedWorkspace) {
        router.refresh();
        return;
      }
      deltaQueue = deltaQueue
        .then(() => applyCommittedRevisions(payload.revision))
        .catch(() => recoverWorkspace());
    };

    const topics = [
      WORKFLOW_LIBRARY_TOPIC,
      ...(processTemplateId ? [getWorkflowProcessTopic(processTemplateId)] : [])
    ];

    if (appliesOrderedWorkspace) {
      const existingRevision = processTemplateId
        ? getProcessWorkspaceState(processTemplateId).snapshot?.revision
        : undefined;
      if (hotLoadingMode === "on") {
        if (existingRevision === undefined) void loadHotBootstrap().catch(() => undefined);
      } else {
        void loadSnapshot().catch(() => undefined);
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      const recoveryMs = Number(document.body.dataset.focusRecoveryMs ?? 60_000);
      if (hotLoadingMode !== "on" || hiddenAt === null || Date.now() - hiddenAt <= recoveryMs) return;
      deltaQueue = deltaQueue
        .then(() => applyCommittedRevisions(Number.MAX_SAFE_INTEGER))
        .catch(() => recoverWorkspace());
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void supabase.realtime.setAuth().then(() => {
      if (!active) return;
      for (const topic of topics) {
        const channel = supabase
          .channel(topic, { config: { private: true } })
          .on(
            "broadcast",
            { event: WORKFLOW_BROADCAST_EVENT },
            (message) => scheduleRefresh(message.payload)
          )
          .on(
            "broadcast",
            { event: WORKFLOW_REVISION_BROADCAST_EVENT },
            (message) => scheduleDelta(message.payload)
          )
          .subscribe();
        channels.push(channel);
      }
    });

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [appliesOrderedWorkspace, enabled, hotLoadingMode, processTemplateId, router]);

  return null;
}
