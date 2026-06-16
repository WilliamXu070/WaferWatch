import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

type DashboardStep = {
  id: string;
  template_id: string;
  name: string;
  step_order: number;
  process_area: string;
  expected_duration_minutes: number | null;
};

type DashboardTemplate = {
  id: string;
  name: string;
  version: string;
  description: string | null;
  process_steps: DashboardStep[];
};

export async function getDashboardSnapshot() {
  const supabase = createSupabaseAdminClient();

  const [
    templates,
    steps,
    tools,
    projects,
    wafers,
    activeSteps,
    storageBuckets
  ] = await Promise.all([
    supabase
      .from("process_templates")
      .select("id, name, version, description")
      .order("name", { ascending: true }),
    supabase
      .from("process_steps")
      .select("id, template_id, name, step_order, process_area, expected_duration_minutes")
      .order("step_order", { ascending: true }),
    supabase
      .from("fabrication_tools")
      .select("id, name, tool_type, location, status")
      .order("name", { ascending: true }),
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("wafers").select("id", { count: "exact", head: true }),
    supabase
      .from("step_executions")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "running", "blocked"]),
    supabase.storage.listBuckets()
  ]);

  const templatesWithSteps: DashboardTemplate[] =
    templates.data?.map((template) => ({
      ...template,
      process_steps: (steps.data ?? []).filter((step) => step.template_id === template.id)
    })) ?? [];

  return {
    templates: templatesWithSteps,
    tools: tools.data ?? [],
    counts: {
      projects: projects.count ?? 0,
      wafers: wafers.count ?? 0,
      activeSteps: activeSteps.count ?? 0,
      storageBuckets:
        storageBuckets.data?.filter((bucket) => bucket.name.startsWith("wafer-")).length ?? 0
    },
    errors: [
      templates.error?.message,
      steps.error?.message,
      tools.error?.message,
      projects.error?.message,
      wafers.error?.message,
      activeSteps.error?.message,
      storageBuckets.error?.message
    ].filter((message): message is string => Boolean(message))
  };
}
