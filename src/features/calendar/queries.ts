import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ProcessCalendarEvent, ProcessPerson } from "@/types/database";

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
> & {
  wafer: { id: string; wafer_code: string } | null;
  people: ProcessCalendarPersonOption[];
};

function isMissingCalendarTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PGRST205"
  );
}

export async function listProcessPeople(): Promise<ProcessCalendarPersonOption[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("process_people")
    .select("id, display_name")
    .eq("is_active", true)
    .not("profile_id", "is", null)
    .order("display_name", { ascending: true });

  if (error) {
    if (isMissingCalendarTableError(error)) {
      return [];
    }

    throw error;
  }

  return data ?? [];
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
      .from("process_calendar_events")
      .select(
        "id, process_template_id, wafer_id, location, starts_at, ends_at, process_step_id, process_step_name_snapshot, manual_action, description"
      )
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

  const events = eventsResult.data ?? [];
  const eventIds = events.map((event) => event.id);

  const linksResult = await (eventIds.length
    ? supabase
        .from("process_calendar_event_people")
        .select("event_id, person_id")
        .in("event_id", eventIds)
    : Promise.resolve({ data: [], error: null } as const));

  if (linksResult.error) {
    if (isMissingCalendarTableError(linksResult.error)) {
      return {
          people,
          events: events.map((event) => ({
            ...event,
            wafer: null,
            people: []
          }))
      };
    }

    throw linksResult.error;
  }

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const waferIds = Array.from(
    new Set(events.map((event) => event.wafer_id).filter((id): id is string => Boolean(id)))
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
  const personIdsByEventId = new Map<string, string[]>();

  for (const link of linksResult.data ?? []) {
    const existing = personIdsByEventId.get(link.event_id);
    if (existing) {
      existing.push(link.person_id);
    } else {
      personIdsByEventId.set(link.event_id, [link.person_id]);
    }
  }

  return {
    people,
    events: events.map((event) => ({
      ...event,
      wafer: event.wafer_id ? wafersById.get(event.wafer_id) ?? null : null,
      people: (personIdsByEventId.get(event.id) ?? [])
        .map((personId) => peopleById.get(personId))
        .filter((person): person is ProcessCalendarPersonOption => Boolean(person))
    }))
  };
}

export async function getCalendarEvents(projectId: string, fromIso: string, toIso: string) {
  const supabase = await createServerSupabaseClient();
  const [reservations, plannedSteps] = await Promise.all([
    supabase
      .from("tool_reservations")
      .select("*, fabrication_tools(*)")
      .eq("project_id", projectId)
      .gte("starts_at", fromIso)
      .lte("starts_at", toIso)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true }),
    supabase
      .from("step_executions")
      .select("*, process_steps(*), wafers!inner(project_id, wafer_code)")
      .gte("planned_start_at", fromIso)
      .lte("planned_start_at", toIso)
      .order("planned_start_at", { ascending: true })
  ]);

  if (reservations.error) {
    throw reservations.error;
  }

  if (plannedSteps.error) {
    throw plannedSteps.error;
  }

  const filteredSteps =
    plannedSteps.data?.filter((step) => {
      const wafer = Array.isArray(step.wafers) ? step.wafers[0] : step.wafers;
      return wafer?.project_id === projectId;
    }) ?? [];

  return {
    reservations: reservations.data ?? [],
    plannedSteps: filteredSteps
  };
}
