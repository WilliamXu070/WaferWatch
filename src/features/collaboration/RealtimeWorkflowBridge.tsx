"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getWorkflowProcessTopic,
  isWorkflowBroadcastPayload,
  WORKFLOW_BROADCAST_EVENT,
  WORKFLOW_LIBRARY_TOPIC,
  WORKFLOW_REALTIME_EVENT
} from "./realtime";

const REFRESH_DEBOUNCE_MS = 350;

export function RealtimeWorkflowBridge({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter();
  const processTemplateId = useSearchParams().get("processId");
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const supabase = createClient();
    const channels: ReturnType<typeof supabase.channel>[] = [];
    let active = true;
    const scheduleRefresh = (payload: unknown) => {
      if (!isWorkflowBroadcastPayload(payload)) return;
      window.dispatchEvent(new CustomEvent(WORKFLOW_REALTIME_EVENT, { detail: payload }));
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    };

    const topics = [
      WORKFLOW_LIBRARY_TOPIC,
      ...(processTemplateId ? [getWorkflowProcessTopic(processTemplateId)] : [])
    ];

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
