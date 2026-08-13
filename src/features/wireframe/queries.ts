import "server-only";

import { getCurrentAccount, type AccountContext } from "@/lib/auth/session";
import { createServerSupabaseClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  resolveActiveProcess,
  type ActiveProcessSelection
} from "@/features/process-selection/server";
import type { FabricationStatus } from "@/types/database";
import type { WireframeShellDto } from "./types";
import {
  mapProfileToTeamIdentity,
  mapProfilesToTeamMembers,
  type TeamDirectoryProfile
} from "./teamDirectory";

const ACTIVE_ASSIGNMENT_STATUSES: readonly FabricationStatus[] = [
  "planned",
  "queued",
  "in_progress",
  "on_hold"
];

export async function getWireframeShellModel(
  knownAccount?: AccountContext | null,
  knownActiveProcess?: ActiveProcessSelection | null
): Promise<WireframeShellDto> {
  const account = knownAccount ?? await getCurrentAccount();

  if (!account) {
    return {
      currentUser: null,
      currentProcess: null,
      processes: [],
      calendarEventCount: 0,
      teamMembers: []
    };
  }

  const activeProcess = knownActiveProcess === undefined
    ? await resolveActiveProcess(account)
    : knownActiveProcess;
  const supabase = await createServerSupabaseClient();
  const templatesResult = await supabase
    .from("process_templates")
    .select("id, name, version, owner_project_id")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(24);

  if (templatesResult.error) {
    throw templatesResult.error;
  }

  const newestActiveTemplates = templatesResult.data ?? [];
  const activeTemplates = activeProcess && !newestActiveTemplates.some((template) => template.id === activeProcess.id)
    ? [activeProcess, ...newestActiveTemplates.slice(0, 23)]
    : newestActiveTemplates;
  const templateIds = activeTemplates.map((template) => template.id);
  const [assignmentsResult, calendarResult] = await Promise.all([
    templateIds.length
      ? supabase
          .from("wafer_process_assignments")
          .select("template_id")
          .in("template_id", templateIds)
          .is("deleted_at", null)
          .is("archived_at", null)
          .in("status", [...ACTIVE_ASSIGNMENT_STATUSES])
      : Promise.resolve({ data: [], error: null }),
    activeProcess
      ? supabase
          .from("process_calendar_events")
          .select("id", { count: "exact", head: true })
          .eq("process_template_id", activeProcess.id)
      : Promise.resolve({ count: 0, error: null })
  ]);

  if (assignmentsResult.error) {
    throw assignmentsResult.error;
  }

  if (calendarResult.error) {
    throw calendarResult.error;
  }

  const teamMembers = await getActiveProfileTeamMembers();
  const activeDieCountByTemplate = new Map<string, number>();
  for (const assignment of assignmentsResult.data ?? []) {
    activeDieCountByTemplate.set(
      assignment.template_id,
      (activeDieCountByTemplate.get(assignment.template_id) ?? 0) + 1
    );
  }
  const processes = activeTemplates.map((template) => ({
    id: template.id,
    name: template.name,
    version: template.version,
    activeDieCount: activeDieCountByTemplate.get(template.id) ?? 0
  }));

  return {
    currentUser: mapProfileToTeamIdentity(account.profile as TeamDirectoryProfile),
    currentProcess: activeProcess
      ? {
          id: activeProcess.id,
          name: activeProcess.name,
          version: activeProcess.version,
          activeDieCount: activeDieCountByTemplate.get(activeProcess.id) ?? 0
        }
      : null,
    processes,
    calendarEventCount: calendarResult.count ?? 0,
    teamMembers
  };
}

async function getActiveProfileTeamMembers(): Promise<WireframeShellDto["teamMembers"]> {
  // The caller has already authenticated the request; return only the limited directory DTO below.
  const supabase = createSupabaseAdminClient();
  const profilesResult = await supabase
    .from("profiles")
    .select("id, display_name, email, role, is_active")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (profilesResult.error) {
    throw profilesResult.error;
  }

  return mapProfilesToTeamMembers((profilesResult.data ?? []) as TeamDirectoryProfile[]);
}
