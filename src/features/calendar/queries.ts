import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getCalendarEvents(projectId: string, fromIso: string, toIso: string) {
  const supabase = await createServerSupabaseClient();
  const [reservations, plannedSteps] = await Promise.all([
    supabase
      .from("tool_reservations")
      .select("*, fabrication_tools(*)")
      .eq("project_id", projectId)
      .gte("starts_at", fromIso)
      .lte("starts_at", toIso)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true }),
    supabase
      .from("step_executions")
      .select("*, process_steps(*), wafers!inner(project_id, wafer_code)")
      .gte("planned_start_at", fromIso)
      .lte("planned_start_at", toIso)
      .order("planned_start_at", { ascending: true })
  ]);

  if (reservations.error) {
    throw reservations.error;
  }

  if (plannedSteps.error) {
    throw plannedSteps.error;
  }

  const filteredSteps =
    plannedSteps.data?.filter((step) => {
      const wafer = Array.isArray(step.wafers) ? step.wafers[0] : step.wafers;
      return wafer?.project_id === projectId;
    }) ?? [];

  return {
    reservations: reservations.data ?? [],
    plannedSteps: filteredSteps
  };
}
