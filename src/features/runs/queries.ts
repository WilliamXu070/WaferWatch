import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function listStepExecutionsForWafer(waferId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("step_executions")
    .select("*, process_steps(*), fabrication_tools(*), recipes(*)")
    .eq("wafer_id", waferId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export async function getUpcomingReservations(projectId: string, fromIso: string, toIso: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("tool_reservations")
    .select("*, fabrication_tools(*), step_executions(*)")
    .eq("project_id", projectId)
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso)
    .order("starts_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}
