import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function listProjects() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function getProject(projectId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, project_members(*), wafer_lots(*), wafers(*)")
    .eq("id", projectId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}
