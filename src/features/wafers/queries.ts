import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function listWafers(projectId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("wafers")
    .select("*, wafer_lots(*)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function getWafer(waferId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("wafers")
    .select("*, wafer_lots(*), wafer_process_assignments(*)")
    .eq("id", waferId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getWaferTimeline(waferId: string) {
  const supabase = await createServerSupabaseClient();
  const [steps, events, measurements, issues] = await Promise.all([
    supabase
      .from("step_executions")
      .select("*, process_steps(*), fabrication_tools(*), recipes(*)")
      .eq("wafer_id", waferId)
      .order("created_at", { ascending: true }),
    supabase
      .from("process_events")
      .select("*")
      .eq("wafer_id", waferId)
      .order("event_at", { ascending: true }),
    supabase
      .from("measurements")
      .select("*")
      .eq("wafer_id", waferId)
      .order("measured_at", { ascending: true }),
    supabase
      .from("process_issues")
      .select("*")
      .eq("wafer_id", waferId)
      .order("opened_at", { ascending: true })
  ]);

  for (const result of [steps, events, measurements, issues]) {
    if (result.error) {
      throw result.error;
    }
  }

  return {
    steps: steps.data ?? [],
    events: events.data ?? [],
    measurements: measurements.data ?? [],
    issues: issues.data ?? []
  };
}
