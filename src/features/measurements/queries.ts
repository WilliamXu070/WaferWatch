import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function listMeasurementsForWafer(waferId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("measurements")
    .select("*")
    .eq("wafer_id", waferId)
    .order("measured_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function listOpenIssues(projectId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("process_issues")
    .select("*")
    .eq("project_id", projectId)
    .in("status", ["open", "investigating"])
    .order("opened_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}
