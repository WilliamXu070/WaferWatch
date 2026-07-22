import "server-only";

import { isVisibleTeamProfile, type TeamDirectoryProfile } from "@/features/wireframe/teamDirectory";
import { requireAccount } from "@/lib/auth/session";
import { createServerSupabaseClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Json, ProcessCalendarEvent, ProcessPerson } from "@/types/database";

export type ProcessCalendarLocation = "McMaster" | "Waterloo" | "Toronto";

export type ProcessCalendarPersonOption = Pick<ProcessPerson, "id" | "display_name">;

export type ProcessCalendarEventView = Pick<
  ProcessCalendarEvent,
  | "id"
  | "process_template_id"
  | "wafer_id"
  | "location"
  | "starts_at"
  | "ends_at"
  | "process_step_id"
  | "process_step_name_snapshot"
  | "manual_action"
  | "description"
  | "revision"
> & {
  wafer: { id: string; wafer_code: string } | null;
  people: ProcessCalendarPersonOption[];
};

function isVisibleProcessPerson(person: ProcessCalendarPersonOption) {
  const name = person.display_name.trim().toLowerCase();
  return name !== "waferwatch admin" && name !== "waferwatch viewer";
}

function isMissingCalendarTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PGRST205"
  );
}

export async function listProcessPeople(): Promise<ProcessCalendarPersonOption[]> {
  await requireAccount();

  const admin = createSupabaseAdminClient();
  const profilesResult = await admin
    .from("profiles")
    .select("id, display_name, email, role, is_active")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (profilesResult.error) {
    throw profilesResult.error;
  }

  const visibleProfileIds = (profilesResult.data as TeamDirectoryProfile[])
    .filter(isVisibleTeamProfile)
    .map((profile) => profile.id);

  if (!visibleProfileIds.length) {
    return [];
  }

  const { data, error } = await admin
    .from("process_people")
    .select("id, display_name")
    .eq("is_active", true)
    .in("profile_id", visibleProfileIds)
    .order("display_name", { ascending: true });

  if (error) {
    if (isMissingCalendarTableError(error)) {
      return [];
    }

    throw error;
  }

  return (data ?? []).filter(isVisibleProcessPerson);
}

export async function getProcessCalendarSchedule(
  processTemplateId: string,
  fromIso: string,
  toIso: string
): Promise<{
  events: ProcessCalendarEventView[];
  people: ProcessCalendarPersonOption[];
}> {
  const supabase = await createServerSupabaseClient();
  const [eventsResult, people] = await Promise.all([
    supabase
      .from("vw_process_calendar_state")
      .select("*")
      .eq("process_template_id", processTemplateId)
      .lt("starts_at", toIso)
      .gt("ends_at", fromIso)
      .order("starts_at", { ascending: true }),
    listProcessPeople()
  ]);

  if (eventsResult.error) {
    if (isMissingCalendarTableError(eventsResult.error)) {
      return {
        people,
        events: []
      };
    }

    throw eventsResult.error;
  }

  const rows = (eventsResult.data ?? []) as Array<Record<string, Json | undefined>>;
  const waferIds = Array.from(
    new Set(rows.map((event) => event.wafer_id).filter((id): id is string => typeof id === "string"))
  );
  const wafersResult = await (waferIds.length
    ? supabase
        .from("wafers")
        .select("id, wafer_code")
        .in("id", waferIds)
    : Promise.resolve({ data: [], error: null } as const));

  if (wafersResult.error) {
    throw wafersResult.error;
  }

  const wafersById = new Map((wafersResult.data ?? []).map((wafer) => [wafer.id, wafer]));
  return {
    people,
    events: rows.flatMap((event) => {
      if (
        typeof event.id !== "string" ||
        typeof event.process_template_id !== "string" ||
        typeof event.location !== "string" ||
        typeof event.starts_at !== "string" ||
        typeof event.ends_at !== "string" ||
        typeof event.revision !== "number"
      ) return [];
      const processStepId = typeof event.process_step_id === "string" ? event.process_step_id : null;
      const actionName = typeof event.action_name === "string" ? event.action_name : "Manual action";
      const waferId = typeof event.wafer_id === "string" ? event.wafer_id : null;
      const eventPeople = Array.isArray(event.people)
        ? event.people.flatMap((candidate) => {
            if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
            return typeof candidate.id === "string" && typeof candidate.display_name === "string"
              ? [{ id: candidate.id, display_name: candidate.display_name }]
              : [];
          })
        : [];
      return [{
        id: event.id,
        process_template_id: event.process_template_id,
        wafer_id: waferId,
        location: event.location as ProcessCalendarLocation,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        process_step_id: processStepId,
        process_step_name_snapshot: processStepId ? actionName : null,
        manual_action: processStepId ? null : actionName,
        description: typeof event.description === "string" ? event.description : null,
        revision: event.revision,
        wafer: waferId ? wafersById.get(waferId) ?? null : null,
        people: eventPeople
      } satisfies ProcessCalendarEventView];
    })
  };
}

export async function getCalendarEvents(projectId: string, fromIso: string, toIso: string) {
  const supabase = await createServerSupabaseClient();
  const [reservations, schedule] = await Promise.all([
    supabase
      .from("tool_reservations")
      .select("*, fabrication_tools(*)")
      .eq("project_id", projectId)
      .gte("starts_at", fromIso)
      .lte("starts_at", toIso)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true }),
    supabase
      .from("vw_process_calendar_state")
      .select("*")
      .eq("project_id", projectId)
      .lt("starts_at", toIso)
      .gt("ends_at", fromIso)
      .order("starts_at", { ascending: true })
  ]);

  if (reservations.error) {
    throw reservations.error;
  }

  if (schedule.error) {
    throw schedule.error;
  }

  return {
    reservations: reservations.data ?? [],
    plannedSteps: schedule.data ?? []
  };
}
