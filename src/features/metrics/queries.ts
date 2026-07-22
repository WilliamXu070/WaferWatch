import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getWaferCycleMetrics(projectId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("vw_wafer_cycle_time")
    .select("*")
    .eq("project_id", projectId)
    .order("started_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function getStepCycleMetrics(projectId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("vw_step_cycle_metrics")
    .select("*")
    .eq("project_id", projectId)
    .order("completed_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function getWipByStage(projectId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("vw_wip_by_stage")
    .select("*")
    .eq("project_id", projectId)
    .order("process_area", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export async function getProjectMetricSummary(projectId: string) {
  const [cycleTimes, stepMetrics, wip] = await Promise.all([
    getWaferCycleMetrics(projectId),
    getStepCycleMetrics(projectId),
    getWipByStage(projectId)
  ]);

  const completedCycleTimes = cycleTimes
    .map((row) => row.total_cycle_hours)
    .filter((value): value is number => typeof value === "number");

  const averageCycleHours =
    completedCycleTimes.length === 0
      ? null
      : completedCycleTimes.reduce((sum, value) => sum + value, 0) / completedCycleTimes.length;

  const blockedSteps = stepMetrics.filter((row) => row.status === "blocked").length;

  return {
    averageCycleHours,
    completedWaferCount: completedCycleTimes.length,
    activeWipCount: wip.reduce((sum, row) => sum + (row.wafer_count ?? 0), 0),
    blockedSteps,
    cycleTimes,
    stepMetrics,
    wip
  };
}
