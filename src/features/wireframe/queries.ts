import "server-only";

import { getProcessCalendarSchedule } from "@/features/calendar/queries";
import { getProcessDashboardData } from "@/features/process-flows/queries";
import { createServerSupabaseClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import type { FabricationStatus } from "@/types/database";
import {
  createEmptyWireframeDashboardDto,
  createEmptyWireframeProcessFlowDto,
  createEmptyWireframeWaferViewerDto,
  createWireframeEmptyState,
  mapProcessCalendarScheduleToWireframeCalendar,
  mapProcessDashboardDataToWireframeDashboard,
  mapProcessDashboardDataToWireframeProcessFlow,
  mapWafersToWireframeWaferViewer
} from "./mappers";
import type {
  WireframeCalendarDto,
  WireframeDashboardDto,
  WireframeProcessFlowDto,
  WireframeShellDto,
  WireframeTextSurfaceSource,
  WireframeWaferSource,
  WireframeWaferViewerDto
} from "./types";
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

export async function getWireframeShellModel(): Promise<WireframeShellDto> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return {
      currentUser: null,
      currentProcess: null,
      processes: [],
      calendarEventCount: 0,
      teamMembers: []
    };
  }

  const [templatesResult, currentProfileResult] = await Promise.all([
    supabase
      .from("process_templates")
      .select("id, name, version, owner_project_id")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(24),
    supabase
      .from("profiles")
      .select("id, display_name, email, role, is_active")
      .eq("id", claimsData.claims.sub)
      .single()
  ]);

  if (templatesResult.error) {
    throw templatesResult.error;
  }

  if (currentProfileResult.error) {
    throw currentProfileResult.error;
  }

  const activeTemplates = templatesResult.data ?? [];
  const activeTemplate = activeTemplates[0] ?? null;
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
    activeTemplate
      ? supabase
          .from("process_calendar_events")
          .select("id", { count: "exact", head: true })
          .eq("process_template_id", activeTemplate.id)
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
    currentUser: mapProfileToTeamIdentity(currentProfileResult.data as TeamDirectoryProfile),
    currentProcess: activeTemplate
      ? {
          id: activeTemplate.id,
          name: activeTemplate.name,
          version: activeTemplate.version,
          activeDieCount: activeDieCountByTemplate.get(activeTemplate.id) ?? 0
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

export async function getWireframeDashboardData(
  processTemplateId: string | null | undefined,
  calendarDays = 14
): Promise<WireframeDashboardDto> {
  if (!processTemplateId) {
    return createEmptyWireframeDashboardDto();
  }

  const source = await getProcessDashboardData(processTemplateId, calendarDays, true);
  return mapProcessDashboardDataToWireframeDashboard(source);
}

export async function getWireframeProcessFlowData(
  processTemplateId: string | null | undefined
): Promise<WireframeProcessFlowDto> {
  if (!processTemplateId) {
    return createEmptyWireframeProcessFlowDto();
  }

  const source = await getProcessDashboardData(processTemplateId, 0, false);
  return mapProcessDashboardDataToWireframeProcessFlow(source);
}

export async function getWireframeCalendarData(input: {
  processTemplateId: string | null | undefined;
  fromIso: string;
  toIso: string;
}): Promise<WireframeCalendarDto> {
  if (!input.processTemplateId) {
    return {
      processId: "",
      fromIso: input.fromIso,
      toIso: input.toIso,
      locations: ["McMaster", "Waterloo", "Toronto"],
      people: [],
      events: [],
      emptyStates: [
        createWireframeEmptyState("no-process"),
        createWireframeEmptyState("no-calendar-events")
      ]
    };
  }

  const schedule = await getProcessCalendarSchedule(
    input.processTemplateId,
    input.fromIso,
    input.toIso
  );

  return mapProcessCalendarScheduleToWireframeCalendar({
    processId: input.processTemplateId,
    fromIso: input.fromIso,
    toIso: input.toIso,
    events: schedule.events,
    people: schedule.people
  });
}

export async function getWireframeWaferViewerData(
  projectId: string | null | undefined
): Promise<WireframeWaferViewerDto> {
  if (!projectId) {
    return createEmptyWireframeWaferViewerDto("");
  }

  const supabase = await createServerSupabaseClient();
  const [wafersResult, textSurfacesResult] = await Promise.all([
    supabase
      .from("wafers")
      .select("id, project_id, wafer_code, status, notes, metadata, created_at")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .is("archived_at", null)
      .order("wafer_code", { ascending: true }),
    supabase
      .from("text_surfaces")
      .select("scope_type, scope_key, field_key, value")
      .eq("project_id", projectId)
      .in("scope_type", ["wafer", "wafer_status", "wireframe:wafer"])
  ]);

  if (wafersResult.error) {
    throw wafersResult.error;
  }

  if (textSurfacesResult.error) {
    throw textSurfacesResult.error;
  }

  return mapWafersToWireframeWaferViewer({
    projectId,
    wafers: (wafersResult.data ?? []) as WireframeWaferSource[],
    textSurfaces: (textSurfacesResult.data ?? []) as WireframeTextSurfaceSource[]
  });
}
