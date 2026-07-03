import "server-only";

import { getProcessCalendarSchedule } from "@/features/calendar/queries";
import { getProcessDashboardData } from "@/features/process-flows/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
  WireframeTextSurfaceSource,
  WireframeWaferSource,
  WireframeWaferViewerDto
} from "./types";

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
