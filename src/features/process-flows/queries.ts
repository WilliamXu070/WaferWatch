import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function listProcessTemplates() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("process_templates")
    .select("*, process_steps(*)")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export async function getProcessTemplate(templateId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("process_templates")
    .select("*, process_steps(*)")
    .eq("id", templateId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getActiveAssignmentForWafer(waferId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("wafer_process_assignments")
    .select("*, process_templates(*)")
    .eq("wafer_id", waferId)
    .in("status", ["planned", "queued", "in_progress", "on_hold"])
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
