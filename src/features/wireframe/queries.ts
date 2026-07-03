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
  display_name: string;
};

function getDisplayName(profile: WireframeShellProfile) {
  return profile.display_name.trim() || "Process user";
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

export async function getWireframeShellModel(): Promise<WireframeShellDto> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return {
      currentProcess: null,
      calendarEventCount: 0,
      teamMembers: []
    };
  }

  const templateResult = await supabase
    .from("process_templates")
    .select("id, name, version")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (templateResult.error) {
    throw templateResult.error;
  }

  const activeTemplate = templateResult.data;
  const [assignmentsResult, calendarResult, profilesResult] = await Promise.all([
    activeTemplate
      ? supabase
          .from("wafer_process_assignments")
          .select("id", { count: "exact", head: true })
          .eq("template_id", activeTemplate.id)
          .in("status", [...ACTIVE_ASSIGNMENT_STATUSES])
      : Promise.resolve({ count: 0, error: null }),
    activeTemplate
      ? supabase
          .from("process_calendar_events")
          .select("id", { count: "exact", head: true })
          .eq("process_template_id", activeTemplate.id)
      : Promise.resolve({ count: 0, error: null }),
    supabase
      .from("process_people")
      .select("id, display_name")
      .eq("is_active", true)
      .order("display_name", { ascending: true })
      .limit(3)
  ]);

  if (assignmentsResult.error) {
    throw assignmentsResult.error;
  }

  if (calendarResult.error) {
    throw calendarResult.error;
  }

  if (profilesResult.error) {
    throw profilesResult.error;
  }

  const teamMembers = ((profilesResult.data ?? []) as WireframeShellProfile[]).map((profile) => {
    const name = getDisplayName(profile);

    return {
      id: profile.id,
      initials: getInitials(name),
      name,
      role: "Process team"
    };
  });

  return {
    currentProcess: activeTemplate
      ? {
          id: activeTemplate.id,
          name: activeTemplate.name,
          version: activeTemplate.version,
          activeDieCount: assignmentsResult.count ?? 0
        }
      : null,
    calendarEventCount: calendarResult.count ?? 0,
    teamMembers
  };
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
