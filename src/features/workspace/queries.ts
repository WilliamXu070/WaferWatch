import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseHotBootstrap, parseWorkspaceDelta, parseWorkspaceSnapshot } from "./types";
import { withServerPerformanceSpan } from "@/features/performance/server";

export async function getProcessHotBootstrap(
  templateId: string,
  rangeStart: string,
  rangeEnd: string
) {
  return withServerPerformanceSpan("hot_bootstrap_rpc", { templateId }, async () => {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("get_process_hot_bootstrap", {
      target_template_id: templateId,
      range_start: rangeStart,
      range_end: rangeEnd
    });
    if (error) throw error;
    return parseHotBootstrap(data);
  });
}

export async function getProcessWorkspaceSnapshot(templateId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_process_workspace_snapshot", {
    target_template_id: templateId
  });
  if (error) throw error;
  return parseWorkspaceSnapshot(data);
}

export async function getProcessWorkspaceDelta(templateId: string, afterRevision: number) {
  return withServerPerformanceSpan("workspace_delta_rpc", { templateId, afterRevision }, async () => {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("get_process_workspace_delta", {
      target_template_id: templateId,
      after_revision: afterRevision
    });
    if (error) throw error;
    return parseWorkspaceDelta(data);
  });
}
