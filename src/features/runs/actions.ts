"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { requireAccount, assertProjectAccess } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { blockStepSchema, completeStepSchema, reservationSchema, startStepSchema } from "@/features/runs/schemas";
import type { Json } from "@/types/database";

async function getStepExecutionContext(stepExecutionId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("step_executions")
    .select("*, wafers(*)")
    .eq("id", stepExecutionId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function startStepExecution(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = startStepSchema.parse(input);
    const context = await getStepExecutionContext(parsed.stepExecutionId);
    const wafer = Array.isArray(context.wafers) ? context.wafers[0] : context.wafers;

    await assertProjectAccess(wafer.project_id, "write");

    const supabase = await createServerSupabaseClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("step_executions")
      .update({
        status: "running",
        started_at: now,
        planned_end_at: parsed.plannedEndAt ?? null,
        operator_id: account.userId,
        tool_id: parsed.toolId ?? null,
        recipe_id: parsed.recipeId ?? null,
        run_notes: parsed.notes ?? null
      })
      .eq("id", parsed.stepExecutionId)
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    await supabase.from("wafer_process_assignments").update({
      status: "in_progress",
      started_at: context.started_at ?? now
    }).eq("id", context.assignment_id);

    await supabase.from("wafers").update({ status: "in_progress" }).eq("id", context.wafer_id);

    await supabase.from("process_events").insert({
      project_id: wafer.project_id,
      wafer_id: context.wafer_id,
      step_execution_id: parsed.stepExecutionId,
      actor_id: account.userId,
      event_type: "step_started",
      notes: parsed.notes ?? null,
      metadata: {
        tool_id: parsed.toolId ?? null,
        recipe_id: parsed.recipeId ?? null
      }
    });

    revalidatePath("/", "layout");
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function completeStepExecution(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = completeStepSchema.parse(input);
    const context = await getStepExecutionContext(parsed.stepExecutionId);
    const wafer = Array.isArray(context.wafers) ? context.wafers[0] : context.wafers;

    await assertProjectAccess(wafer.project_id, "write");

    const supabase = await createServerSupabaseClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("step_executions")
      .update({
        status: "completed",
        completed_at: now,
        completed_by: account.userId,
        run_notes: parsed.notes ?? context.run_notes,
        metadata: parsed.metadata as Json
      })
      .eq("id", parsed.stepExecutionId)
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    const { data: nextStep } = await supabase
      .from("step_executions")
      .select("*, process_steps!inner(step_order)")
      .eq("assignment_id", context.assignment_id)
      .eq("status", "pending")
      .order("process_steps(step_order)", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextStep) {
      await supabase
        .from("step_executions")
        .update({
          status: "queued",
          queue_started_at: now
        })
        .eq("id", nextStep.id);
    } else {
      await supabase
        .from("wafer_process_assignments")
        .update({
          status: "completed",
          completed_at: now
        })
        .eq("id", context.assignment_id);
      await supabase.from("wafers").update({ status: "completed" }).eq("id", context.wafer_id);
    }

    await supabase.from("process_events").insert({
      project_id: wafer.project_id,
      wafer_id: context.wafer_id,
      step_execution_id: parsed.stepExecutionId,
      actor_id: account.userId,
      event_type: "step_completed",
      notes: parsed.notes ?? null,
      metadata: parsed.metadata as Json
    });

    revalidatePath("/", "layout");
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function blockStepExecution(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = blockStepSchema.parse(input);
    const context = await getStepExecutionContext(parsed.stepExecutionId);
    const wafer = Array.isArray(context.wafers) ? context.wafers[0] : context.wafers;

    await assertProjectAccess(wafer.project_id, "write");

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("step_executions")
      .update({
        status: "blocked",
        run_notes: parsed.reason
      })
      .eq("id", parsed.stepExecutionId)
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    await supabase.from("wafers").update({ status: "on_hold" }).eq("id", context.wafer_id);
    await supabase.from("process_events").insert({
      project_id: wafer.project_id,
      wafer_id: context.wafer_id,
      step_execution_id: parsed.stepExecutionId,
      actor_id: account.userId,
      event_type: "step_blocked",
      notes: parsed.reason,
      metadata: {}
    });

    revalidatePath("/", "layout");
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function createToolReservation(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = reservationSchema.parse(input);
    await assertProjectAccess(parsed.projectId, "write");

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tool_reservations")
      .insert({
        project_id: parsed.projectId,
        tool_id: parsed.toolId,
        step_execution_id: parsed.stepExecutionId ?? null,
        reserved_by: account.userId,
        starts_at: parsed.startsAt,
        ends_at: parsed.endsAt,
        notes: parsed.notes ?? null
      })
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    revalidatePath("/", "layout");
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}
