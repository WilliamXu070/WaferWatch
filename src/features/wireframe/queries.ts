import "server-only";

import { getProcessCalendarSchedule } from "@/features/calendar/queries";
import { getProcessDashboardData } from "@/features/process-flows/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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

const ACTIVE_ASSIGNMENT_STATUSES: readonly FabricationStatus[] = [
  "planned",
  "queued",
  "in_progress",
  "on_hold"
];

type WireframeShellProfile = {
  id: string;
  display_name: string | null;
  email?: string | null;
};

function getDisplayName(profile: WireframeShellProfile) {
  return profile.display_name?.trim() || profile.email?.trim() || "Process user";
}

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "WW";
}

function getProjectMemberRoleLabel(role: string | null | undefined) {
  if (role === "owner") {
    return "Project owner";
  }

  if (role === "editor") {
    return "Process team";
  }

  return "Viewer";
}

function getProfileRoleLabel(role: string | null | undefined) {
  if (role === "admin") {
    return "Admin";
  }

  if (role === "process_engineer") {
    return "Process team";
  }

  if (role === "researcher") {
    return "Researcher";
  }

  return "Viewer";
}

function isVisibleUserProfile(profile: WireframeShellProfile) {
  const name = profile.display_name?.trim().toLowerCase() ?? "";
  const email = profile.email?.trim().toLowerCase() ?? "";

  return (
    name !== "waferwatch admin" &&
    name !== "waferwatch viewer" &&
    email !== "admin@waferwatch.local" &&
    email !== "viewer@waferwatch.local"
  );
}

export async function getWireframeShellModel(): Promise<WireframeShellDto> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return {
      currentProcess: null,
      processes: [],
      calendarEventCount: 0,
      teamMembers: []
    };
  }

  const templatesResult = await supabase
    .from("process_templates")
    .select("id, name, version, owner_project_id")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(24);

  if (templatesResult.error) {
    throw templatesResult.error;
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

  const teamMembers = activeTemplate?.owner_project_id
    ? await getProjectTeamMembers(activeTemplate.owner_project_id)
    : await getActiveProfileTeamMembers();
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

async function getProjectTeamMembers(projectId: string): Promise<WireframeShellDto["teamMembers"]> {
  const supabase = await createServerSupabaseClient();
  const membersResult = await supabase
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(6);

  if (membersResult.error) {
    throw membersResult.error;
  }

  const memberRows = membersResult.data ?? [];
  const userIds = memberRows.map((member) => member.user_id).filter((id): id is string => Boolean(id));
  if (!userIds.length) {
    return [];
  }

  const profilesResult = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", userIds)
    .eq("is_active", true);

  if (profilesResult.error) {
    throw profilesResult.error;
  }

  const profilesById = new Map(
    ((profilesResult.data ?? []) as WireframeShellProfile[])
      .filter(isVisibleUserProfile)
      .map((profile) => [profile.id, profile])
  );

  return memberRows
    .map((member) => {
      const profile = profilesById.get(member.user_id);
      if (!profile) {
        return null;
      }

      const name = getDisplayName(profile);
      return {
        id: profile.id,
        initials: getInitials(name),
        name,
        role: getProjectMemberRoleLabel(member.role)
      };
    })
    .filter((member): member is WireframeShellDto["teamMembers"][number] => Boolean(member));
}

async function getActiveProfileTeamMembers(): Promise<WireframeShellDto["teamMembers"]> {
  const supabase = await createServerSupabaseClient();
  const profilesResult = await supabase
    .from("profiles")
    .select("id, display_name, email, role")
    .eq("is_active", true)
    .order("display_name", { ascending: true })
    .limit(6);

  if (profilesResult.error) {
    throw profilesResult.error;
  }

  return ((profilesResult.data ?? []) as Array<WireframeShellProfile & { role?: string | null }>)
    .filter(isVisibleUserProfile)
    .map((profile) => {
      const name = getDisplayName(profile);

      return {
        id: profile.id,
        initials: getInitials(name),
        name,
        role: getProfileRoleLabel(profile.role)
      };
    });
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
