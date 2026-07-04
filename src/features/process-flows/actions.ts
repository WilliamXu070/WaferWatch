"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { assertProjectAccess, requireAccount, requireProcessManager } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  processFlowStepCreateSchema,
  processAssignmentSchema,
  processStepDeleteSchema,
  processStepCreateSchema,
  processStepNodeTypeUpdateSchema,
  processStepPositionsUpdateSchema,
  processStepPositionUpdateSchema,
  processStepTransitionCreateSchema,
  processStepTransitionDeleteSchema,
  processTemplateNameUpdateSchema,
  processTemplateCreateSchema,
  processStepNameUpdateSchema
} from "@/features/process-flows/schemas";
import type { Json, ProcessStep } from "@/types/database";

type ProcessTemplateWriteContext = {
  id: string;
  owner_project_id: string | null;
};

function slugifyStepName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "process-step";
}

async function getTemplateForWrite(templateId: string): Promise<ProcessTemplateWriteContext> {
  await requireProcessManager();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("process_templates")
    .select("id, owner_project_id")
    .eq("id", templateId)
    .single();

  if (error) {
    throw error;
  }

  if (data.owner_project_id) {
    await assertProjectAccess(data.owner_project_id, "write");
  }

  return data;
}

async function getStepForWrite(stepId: string): Promise<ProcessStep> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("process_steps")
    .select("*")
    .eq("id", stepId)
    .single();

  if (error) {
    throw error;
  }

  await getTemplateForWrite(data.template_id);
  return data;
}

async function getAvailableStepSlug(templateId: string, name: string, excludeStepId?: string) {
  const baseSlug = slugifyStepName(name).slice(0, 70).replace(/-+$/g, "") || "process-step";
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("process_steps")
    .select("id, slug")
    .eq("template_id", templateId);

  if (error) {
    throw error;
  }

  const existing = new Set((data ?? []).filter((step) => step.id !== excludeStepId).map((step) => step.slug));
  if (!existing.has(baseSlug)) {
    return baseSlug;
  }

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${baseSlug}-${suffix}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }

  return `${baseSlug}-${Date.now()}`;
}

async function getNextStepOrder(templateId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("process_steps")
    .select("step_order")
    .eq("template_id", templateId)
    .order("step_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data?.step_order ?? 0) + 10;
}

function revalidateProcessFlow(templateId: string) {
  revalidatePath("/", "layout");
  revalidatePath("/wireframe/dashboard");
  revalidatePath("/wireframe/process-flow");
  revalidatePath("/wireframe/wafer-status");
  revalidatePath("/wireframe/calendar");
  revalidatePath(`/processes/${templateId}`);
}

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

export async function updateProcessTemplateName(input: unknown) {
  try {
    const parsed = processTemplateNameUpdateSchema.parse(input);
    const template = await getTemplateForWrite(parsed.templateId);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("process_templates")
      .update({ name: parsed.name })
      .eq("id", parsed.templateId)
      .select("id, name, version")
      .single();

    if (error) {
      return fail(error.message);
    }

    revalidateProcessFlow(template.id);
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function addProcessStep(input: unknown) {
  try {
    const parsed = processStepCreateSchema.parse(input);
    await getTemplateForWrite(parsed.templateId);

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
        parameters_schema: parsed.parametersSchema as Json,
        node_type: parsed.nodeType,
        canvas_x: parsed.canvasX ?? null,
        canvas_y: parsed.canvasY ?? null
      })
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    revalidateProcessFlow(parsed.templateId);
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function createProcessFlowStep(input: unknown) {
  try {
    const parsed = processFlowStepCreateSchema.parse(input);
    await getTemplateForWrite(parsed.templateId);

    const [stepOrder, slug] = await Promise.all([
      getNextStepOrder(parsed.templateId),
      getAvailableStepSlug(parsed.templateId, parsed.name)
    ]);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("process_steps")
      .insert({
        template_id: parsed.templateId,
        step_order: stepOrder,
        name: parsed.name,
        slug,
        process_area: parsed.processArea,
        expected_duration_minutes: null,
        queue_target_minutes: null,
        required_tool_type: null,
        requires_recipe: false,
        instructions: null,
        parameters_schema: {},
        node_type: parsed.nodeType,
        canvas_x: parsed.canvasX,
        canvas_y: parsed.canvasY
      })
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    revalidateProcessFlow(parsed.templateId);
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function updateProcessStepPosition(input: unknown) {
  try {
    const parsed = processStepPositionUpdateSchema.parse(input);
    const step = await getStepForWrite(parsed.stepId);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("process_steps")
      .update({
        canvas_x: parsed.canvasX,
        canvas_y: parsed.canvasY
      })
      .eq("id", parsed.stepId)
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    revalidateProcessFlow(step.template_id);
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function updateProcessStepPositions(input: unknown) {
  try {
    const parsed = processStepPositionsUpdateSchema.parse(input);
    const stepIds = Array.from(new Set(parsed.positions.map((position) => position.stepId)));
    const supabase = await createServerSupabaseClient();
    const { data: steps, error: stepsError } = await supabase
      .from("process_steps")
      .select("*")
      .in("id", stepIds);

    if (stepsError) {
      return fail(stepsError.message);
    }

    if ((steps ?? []).length !== stepIds.length) {
      return fail("One or more selected process steps no longer exist.");
    }

    const templateIds = Array.from(new Set((steps ?? []).map((step) => step.template_id)));
    await Promise.all(templateIds.map((templateId) => getTemplateForWrite(templateId)));

    for (const position of parsed.positions) {
      const { error } = await supabase
        .from("process_steps")
        .update({
          canvas_x: position.canvasX,
          canvas_y: position.canvasY
        })
        .eq("id", position.stepId);

      if (error) {
        return fail(error.message);
      }
    }

    for (const templateId of templateIds) {
      revalidateProcessFlow(templateId);
    }

    return ok({ updated: parsed.positions.length });
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function updateProcessStepNodeType(input: unknown) {
  try {
    const parsed = processStepNodeTypeUpdateSchema.parse(input);
    const step = await getStepForWrite(parsed.stepId);
    const supabase = await createServerSupabaseClient();

    if (parsed.nodeType !== "procedure") {
      const { error: demoteError } = await supabase
        .from("process_steps")
        .update({ node_type: "procedure" })
        .eq("template_id", step.template_id)
        .eq("node_type", parsed.nodeType)
        .neq("id", parsed.stepId);

      if (demoteError) {
        return fail(demoteError.message);
      }
    }

    const { data, error } = await supabase
      .from("process_steps")
      .update({ node_type: parsed.nodeType })
      .eq("id", parsed.stepId)
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    revalidateProcessFlow(step.template_id);
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function updateProcessStepName(input: unknown) {
  try {
    const parsed = processStepNameUpdateSchema.parse(input);
    const step = await getStepForWrite(parsed.stepId);
    const slug = await getAvailableStepSlug(step.template_id, parsed.name, parsed.stepId);
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("process_steps")
      .update({
        name: parsed.name,
        slug
      })
      .eq("id", parsed.stepId)
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    revalidateProcessFlow(step.template_id);
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function createProcessStepTransition(input: unknown) {
  try {
    const parsed = processStepTransitionCreateSchema.parse(input);
    await getTemplateForWrite(parsed.templateId);

    if (parsed.fromStepId === parsed.toStepId) {
      return fail("Choose a different target step for this transition.");
    }

    const supabase = await createServerSupabaseClient();
    const { data: steps, error: stepsError } = await supabase
      .from("process_steps")
      .select("id, template_id")
      .in("id", [parsed.fromStepId, parsed.toStepId]);

    if (stepsError) {
      return fail(stepsError.message);
    }

    if ((steps ?? []).length !== 2 || steps?.some((step) => step.template_id !== parsed.templateId)) {
      return fail("Both transition endpoints must belong to this process template.");
    }

    const { data, error } = await supabase
      .from("process_step_transitions")
      .upsert(
        {
          template_id: parsed.templateId,
          from_step_id: parsed.fromStepId,
          to_step_id: parsed.toStepId,
          edge_type: parsed.edgeType,
          label: parsed.label ?? null,
          condition: parsed.condition as Json,
          priority: parsed.priority
        },
        { onConflict: "template_id,from_step_id,to_step_id,edge_type" }
      )
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    revalidateProcessFlow(parsed.templateId);
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function deleteProcessStepTransitions(input: unknown) {
  try {
    const parsed = processStepTransitionDeleteSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data: transitions, error: lookupError } = await supabase
      .from("process_step_transitions")
      .select("*")
      .in("id", parsed.transitionIds);

    if (lookupError) {
      return fail(lookupError.message);
    }

    if ((transitions ?? []).length !== parsed.transitionIds.length) {
      return fail("One or more selected transitions no longer exist.");
    }

    const templateIds = Array.from(new Set((transitions ?? []).map((transition) => transition.template_id)));
    await Promise.all(templateIds.map((templateId) => getTemplateForWrite(templateId)));

    const { error } = await supabase
      .from("process_step_transitions")
      .delete()
      .in("id", parsed.transitionIds);

    if (error) {
      return fail(error.message);
    }

    for (const templateId of templateIds) {
      revalidateProcessFlow(templateId);
    }

    return ok({ deleted: parsed.transitionIds.length });
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function deleteProcessSteps(input: unknown) {
  try {
    const parsed = processStepDeleteSchema.parse(input);
    const stepIds = Array.from(new Set(parsed.stepIds));
    const supabase = await createServerSupabaseClient();
    const { data: steps, error: stepsError } = await supabase
      .from("process_steps")
      .select("*")
      .in("id", stepIds);

    if (stepsError) {
      return fail(stepsError.message);
    }

    if ((steps ?? []).length !== stepIds.length) {
      return fail("One or more selected process steps no longer exist.");
    }

    const templateIds = Array.from(new Set((steps ?? []).map((step) => step.template_id)));
    await Promise.all(templateIds.map((templateId) => getTemplateForWrite(templateId)));
    const adminSupabase = createSupabaseAdminClient();

    const { error: executionsDeleteError } = await adminSupabase
      .from("step_executions")
      .delete()
      .in("process_step_id", stepIds);

    if (executionsDeleteError) {
      return fail(executionsDeleteError.message);
    }

    const { error: calendarEventsUpdateError } = await adminSupabase
      .from("process_calendar_events")
      .update({
        process_step_id: null,
        manual_action: "Removed process step"
      })
      .in("process_step_id", stepIds);

    if (calendarEventsUpdateError) {
      return fail(calendarEventsUpdateError.message);
    }

    const { error } = await adminSupabase
      .from("process_steps")
      .delete()
      .in("id", stepIds);

    if (error) {
      return fail(error.message);
    }

    for (const templateId of templateIds) {
      revalidateProcessFlow(templateId);
    }

    return ok({ deleted: stepIds.length });
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
