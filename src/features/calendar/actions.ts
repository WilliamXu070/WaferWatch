"use server";

import { fail, ok } from "@/lib/action-result";
import { requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  processCalendarEventCreateSchema,
  processCalendarEventDeleteSchema,
  processCalendarEventMoveSchema,
  processCalendarEventUpdateSchema
} from "@/features/calendar/schemas";
import type { ProcessCalendarEventView, ProcessCalendarLocation } from "@/features/calendar/queries";
import { executeWorkflowCommandForCurrentActor } from "@/features/workflow-commands/server";
import type { Json } from "@/types/database";

const MISSING_CALENDAR_TABLES_MESSAGE =
  "Calendar storage is not migrated yet. Apply the latest Supabase migration and try again.";

function isMissingCalendarTableError(error: unknown) {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === "PGRST205"
  );
}

function asRecord(value: Json | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : null;
}

function scheduleItemFromRpc(data: Json): ProcessCalendarEventView | null {
  const response = asRecord(data);
  const item = asRecord(response?.item);
  if (
    !item ||
    typeof item.id !== "string" ||
    typeof item.process_template_id !== "string" ||
    typeof item.location !== "string" ||
    typeof item.starts_at !== "string" ||
    typeof item.ends_at !== "string" ||
    typeof item.revision !== "number"
  ) return null;
  const stepId = typeof item.process_step_id === "string" ? item.process_step_id : null;
  const actionName = typeof item.action_name === "string" ? item.action_name : "Manual action";
  const people = Array.isArray(item.people)
    ? item.people.flatMap((candidate) => {
        const person = asRecord(candidate);
        return person && typeof person.id === "string" && typeof person.display_name === "string"
          ? [{ id: person.id, display_name: person.display_name }]
          : [];
      })
    : [];
  return {
    id: item.id,
    process_template_id: item.process_template_id,
    wafer_id: typeof item.wafer_id === "string" ? item.wafer_id : null,
    location: item.location as ProcessCalendarLocation,
    starts_at: item.starts_at,
    ends_at: item.ends_at,
    process_step_id: stepId,
    process_step_name_snapshot: stepId ? actionName : null,
    manual_action: stepId ? null : actionName,
    description: typeof item.description === "string" ? item.description : null,
    revision: item.revision,
    wafer: null,
    people
  };
}

function staleResultMessage(data: Json) {
  const response = asRecord(data);
  return response?.ok === false && response.code === "stale"
    ? "This schedule item changed before your edit. The current revision has been preserved for rebase."
    : null;
}

export async function createProcessCalendarEvent(input: unknown) {
  const parsed = processCalendarEventCreateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "The calendar command is invalid.");
  const result = await executeWorkflowCommandForCurrentActor({
    kind: "calendar.create",
    mutationId: parsed.data.mutationId,
    templateId: parsed.data.processTemplateId,
    payload: {
      waferId: parsed.data.waferId ?? null,
      location: parsed.data.location,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      processStepId: parsed.data.processStepId ?? null,
      manualAction: parsed.data.manualAction ?? null,
      description: parsed.data.description ?? null,
      personIds: parsed.data.personIds
    }
  });
  if (!result.ok) return fail(result.message);
  const event = scheduleItemFromRpc({ item: result.data });
  return event ? ok(event) : fail("The new schedule item could not be projected.");
}

export async function moveProcessCalendarEvent(input: unknown) {
  const parsed = processCalendarEventMoveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "The calendar command is invalid.");
  const result = await executeWorkflowCommandForCurrentActor({
    kind: "calendar.move",
    mutationId: parsed.data.mutationId,
    templateId: parsed.data.processTemplateId,
    payload: {
      eventId: parsed.data.eventId,
      expectedRevision: parsed.data.expectedRevision,
      location: parsed.data.location,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt
    }
  });
  if (!result.ok) return fail(result.message);
  const event = scheduleItemFromRpc({ item: result.data });
  return event ? ok(event) : fail("The moved schedule item could not be projected.");
}

export async function updateProcessCalendarEvent(input: unknown) {
  try {
    await requireAccount();
    const parsed = processCalendarEventUpdateSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("update_calendar_schedule_item", {
      target_item_id: parsed.eventId,
      expected_revision: parsed.expectedRevision,
      target_wafer_id: parsed.waferId ?? null,
      target_step_id: parsed.processStepId ?? null,
      manual_action: parsed.manualAction ?? null,
      description: parsed.description ?? null,
      person_ids: Array.from(new Set(parsed.personIds)),
      mutation_id: parsed.mutationId
    });
    if (error) return fail(error.message);
    const staleMessage = staleResultMessage(data);
    if (staleMessage) return fail(staleMessage);
    const event = scheduleItemFromRpc(data);
    return event ? ok(event) : fail("The updated schedule item could not be projected.");
  } catch (error) {
    return fail(isMissingCalendarTableError(error) ? MISSING_CALENDAR_TABLES_MESSAGE : toErrorMessage(error));
  }
}

export async function deleteProcessCalendarEvent(input: unknown) {
  const parsed = processCalendarEventDeleteSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "The calendar command is invalid.");
  const result = await executeWorkflowCommandForCurrentActor({
    kind: "calendar.delete",
    mutationId: parsed.data.mutationId,
    templateId: parsed.data.processTemplateId,
    payload: {
      eventId: parsed.data.eventId,
      expectedRevision: parsed.data.expectedRevision
    }
  });
  return result.ok ? ok({ id: parsed.data.eventId }) : fail(result.message);
}
