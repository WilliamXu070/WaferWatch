"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { assertProjectAccess, requireAccount, requireProcessManager } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  processAssignmentSchema,
  processStepCreateSchema,
  processTemplateCreateSchema
} from "@/features/process-flows/schemas";
import type { Json } from "@/types/database";

export async function createProcessTemplate(input: unknown) {
  try {
    const account = await requireProcessManager();
    const parsed = processTemplateCreateSchema.parse(input);

    if (parsed.ownerProjectId) {
      await assertProjectAccess(parsed.ownerProjectId, "write");
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("process_templates")
      .insert({
        name: parsed.name,
        version: parsed.version,
        description: parsed.description ?? null,
        owner_project_id: parsed.ownerProjectId ?? null,
        is_active: parsed.isActive,
        created_by: account.userId
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

export async function addProcessStep(input: unknown) {
  try {
    await requireProcessManager();
    const parsed = processStepCreateSchema.parse(input);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("process_steps")
      .insert({
        template_id: parsed.templateId,
        step_order: parsed.stepOrder,
        name: parsed.name,
        slug: parsed.slug,
        process_area: parsed.processArea,
        expected_duration_minutes: parsed.expectedDurationMinutes ?? null,
        queue_target_minutes: parsed.queueTargetMinutes ?? null,
        required_tool_type: parsed.requiredToolType ?? null,
        requires_recipe: parsed.requiresRecipe,
        instructions: parsed.instructions ?? null,
        parameters_schema: parsed.parametersSchema as Json
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

export async function assignProcessToWafer(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = processAssignmentSchema.parse(input);
    const supabase = await createServerSupabaseClient();

    const { data: wafer, error: waferError } = await supabase
      .from("wafers")
      .select("*")
      .eq("id", parsed.waferId)
      .single();

    if (waferError) {
      return fail(waferError.message);
    }

    await assertProjectAccess(wafer.project_id, "write");

    const { data: steps, error: stepsError } = await supabase
      .from("process_steps")
      .select("*")
      .eq("template_id", parsed.templateId)
      .order("step_order", { ascending: true });

    if (stepsError) {
      return fail(stepsError.message);
    }

    if (!steps?.length) {
      return fail("The selected process template has no steps.");
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from("wafer_process_assignments")
      .insert({
        wafer_id: parsed.waferId,
        template_id: parsed.templateId,
        assigned_by: account.userId,
        status: "queued"
      })
      .select("*")
      .single();

    if (assignmentError) {
      return fail(assignmentError.message);
    }

    const executionRows = steps.map((step, index) => ({
      assignment_id: assignment.id,
      wafer_id: parsed.waferId,
      process_step_id: step.id,
      status: index === 0 ? "queued" : "pending",
      queue_started_at: index === 0 ? new Date().toISOString() : null
    }));

    const { error: executionsError } = await supabase.from("step_executions").insert(executionRows);

    if (executionsError) {
      return fail(executionsError.message);
    }

    await supabase
      .from("wafers")
      .update({ status: "queued" })
      .eq("id", parsed.waferId);

    await supabase.from("process_events").insert({
      project_id: wafer.project_id,
      wafer_id: parsed.waferId,
      actor_id: account.userId,
      event_type: "flow_assigned",
      metadata: {
        assignment_id: assignment.id,
        template_id: parsed.templateId
      }
    });

    revalidatePath("/", "layout");
    return ok(assignment);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}
