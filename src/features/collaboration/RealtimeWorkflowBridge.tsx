"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { parseWorkspaceDelta, parseWorkspaceSnapshot } from "@/features/workspace/types";
import {
  applyProcessWorkspaceDelta,
  setProcessWorkspaceSnapshot
} from "@/features/workspace/store";

export function RealtimeWorkflowBridge({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter();
  const processTemplateId = useSearchParams().get("processId");
  const refreshTimerRef = useRef<number | null>(null);
  const revisionRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const supabase = createClient();
    const channels: ReturnType<typeof supabase.channel>[] = [];
    let active = true;
    let deltaQueue = Promise.resolve();
    const scheduleRefresh = (payload: unknown) => {
      if (!isWorkflowBroadcastPayload(payload)) return;
      window.dispatchEvent(new CustomEvent(WORKFLOW_REALTIME_EVENT, { detail: payload }));
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
          await loadSnapshot();
          return;
        }
        revisionRef.current = delta.revision;
        window.dispatchEvent(new CustomEvent(WORKFLOW_DELTA_EVENT, { detail: delta }));
        hasMore = delta.hasMore;
      }
    };

    const scheduleDelta = (payload: unknown) => {
      if (!isWorkflowRevisionBroadcastPayload(payload) || payload.processTemplateId !== processTemplateId) return;
      deltaQueue = deltaQueue
        .then(() => applyCommittedRevisions(payload.revision))
        .catch(() => loadSnapshot());
    };

    const topics = [
      WORKFLOW_LIBRARY_TOPIC,
      ...(processTemplateId ? [getWorkflowProcessTopic(processTemplateId)] : [])
    ];

    void loadSnapshot().catch(() => undefined);
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
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [enabled, processTemplateId, router]);

  return null;
}
