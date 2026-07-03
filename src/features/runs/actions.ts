"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { requireAccount, assertProjectAccess } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  blockStepSchema,
  completeStepSchema,
  moveWaferToProcessStepSchema,
  reservationSchema,
  startStepSchema
} from "@/features/runs/schemas";
import type { Json, StepExecution } from "@/types/database";

const CURRENT_STEP_STATUSES = ["queued", "running", "blocked", "failed"] as const;

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

export async function moveWaferToProcessStep(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = moveWaferToProcessStepSchema.parse(input);
    const supabase = await createServerSupabaseClient();

    const { data: assignment, error: assignmentError } = await supabase
      .from("wafer_process_assignments")
      .select("*, wafers(*)")
      .eq("id", parsed.assignmentId)
      .single();

    if (assignmentError) {
      return fail(assignmentError.message);
    }

    const wafer = Array.isArray(assignment.wafers) ? assignment.wafers[0] : assignment.wafers;
    if (!wafer) {
      return fail("The selected assignment is missing its wafer.");
    }

    await assertProjectAccess(wafer.project_id, "write");

    const { data: targetStep, error: targetStepError } = await supabase
      .from("process_steps")
      .select("id, template_id, name, step_order")
      .eq("id", parsed.targetStepId)
      .single();

    if (targetStepError) {
      return fail(targetStepError.message);
    }

    if (targetStep.template_id !== assignment.template_id) {
      return fail("The target step does not belong to this assignment process.");
    }

    const { data: executions, error: executionsError } = await supabase
      .from("step_executions")
      .select("*")
      .eq("assignment_id", parsed.assignmentId);

    if (executionsError) {
      return fail(executionsError.message);
    }

    const now = new Date().toISOString();
    const existingExecutions = (executions ?? []) as StepExecution[];
    const targetExecution = existingExecutions.find((execution) => execution.process_step_id === parsed.targetStepId);
    const currentExecution = existingExecutions.find((execution) =>
      CURRENT_STEP_STATUSES.includes(execution.status as (typeof CURRENT_STEP_STATUSES)[number])
    );
    const currentStepResult = currentExecution
      ? await supabase
          .from("process_steps")
          .select("id, step_order")
          .eq("id", currentExecution.process_step_id)
          .maybeSingle()
      : null;

    if (currentStepResult?.error) {
      return fail(currentStepResult.error.message);
    }

    const shouldCompleteSourceStep = Boolean(
      parsed.completeSourceStep &&
      currentExecution &&
      currentExecution.process_step_id !== parsed.targetStepId &&
      (currentExecution.status === "queued" || currentExecution.status === "running") &&
      currentStepResult?.data &&
      targetStep.step_order > currentStepResult.data.step_order
    );

    const activeExecutionIds = existingExecutions
      .filter((execution) =>
        execution.process_step_id !== parsed.targetStepId &&
        (!shouldCompleteSourceStep || execution.id !== currentExecution?.id) &&
        CURRENT_STEP_STATUSES.includes(execution.status as (typeof CURRENT_STEP_STATUSES)[number])
      )
      .map((execution) => execution.id);

    if (activeExecutionIds.length) {
      const { error: resetError } = await supabase
        .from("step_executions")
        .update({
          status: "pending",
          queue_started_at: null,
          started_at: null,
          planned_end_at: null,
          operator_id: null
        })
        .in("id", activeExecutionIds);

      if (resetError) {
        return fail(resetError.message);
      }
    }

    if (shouldCompleteSourceStep && currentExecution) {
      const { error: completeSourceError } = await supabase
        .from("step_executions")
        .update({
          status: "completed",
          completed_at: now,
          completed_by: account.userId,
          run_notes: parsed.note ?? currentExecution.run_notes,
          metadata: currentExecution.metadata
        })
        .eq("id", currentExecution.id);

      if (completeSourceError) {
        return fail(completeSourceError.message);
      }
    }

    const targetPatch = {
      status: "queued" as const,
      queue_started_at: now,
      started_at: null,
      completed_at: null,
      skipped_at: null,
      completed_by: null,
      operator_id: null,
      tool_id: null,
      recipe_id: null,
      planned_end_at: null,
      run_notes: parsed.note ?? targetExecution?.run_notes ?? null
    };

    const targetExecutionResult = targetExecution
      ? await supabase
          .from("step_executions")
          .update(targetPatch)
          .eq("id", targetExecution.id)
          .select("*")
          .single()
      : await supabase
          .from("step_executions")
          .insert({
            assignment_id: parsed.assignmentId,
            wafer_id: assignment.wafer_id,
            process_step_id: parsed.targetStepId,
            ...targetPatch
          })
          .select("*")
          .single();

    if (targetExecutionResult.error) {
      return fail(targetExecutionResult.error.message);
    }

    const { error: assignmentUpdateError } = await supabase
      .from("wafer_process_assignments")
      .update({
        status: "in_progress",
        started_at: assignment.started_at ?? now,
        completed_at: null
      })
      .eq("id", parsed.assignmentId);

    if (assignmentUpdateError) {
      return fail(assignmentUpdateError.message);
    }

    const { error: waferUpdateError } = await supabase
      .from("wafers")
      .update({ status: "in_progress" })
      .eq("id", assignment.wafer_id);

    if (waferUpdateError) {
      return fail(waferUpdateError.message);
    }

    const { error: eventError } = await supabase.from("process_events").insert({
      project_id: wafer.project_id,
      wafer_id: assignment.wafer_id,
      step_execution_id: targetExecutionResult.data.id,
      actor_id: account.userId,
      event_type: "wafer_step_moved",
      notes: parsed.note ?? null,
      metadata: {
        assignment_id: parsed.assignmentId,
        from_step_id: currentExecution?.process_step_id ?? null,
        to_step_id: parsed.targetStepId,
        to_step_name: targetStep.name,
        reset_step_execution_ids: activeExecutionIds,
        completed_source_step_execution_id: shouldCompleteSourceStep ? currentExecution?.id ?? null : null
      }
    });

    if (eventError) {
      return fail(eventError.message);
    }

    revalidatePath("/", "layout");
    revalidatePath("/wireframe/process-flow");
    revalidatePath(`/processes/${assignment.template_id}`);
    return ok(targetExecutionResult.data);
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
