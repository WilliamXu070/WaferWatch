"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const REALTIME_WORKFLOW_TABLES = [
  "process_templates",
  "process_steps",
  "process_step_transitions",
  "process_calendar_events",
  "process_calendar_event_people",
  "wafer_process_assignments",
  "step_executions",
  "wafers",
  "process_events",
  "text_surfaces",
  "die_inspections"
] as const;

const REFRESH_DEBOUNCE_MS = 120;

export function RealtimeWorkflowBridge({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter();
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const supabase = createClient();
    let channel = supabase.channel(`workflow-state:${crypto.randomUUID()}`);
    const scheduleRefresh = (table: string) => {
      window.dispatchEvent(new CustomEvent("waferwatch:realtime-change", { detail: { table } }));
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    };

    for (const table of REALTIME_WORKFLOW_TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => scheduleRefresh(table)
      );
    }

    channel.subscribe();

    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [enabled, router]);

  return null;
}
