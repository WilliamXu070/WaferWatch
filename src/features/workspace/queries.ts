import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseWorkspaceDelta, parseWorkspaceSnapshot } from "./types";

export async function getProcessWorkspaceSnapshot(templateId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_process_workspace_snapshot", {
    target_template_id: templateId
  });
  if (error) throw error;
  return parseWorkspaceSnapshot(data);
}

export async function getProcessWorkspaceDelta(templateId: string, afterRevision: number) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_process_workspace_delta", {
    target_template_id: templateId,
    after_revision: afterRevision
  });
  if (error) throw error;
  return parseWorkspaceDelta(data);
}
