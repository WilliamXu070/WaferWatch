"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { assertProjectAccess, requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  processCalendarEventCreateSchema,
  processCalendarEventDeleteSchema,
  processCalendarEventMoveSchema,
  processCalendarEventUpdateSchema
} from "@/features/calendar/schemas";
import type { ProcessCalendarEvent, ProcessPerson, ProcessStep, ProcessTemplate } from "@/types/database";

const TRAVEL_BUFFER_MS = 60 * 60 * 1000;
const MISSING_CALENDAR_TABLES_MESSAGE =
  "Calendar storage is not migrated yet. Apply the latest Supabase migration and seed data, then try again.";
const CALENDAR_PATH = "/calendar";
const WIREFRAME_CALENDAR_PATH = "/wireframe/calendar";
const CALENDAR_EVENT_SELECT =
  "id, process_template_id, wafer_id, location, starts_at, ends_at, process_step_id, process_step_name_snapshot, manual_action, description";

type ProcessTemplateAccessContext = Pick<
  ProcessTemplate,
  "id" | "name" | "owner_project_id" | "is_active"
>;

type ExistingPersonEvent = Pick<
  ProcessCalendarEvent,
  "id" | "location" | "starts_at" | "ends_at" | "manual_action" | "process_step_id" | "wafer_id"
>;

function isMissingCalendarTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PGRST205"
  );
}

async function getProcessTemplateAccessContext(processTemplateId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("process_templates")
    .select("id, name, owner_project_id, is_active")
    .eq("id", processTemplateId)
    .single();

  if (error) {
    throw error;
  }

  return data as ProcessTemplateAccessContext;
}

async function assertProcessCalendarAccess(processTemplateId: string, mode: "read" | "write") {
  const account = await requireAccount();
  const template = await getProcessTemplateAccessContext(processTemplateId);

  if (template.owner_project_id) {
    await assertProjectAccess(template.owner_project_id, mode);
    return { account, template };
  }

  if (!template.is_active && mode === "write") {
    throw new Error("This process is inactive and cannot be scheduled.");
  }

  return { account, template };
}

function intervalsOverlap(startsAt: Date, endsAt: Date, otherStartsAt: Date, otherEndsAt: Date) {
  return startsAt < otherEndsAt && endsAt > otherStartsAt;
}

function formatConflictTime(startsAt: string, endsAt: string) {
  const start = new Date(startsAt).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
  const end = new Date(endsAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  });

  return `${start} - ${end}`;
}

async function validatePeopleAreActive(personIds: string[]) {
  const uniquePersonIds = Array.from(new Set(personIds));
  if (!uniquePersonIds.length) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("process_people")
    .select("id, display_name, is_active, profile_id")
    .in("id", uniquePersonIds);

  if (error) {
    throw error;
  }

  const people = (data ?? []) as Array<Pick<ProcessPerson, "id" | "display_name" | "is_active" | "profile_id">>;
  const activePeople = people.filter((person) => person.is_active && person.profile_id);

  if (activePeople.length !== uniquePersonIds.length) {
    throw new Error("One or more selected people are no longer available.");
  }

  return activePeople.map((person) => ({
    id: person.id,
    display_name: person.display_name
  }));
}

async function validateProcessStep(processTemplateId: string, processStepId: string | null | undefined) {
  if (!processStepId) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("process_steps")
    .select("id, template_id, name")
    .eq("id", processStepId)
    .single();

  if (error) {
    throw error;
  }

  const step = data as Pick<ProcessStep, "id" | "template_id" | "name">;
  if (step.template_id !== processTemplateId) {
    throw new Error("Selected action does not belong to this process.");
  }

  return {
    id: step.id,
    name: step.name
  };
}

async function validateProcessWafer(processTemplateId: string, waferId: string | null | undefined) {
  if (!waferId) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("wafer_process_assignments")
    .select("wafer_id, template_id, wafers(id, wafer_code)")
    .eq("template_id", processTemplateId)
    .eq("wafer_id", waferId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Selected wafer is not assigned to this process.");
  }

  const wafer = Array.isArray(data.wafers) ? data.wafers[0] : data.wafers;
  if (!wafer?.id) {
    throw new Error("Selected wafer could not be loaded.");
  }

  return {
    id: wafer.id,
    wafer_code: wafer.wafer_code
  };
}

async function assertNoScheduleConflicts(input: {
  processTemplateId: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  people: Array<Pick<ProcessPerson, "id" | "display_name">>;
  excludeEventId?: string;
}) {
  const personIds = input.people.map((person) => person.id);
  if (!personIds.length) {
    return;
  }

  const supabase = await createServerSupabaseClient();
  const linksResult = await supabase
    .from("process_calendar_event_people")
    .select("event_id, person_id")
    .in("person_id", personIds);

  if (linksResult.error) {
    throw linksResult.error;
  }

  const links = linksResult.data ?? [];
  const eventIds = Array.from(new Set(links.map((link) => link.event_id)));
  const candidateEventIds = input.excludeEventId
    ? eventIds.filter((eventId) => eventId !== input.excludeEventId)
    : eventIds;

  if (!candidateEventIds.length) {
    return;
  }

  const eventsResult = await supabase
    .from("process_calendar_events")
    .select("id, location, starts_at, ends_at, manual_action, process_step_id")
    .eq("process_template_id", input.processTemplateId)
    .in("id", candidateEventIds);

  if (eventsResult.error) {
    throw eventsResult.error;
  }

  const personById = new Map(input.people.map((person) => [person.id, person]));
  const linksByEventId = new Map<string, string[]>();
  for (const link of links) {
    const existing = linksByEventId.get(link.event_id);
    if (existing) {
      existing.push(link.person_id);
    } else {
      linksByEventId.set(link.event_id, [link.person_id]);
    }
  }

  for (const event of (eventsResult.data ?? []) as ExistingPersonEvent[]) {
    const eventStartsAt = new Date(event.starts_at);
    const eventEndsAt = new Date(event.ends_at);
    const sameLocation = event.location === input.location;
    const conflictStartsAt = sameLocation
      ? eventStartsAt
      : new Date(eventStartsAt.getTime() - TRAVEL_BUFFER_MS);
    const conflictEndsAt = sameLocation
      ? eventEndsAt
      : new Date(eventEndsAt.getTime() + TRAVEL_BUFFER_MS);

    if (!intervalsOverlap(input.startsAt, input.endsAt, conflictStartsAt, conflictEndsAt)) {
      continue;
    }

    const conflictingPerson = (linksByEventId.get(event.id) ?? [])
      .map((personId) => personById.get(personId))
      .find((person): person is Pick<ProcessPerson, "id" | "display_name"> => Boolean(person));

    if (!conflictingPerson) {
      continue;
    }

    const travelReason = sameLocation ? "already booked" : "needs a 1 hour travel buffer";
    throw new Error(
      `${conflictingPerson.display_name} ${travelReason} around ${formatConflictTime(event.starts_at, event.ends_at)}.`
    );
  }
}

export async function createProcessCalendarEvent(input: unknown) {
  try {
    const parsed = processCalendarEventCreateSchema.parse(input);
    const startsAt = new Date(parsed.startsAt);
    const endsAt = new Date(parsed.endsAt);
    const personIds = Array.from(new Set(parsed.personIds));

    const { account } = await assertProcessCalendarAccess(parsed.processTemplateId, "write");
    const [people, processStep, wafer] = await Promise.all([
      validatePeopleAreActive(personIds),
      validateProcessStep(parsed.processTemplateId, parsed.processStepId),
      validateProcessWafer(parsed.processTemplateId, parsed.waferId)
    ]);

    await assertNoScheduleConflicts({
      processTemplateId: parsed.processTemplateId,
      location: parsed.location,
      startsAt,
      endsAt,
      people
    });

    const supabase = await createServerSupabaseClient();
    const { data: event, error } = await supabase
      .from("process_calendar_events")
      .insert({
        process_template_id: parsed.processTemplateId,
        wafer_id: wafer?.id ?? null,
        location: parsed.location,
        starts_at: parsed.startsAt,
        ends_at: parsed.endsAt,
        process_step_id: processStep?.id ?? null,
        process_step_name_snapshot: processStep?.name ?? null,
        manual_action: parsed.manualAction?.trim() || null,
        description: parsed.description?.trim() || null,
        created_by: account.userId
      })
      .select(CALENDAR_EVENT_SELECT)
      .single();

    if (error) {
      return fail(error.message);
    }

    const linkRows = people.map((person) => ({
      event_id: event.id,
      person_id: person.id
    }));

    const { error: linkError } = await supabase
      .from("process_calendar_event_people")
      .insert(linkRows);

    if (linkError) {
      await supabase.from("process_calendar_events").delete().eq("id", event.id);
      return fail(linkError.message);
    }

    revalidatePath(`/processes/${parsed.processTemplateId}`);
    revalidatePath(CALENDAR_PATH);
    revalidatePath(WIREFRAME_CALENDAR_PATH);
    return ok({
      ...event,
      wafer,
      people
    });
  } catch (error) {
    if (isMissingCalendarTableError(error)) {
      return fail(MISSING_CALENDAR_TABLES_MESSAGE);
    }

    return fail(toErrorMessage(error));
  }
}

export async function deleteProcessCalendarEvent(input: unknown) {
  try {
    const parsed = processCalendarEventDeleteSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data: event, error: eventError } = await supabase
      .from("process_calendar_events")
      .select("id, process_template_id")
      .eq("id", parsed.eventId)
      .single();

    if (eventError) {
      return fail(eventError.message);
    }

    await assertProcessCalendarAccess(event.process_template_id, "write");

    const { error } = await supabase
      .from("process_calendar_events")
      .delete()
      .eq("id", parsed.eventId);

    if (error) {
      return fail(error.message);
    }

    revalidatePath(`/processes/${event.process_template_id}`);
    revalidatePath(CALENDAR_PATH);
    revalidatePath(WIREFRAME_CALENDAR_PATH);
    return ok({ id: parsed.eventId });
  } catch (error) {
    if (isMissingCalendarTableError(error)) {
      return fail(MISSING_CALENDAR_TABLES_MESSAGE);
    }

    return fail(toErrorMessage(error));
  }
}

export async function moveProcessCalendarEvent(input: unknown) {
  try {
    const parsed = processCalendarEventMoveSchema.parse(input);
    const startsAt = new Date(parsed.startsAt);
    const endsAt = new Date(parsed.endsAt);
    const supabase = await createServerSupabaseClient();

    const { data: event, error: eventError } = await supabase
      .from("process_calendar_events")
      .select(CALENDAR_EVENT_SELECT)
      .eq("id", parsed.eventId)
      .single();

    if (eventError) {
      return fail(eventError.message);
    }

    await assertProcessCalendarAccess(event.process_template_id, "write");

    const linksResult = await supabase
      .from("process_calendar_event_people")
      .select("person_id")
      .eq("event_id", parsed.eventId);

    if (linksResult.error) {
      return fail(linksResult.error.message);
    }

    const people = await validatePeopleAreActive(
      (linksResult.data ?? []).map((link) => link.person_id)
    );

    await assertNoScheduleConflicts({
      processTemplateId: event.process_template_id,
      location: parsed.location,
      startsAt,
      endsAt,
      people,
      excludeEventId: parsed.eventId
    });

    const { data: updatedEvent, error: updateError } = await supabase
      .from("process_calendar_events")
      .update({
        location: parsed.location,
        starts_at: parsed.startsAt,
        ends_at: parsed.endsAt
      })
      .eq("id", parsed.eventId)
      .select(CALENDAR_EVENT_SELECT)
      .single();

    if (updateError) {
      return fail(updateError.message);
    }

    revalidatePath(`/processes/${event.process_template_id}`);
    revalidatePath(CALENDAR_PATH);
    revalidatePath(WIREFRAME_CALENDAR_PATH);
    return ok({
      ...updatedEvent,
      wafer: null,
      people
    });
  } catch (error) {
    if (isMissingCalendarTableError(error)) {
      return fail(MISSING_CALENDAR_TABLES_MESSAGE);
    }

    return fail(toErrorMessage(error));
  }
}

export async function updateProcessCalendarEvent(input: unknown) {
  try {
    const parsed = processCalendarEventUpdateSchema.parse(input);

    const personIds = Array.from(new Set(parsed.personIds));
    const supabase = await createServerSupabaseClient();

    const { data: existingEvent, error: existingEventError } = await supabase
      .from("process_calendar_events")
      .select(CALENDAR_EVENT_SELECT)
      .eq("id", parsed.eventId)
      .single();

    if (existingEventError) {
      return fail(existingEventError.message);
    }

    await assertProcessCalendarAccess(existingEvent.process_template_id, "write");

    const [people, processStep, wafer] = await Promise.all([
      validatePeopleAreActive(personIds),
      validateProcessStep(existingEvent.process_template_id, parsed.processStepId),
      validateProcessWafer(existingEvent.process_template_id, parsed.waferId)
    ]);

    const startsAt = new Date(existingEvent.starts_at);
    const endsAt = new Date(existingEvent.ends_at);
    await assertNoScheduleConflicts({
      processTemplateId: existingEvent.process_template_id,
      location: existingEvent.location,
      startsAt,
      endsAt,
      people,
      excludeEventId: parsed.eventId
    });

    const { data: updatedEvent, error: updateError } = await supabase
      .from("process_calendar_events")
      .update({
        process_step_id: processStep?.id ?? null,
        wafer_id: wafer?.id ?? null,
        process_step_name_snapshot: processStep
          ? processStep.id === existingEvent.process_step_id
            ? existingEvent.process_step_name_snapshot ?? processStep.name
            : processStep.name
          : null,
        manual_action: parsed.manualAction?.trim() || null,
        description: parsed.description?.trim() || null
      })
      .eq("id", parsed.eventId)
      .select(CALENDAR_EVENT_SELECT)
      .single();

    if (updateError) {
      return fail(updateError.message);
    }

    if (personIds.length) {
      await supabase.from("process_calendar_event_people").delete().eq("event_id", parsed.eventId);
      const { error: linkError } = await supabase.from("process_calendar_event_people").insert(
        personIds.map((personId) => ({
          event_id: parsed.eventId,
          person_id: personId
        }))
      );

      if (linkError) {
        return fail(linkError.message);
      }
    } else {
      await supabase.from("process_calendar_event_people").delete().eq("event_id", parsed.eventId);
    }

    revalidatePath(`/processes/${existingEvent.process_template_id}`);
    revalidatePath(CALENDAR_PATH);
    revalidatePath(WIREFRAME_CALENDAR_PATH);
    return ok({
      ...updatedEvent,
      wafer,
      people
    });
  } catch (error) {
    if (isMissingCalendarTableError(error)) {
      return fail(MISSING_CALENDAR_TABLES_MESSAGE);
    }

    return fail(toErrorMessage(error));
  }
}
