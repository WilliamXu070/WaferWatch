"use client";

import { useEffect, useMemo, useState } from "react";
import { useProcessWorkspace } from "@/features/workspace/store";
import type { DashboardModel } from "../types";
import type { Json } from "@/types/database";
import { DashboardView } from "./DashboardView";
import { useWorkspaceSession } from "@/features/workspace/WorkspaceSessionProvider";

function record(value: Json) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : null;
}

function derivedDashboard(currentState: Json[], calendar: Json[]): DashboardModel {
  let completed = 0;
  let total = 0;
  let blocked = 0;
  for (const value of currentState) {
    const row = record(value);
    if (!row) continue;
    if (row.current_member_status === "blocked" || row.current_member_status === "failed") blocked += 1;
    if (!Array.isArray(row.stage_progress)) continue;
    for (const stageValue of row.stage_progress) {
      const stage = record(stageValue);
      if (!stage) continue;
      completed += typeof stage.completedSteps === "number" ? stage.completedSteps : 0;
      total += typeof stage.totalSteps === "number" ? stage.totalSteps : 0;
    }
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (4 - index));
    return date;
  });
  const scheduled = new Map(days.map((date) => [date.toISOString().slice(0, 10), 0]));
  for (const value of calendar) {
    const row = record(value);
    const startsAt = typeof row?.starts_at === "string" ? new Date(row.starts_at) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) continue;
    const key = startsAt.toISOString().slice(0, 10);
    if (scheduled.has(key)) scheduled.set(key, (scheduled.get(key) ?? 0) + 1);
  }
  return {
    activity: {
      title: "Process activity",
      max: 30,
      bars: days.map((date) => ({
        label: date.toLocaleDateString("en-US", { weekday: "short" }),
        value: 0,
        compareValue: scheduled.get(date.toISOString().slice(0, 10)) ?? 0
      }))
    },
    progress: {
      title: "Step progress",
      percent: total ? Math.round((completed / total) * 100) : 0,
      caption: total === 0 ? "No step data" : blocked ? "Needs attention" : completed === total ? "Complete" : "In progress",
      footer: `${completed}/${total} steps complete`
    },
    stats: [
      { id: "active-wafers", value: String(currentState.length), label: "Active wafers", icon: "activity", href: "/process-flow" },
      { id: "blocked-failed", value: String(blocked), label: "Blocked / failed", icon: "warning", href: "/process-flow" }
    ],
    plannedBatches: [],
    reviewQueue: [],
    batchHistory: []
  };
}

export function HotDashboardView({ processId }: { processId: string }) {
  const workspaceSession = useWorkspaceSession();
  const effectiveProcessId = workspaceSession.activeProcessId ?? processId;
  const workspace = useProcessWorkspace(effectiveProcessId);
  const snapshot = workspace.optimisticSnapshot ?? workspace.snapshot;
  const immediate = useMemo(() => derivedDashboard(
    snapshot?.currentState ?? [],
    snapshot?.calendar ?? []
  ), [snapshot]);
  const [lazyDashboard, setLazyDashboard] = useState<{
    processId: string;
    dashboard: DashboardModel;
  } | null>(null);

  useEffect(() => {
    if (!snapshot) return;
    if (document.body.dataset.perfTestMode === "1") {
      requestAnimationFrame(() => performance.mark("waferwatch:route-dom-ready"));
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/processes/${effectiveProcessId}/dashboard`, {
        cache: "no-store",
        signal: controller.signal
      }).then(async (response) => {
        if (response.ok && !controller.signal.aborted) {
          setLazyDashboard({ processId: effectiveProcessId, dashboard: await response.json() as DashboardModel });
        }
      }).catch(() => undefined);
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [effectiveProcessId, snapshot]);

  return (
    <DashboardView
      dashboard={lazyDashboard?.processId === effectiveProcessId ? lazyDashboard.dashboard : immediate}
      workspaceRevision={snapshot?.revision}
    />
  );
}
