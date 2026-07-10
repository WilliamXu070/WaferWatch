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
import {
  appendDicingMoveNoteToClones,
  buildDicingNoteSurfaceClones,
  getWaferDieNotesScopeKey,
  WAFER_DIE_NOTES_FIELD_KEY,
  WAFER_DIE_NOTES_SCOPE_TYPE
} from "@/features/runs/dicingNoteTransfer";
import { CURRENT_STEP_STATUSES, getSourceStepExecution } from "@/features/runs/stepExecutionSelection";
import { orderProcessStepsByOccurrence } from "@/features/process-flows/step-order";
import type { Json, ProcessStep, ProcessStepTransition, StepExecution } from "@/types/database";

const DIE_COUNT = 8;

function toJsonRecord(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeProcessText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function levenshteinDistance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) {
    rows[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }

  return rows[a.length][b.length];
}

function isDicingLikeStep(step: Pick<ProcessStep, "name" | "slug" | "process_area">) {
  const text = normalizeProcessText([
    step.name,
    step.slug,
    step.process_area
  ].join(" "));
  const compact = text.replace(/\s+/g, "");

  if (/(dicing|diced|dice|dicng|diciing|dicin|dicingg|singulation|singulate|sawing|sawcut|cutting)/.test(compact)) {
    return true;
  }

  return text.split(/\s+/).some((token) =>
    token.length >= 4 &&
    ["dicing", "diced", "dice"].some((target) => levenshteinDistance(token, target) <= 2)
  );
}

function getWaferFamily(waferCode: string, metadata: Json) {
  const record = toJsonRecord(metadata);
  const explicitFamily = record.wafer_family;
  if (typeof explicitFamily === "string" && explicitFamily.trim()) {
    return explicitFamily.trim().toUpperCase();
  }

  return waferCode.trim().toUpperCase();
}

function getDieLabelPrefix(waferCode: string, metadata: Json) {
  const family = getWaferFamily(waferCode, metadata);
  const prefix = family.match(/[A-Z]/)?.[0] ?? waferCode.trim().toUpperCase().match(/[A-Z]/)?.[0];
  return prefix ?? "D";
}

function getDieLabels(waferCode: string, metadata: Json) {
  const prefix = getDieLabelPrefix(waferCode, metadata);
  return Array.from({ length: DIE_COUNT }, (_, index) => `${prefix}${index + 1}`);
}

function compareFlowSteps(a: ProcessStep, b: ProcessStep) {
  const orderDelta = a.step_order - b.step_order;
  if (orderDelta !== 0) {
    return orderDelta;
  }

  return a.name.localeCompare(b.name);
}

async function getFollowingFlowSteps({
  fallbackAfterStepOrder,
  sourceStepId,
  supabase,
  targetStepId,
  templateId
}: {
  fallbackAfterStepOrder: number;
  sourceStepId: string;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  targetStepId?: string;
  templateId: string;
}) {
  const [stepsResult, transitionsResult] = await Promise.all([
    supabase
      .from("process_steps")
      .select("*")
      .eq("template_id", templateId)
      .order("step_order", { ascending: true }),
    supabase
      .from("process_step_transitions")
      .select("*")
      .eq("template_id", templateId)
      .eq("edge_type", "flow")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
  ]);

  if (stepsResult.error) {
    throw stepsResult.error;
  }

  if (transitionsResult.error) {
    throw transitionsResult.error;
  }

  const steps = (stepsResult.data ?? []) as ProcessStep[];
  const transitions = (transitionsResult.data ?? []) as ProcessStepTransition[];
  const stepById = new Map(steps.map((step) => [step.id, step]));
  const outgoingByStepId = new Map<string, ProcessStepTransition[]>();

  for (const transition of transitions) {
    const current = outgoingByStepId.get(transition.from_step_id);
    if (current) {
      current.push(transition);
    } else {
      outgoingByStepId.set(transition.from_step_id, [transition]);
    }
  }

  const orderedSteps: ProcessStep[] = [];
  const visited = new Set<string>();

  const visit = (stepId: string) => {
    if (visited.has(stepId)) {
      return;
    }

    const step = stepById.get(stepId);
    if (!step) {
      return;
    }

    visited.add(stepId);
    orderedSteps.push(step);

    for (const transition of outgoingByStepId.get(stepId) ?? []) {
      visit(transition.to_step_id);
    }
  };

  if (targetStepId) {
    visit(targetStepId);
  } else {
    for (const transition of outgoingByStepId.get(sourceStepId) ?? []) {
      visit(transition.to_step_id);
    }
  }

  if (orderedSteps.length > 0) {
    return orderedSteps;
  }

  return steps
    .filter((step) => step.step_order > fallbackAfterStepOrder)
    .sort(compareFlowSteps);
}

async function splitWaferAfterDicing({
  accountId,
  assignmentId,
  currentStep,
  dicingMoveNote,
  nextSteps,
  now,
  projectId,
  supabase,
  templateId,
  wafer
}: {
  accountId: string;
  assignmentId: string;
  currentStep: Pick<ProcessStep, "id" | "name" | "slug" | "process_area">;
  dicingMoveNote: string | null;
  nextSteps: ProcessStep[];
  now: string;
  projectId: string;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  templateId: string;
  wafer: {
    id: string;
    wafer_code: string;
    material_stack: string | null;
    diameter_mm: number | null;
    metadata: Json;
  };
}) {
  const nextStep = nextSteps[0];
  if (!nextStep) {
    return;
  }

  const parentMetadata = toJsonRecord(wafer.metadata);
  if (
    parentMetadata.dicing_completed_at ||
    parentMetadata.diced_child_die_labels ||
    parentMetadata.parent_wafer_id ||
    parentMetadata.current_die ||
    parentMetadata.created_from === "dicing_completion"
  ) {
    return;
  }

  const family = getWaferFamily(wafer.wafer_code, wafer.metadata);
  const dieLabels = getDieLabels(wafer.wafer_code, wafer.metadata);
  const childCodes = dieLabels.map((dieLabel) => `${wafer.wafer_code}-${dieLabel}`);
  const childRows = dieLabels.map((dieLabel, index) => ({
    project_id: projectId,
    wafer_code: childCodes[index],
    material_stack: wafer.material_stack,
    diameter_mm: wafer.diameter_mm,
    status: "queued" as const,
    notes: null,
    metadata: {
      parent_wafer_id: wafer.id,
      parent_wafer_code: wafer.wafer_code,
      wafer_family: family,
      wafer_display_mode: "diced",
      current_die: dieLabel,
      dicing_source_step_id: currentStep.id,
      dicing_source_step_name: currentStep.name,
      created_from: "dicing_completion"
    }
  }));

  const { error: childUpsertError } = await supabase
    .from("wafers")
    .upsert(childRows, { onConflict: "project_id,wafer_code" });

  if (childUpsertError) {
    throw childUpsertError;
  }

  const { data: childWafers, error: childLookupError } = await supabase
    .from("wafers")
    .select("id, wafer_code")
    .eq("project_id", projectId)
    .in("wafer_code", childCodes);

  if (childLookupError) {
    throw childLookupError;
  }

  const childWafersByCode = new Map((childWafers ?? []).map((child) => [child.wafer_code, child]));
  const childWaferIds = (childWafers ?? []).map((child) => child.id);
  const parentNotesScopeKey = getWaferDieNotesScopeKey(wafer.id, wafer.wafer_code);
  const { data: parentNoteSurfaces, error: parentNoteSurfacesError } = await supabase
    .from("text_surfaces")
    .select("scope_key, value")
    .eq("project_id", projectId)
    .eq("scope_type", WAFER_DIE_NOTES_SCOPE_TYPE)
    .eq("field_key", WAFER_DIE_NOTES_FIELD_KEY)
    .like("scope_key", `${parentNotesScopeKey}%`);

  if (parentNoteSurfacesError) {
    throw parentNoteSurfacesError;
  }

  const childNoteTargets = childCodes
    .map((code, index) => {
      const child = childWafersByCode.get(code);
      return child ? { id: child.id, dieLabel: dieLabels[index] } : null;
    })
    .filter((child): child is NonNullable<typeof child> => Boolean(child));
  const childNoteClones = appendDicingMoveNoteToClones({
    childWafers: childNoteTargets,
    clones: buildDicingNoteSurfaceClones({
      parentScopeKey: parentNotesScopeKey,
      surfaces: parentNoteSurfaces ?? [],
      childWafers: childNoteTargets
    }),
    dicingStepId: currentStep.id,
    dicingStepName: currentStep.name,
    noteBody: dicingMoveNote,
    timestamp: now
  });

  if (childNoteClones.length > 0) {
    const { error: childNoteCloneError } = await supabase
      .from("text_surfaces")
      .upsert(
        childNoteClones.map((clone) => ({
          project_id: projectId,
          scope_type: WAFER_DIE_NOTES_SCOPE_TYPE,
          scope_key: clone.scopeKey,
          field_key: WAFER_DIE_NOTES_FIELD_KEY,
          value: clone.value,
          updated_by: accountId,
          updated_at: now
        })),
        { onConflict: "project_id,scope_type,scope_key,field_key" }
      );

    if (childNoteCloneError) {
      throw childNoteCloneError;
    }
  }

  const { data: existingAssignments, error: existingAssignmentsError } = await supabase
    .from("wafer_process_assignments")
    .select("id, wafer_id")
    .eq("template_id", templateId)
    .in("wafer_id", childWaferIds);

  if (existingAssignmentsError) {
    throw existingAssignmentsError;
  }

  const assignedChildWaferIds = new Set((existingAssignments ?? []).map((assignment) => assignment.wafer_id));
  const assignmentRows = childCodes
    .map((code) => childWafersByCode.get(code))
    .filter((child): child is NonNullable<typeof child> => Boolean(child))
    .filter((child) => !assignedChildWaferIds.has(child.id))
    .map((child) => ({
      wafer_id: child.id,
      template_id: templateId,
      assigned_by: accountId,
      status: "queued" as const,
      assigned_at: now,
      started_at: null,
      completed_at: null
    }));

  if (assignmentRows.length > 0) {
    const { error: assignmentInsertError } = await supabase
      .from("wafer_process_assignments")
      .insert(assignmentRows);

    if (assignmentInsertError) {
      throw assignmentInsertError;
    }
  }

  const { data: childAssignments, error: childAssignmentLookupError } = await supabase
    .from("wafer_process_assignments")
    .select("id, wafer_id")
    .eq("template_id", templateId)
    .in("wafer_id", childWaferIds);

  if (childAssignmentLookupError) {
    throw childAssignmentLookupError;
  }

  const executionRows = (childAssignments ?? []).flatMap((assignment) =>
    nextSteps.map((step, index) => ({
      assignment_id: assignment.id,
      wafer_id: assignment.wafer_id,
      process_step_id: step.id,
      status: index === 0 ? "queued" : "pending",
      queue_started_at: index === 0 ? now : null,
      metadata: {}
    }))
  );

  if (executionRows.length > 0) {
    const { error: executionUpsertError } = await supabase
      .from("step_executions")
      .upsert(executionRows, { onConflict: "assignment_id,process_step_id" });

    if (executionUpsertError) {
      throw executionUpsertError;
    }
  }

  const childIdsByCode = childCodes
    .map((code) => childWafersByCode.get(code)?.id)
    .filter((id): id is string => Boolean(id));
  const nextParentMetadata = {
    ...parentMetadata,
    wafer_display_mode: "undiced",
    dicing_completed_at: now,
    diced_child_wafer_ids: childIdsByCode,
    diced_child_die_labels: dieLabels
  };

  const { error: parentWaferUpdateError } = await supabase
    .from("wafers")
    .update({
      status: "completed",
      metadata: nextParentMetadata
    })
    .eq("id", wafer.id);

  if (parentWaferUpdateError) {
    throw parentWaferUpdateError;
  }

  const { error: parentAssignmentUpdateError } = await supabase
    .from("wafer_process_assignments")
    .update({
      status: "completed",
      completed_at: now
    })
    .eq("id", assignmentId);

  if (parentAssignmentUpdateError) {
    throw parentAssignmentUpdateError;
  }

  const { error: eventInsertError } = await supabase.from("process_events").insert({
    project_id: projectId,
    wafer_id: wafer.id,
    actor_id: accountId,
    event_type: "wafer_diced",
    notes: `Created ${dieLabels.length} die pieces from ${wafer.wafer_code}.`,
    metadata: {
      assignment_id: assignmentId,
      dicing_step_id: currentStep.id,
      next_step_id: nextStep.id,
      child_wafer_ids: childIdsByCode,
      die_labels: dieLabels
    }
  });

  if (eventInsertError) {
    throw eventInsertError;
  }
}

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

    const { data: currentStep, error: currentStepError } = await supabase
      .from("process_steps")
      .select("*")
      .eq("id", context.process_step_id)
      .single();

    if (currentStepError) {
      return fail(currentStepError.message);
    }

    if (isDicingLikeStep(currentStep)) {
      try {
        const followingSteps = await getFollowingFlowSteps({
          fallbackAfterStepOrder: currentStep.step_order,
          sourceStepId: currentStep.id,
          supabase,
          templateId: currentStep.template_id
        });

        await splitWaferAfterDicing({
          accountId: account.userId,
          assignmentId: context.assignment_id,
          currentStep,
          dicingMoveNote: data.run_notes,
          nextSteps: followingSteps,
          now,
          projectId: wafer.project_id,
          supabase,
          templateId: currentStep.template_id,
          wafer: {
            id: wafer.id,
            wafer_code: wafer.wafer_code,
            material_stack: wafer.material_stack,
            diameter_mm: wafer.diameter_mm,
            metadata: wafer.metadata as Json
          }
        });
      } catch (splitError) {
        return fail(toErrorMessage(splitError));
      }

      revalidatePath("/", "layout");
      revalidatePath("/process-flow");
      revalidatePath("/wafer-status");
      revalidatePath("/dashboard");
      revalidatePath("/wireframe/process-flow");
      revalidatePath("/wireframe/wafer-status");
      revalidatePath("/wireframe/dashboard");
      return ok(data);
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
      .select("id, template_id, name, step_order, process_area, slug")
      .eq("id", parsed.targetStepId)
      .single();

    if (targetStepError) {
      return fail(targetStepError.message);
    }

    if (targetStep.template_id !== assignment.template_id) {
      return fail("The target step does not belong to this assignment process.");
    }

    if (parsed.sourceStepId === parsed.targetStepId) {
      return fail("Choose a different target step.");
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
    const currentExecution = getSourceStepExecution(existingExecutions, parsed.sourceStepId);

    if (!currentExecution) {
      return fail("This wafer does not have an active source step to move from.");
    }

    if (currentExecution.process_step_id !== parsed.sourceStepId) {
      return fail("This wafer is no longer at the source step. Refresh the process flow and try again.");
    }

    const currentStepResult = currentExecution
      ? await supabase
          .from("process_steps")
          .select("*")
          .eq("id", currentExecution.process_step_id)
          .maybeSingle()
      : null;

    if (currentStepResult?.error) {
      return fail(currentStepResult.error.message);
    }

    const currentStep = currentStepResult?.data ?? null;
    if (!currentStep) {
      return fail("The source step no longer exists.");
    }

    const [processStepsResult, transitionsResult] = await Promise.all([
      supabase
        .from("process_steps")
        .select("id, step_order, name, node_type")
        .eq("template_id", assignment.template_id),
      supabase
        .from("process_step_transitions")
        .select("from_step_id, to_step_id, edge_type, priority, created_at")
        .eq("template_id", assignment.template_id)
    ]);

    if (processStepsResult.error) {
      return fail(processStepsResult.error.message);
    }

    if (transitionsResult.error) {
      return fail(transitionsResult.error.message);
    }

    const orderedSteps = orderProcessStepsByOccurrence(
      processStepsResult.data ?? [],
      transitionsResult.data ?? []
    );
    const stepOccurrenceById = new Map(orderedSteps.map((step, index) => [step.id, index]));
    const sourceOccurrence = stepOccurrenceById.get(currentStep.id) ?? currentStep.step_order;
    const targetOccurrence = stepOccurrenceById.get(targetStep.id) ?? targetStep.step_order;
    const isRevertMove = Boolean(parsed.revertToPriorStep);
    if (isRevertMove && targetOccurrence >= sourceOccurrence) {
      return fail("Revert target must be an earlier process step.");
    }

    if (isRevertMove) {
      const waferMetadata = toJsonRecord(wafer.metadata as Json);
      const dicingSourceStepId = typeof waferMetadata.dicing_source_step_id === "string"
        ? waferMetadata.dicing_source_step_id
        : null;
      if (dicingSourceStepId) {
        const dicingSourceOccurrence = stepOccurrenceById.get(dicingSourceStepId);
        if (dicingSourceOccurrence !== undefined && targetOccurrence <= dicingSourceOccurrence) {
          return fail("Cannot revert a diced child back through the dicing step.");
        }
      }
    }

    const { data: allowedTransition, error: transitionError } = isRevertMove
      ? { data: null, error: null }
      : await supabase
          .from("process_step_transitions")
          .select("id, edge_type")
          .eq("template_id", assignment.template_id)
          .eq("from_step_id", parsed.sourceStepId)
          .eq("to_step_id", parsed.targetStepId)
          .limit(1)
          .maybeSingle();

    if (transitionError) {
      return fail(transitionError.message);
    }

    if (!isRevertMove && !allowedTransition) {
      return fail("This wafer can only move along a directly connected process path.");
    }

    const shouldCompleteSourceStep = Boolean(
      parsed.completeSourceStep &&
      !isRevertMove &&
      currentExecution &&
      currentExecution.process_step_id !== parsed.targetStepId &&
      CURRENT_STEP_STATUSES.includes(currentExecution.status as (typeof CURRENT_STEP_STATUSES)[number]) &&
      currentStep &&
      allowedTransition?.edge_type === "flow"
    );

    const activeExecutionIds = existingExecutions
      .filter((execution) =>
        execution.process_step_id !== parsed.targetStepId &&
        (!shouldCompleteSourceStep || execution.id !== currentExecution?.id) &&
        CURRENT_STEP_STATUSES.includes(execution.status as (typeof CURRENT_STEP_STATUSES)[number])
      )
      .map((execution) => execution.id);

    const revertedExecutionIds = isRevertMove
      ? existingExecutions
          .filter((execution) => {
            const occurrence = stepOccurrenceById.get(execution.process_step_id);
            return (
              execution.process_step_id !== parsed.targetStepId &&
              occurrence !== undefined &&
              occurrence > targetOccurrence &&
              execution.status !== "pending"
            );
          })
          .map((execution) => execution.id)
      : [];

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

    if (revertedExecutionIds.length) {
      const resetRows = existingExecutions.filter((execution) => revertedExecutionIds.includes(execution.id));
      for (const execution of resetRows) {
        const metadata = toJsonRecord(execution.metadata as Json);
        const { error: revertResetError } = await supabase
          .from("step_executions")
          .update({
            status: "pending",
            queue_started_at: null,
            started_at: null,
            completed_at: null,
            skipped_at: null,
            planned_end_at: null,
            operator_id: null,
            completed_by: null,
            run_notes: execution.run_notes,
            metadata: {
              ...metadata,
              reverted_at: now,
              reverted_from_step_id: currentStep.id,
              reverted_to_step_id: targetStep.id,
              reverted_reason: parsed.note
            }
          })
          .eq("id", execution.id);

        if (revertResetError) {
          return fail(revertResetError.message);
        }
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

      if (currentStep && isDicingLikeStep(currentStep)) {
        try {
          const followingSteps = await getFollowingFlowSteps({
            fallbackAfterStepOrder: currentStep.step_order,
            sourceStepId: currentStep.id,
            supabase,
            targetStepId: parsed.targetStepId,
            templateId: assignment.template_id
          });

          await splitWaferAfterDicing({
            accountId: account.userId,
            assignmentId: parsed.assignmentId,
            currentStep,
            dicingMoveNote: parsed.note ?? currentExecution.run_notes,
            nextSteps: followingSteps,
            now,
            projectId: wafer.project_id,
            supabase,
            templateId: assignment.template_id,
            wafer: {
              id: wafer.id,
              wafer_code: wafer.wafer_code,
              material_stack: wafer.material_stack,
              diameter_mm: wafer.diameter_mm,
              metadata: wafer.metadata as Json
            }
          });
        } catch (splitError) {
          return fail(toErrorMessage(splitError));
        }

        revalidatePath("/", "layout");
        revalidatePath("/process-flow");
        revalidatePath("/wafer-status");
        revalidatePath("/dashboard");
        revalidatePath("/wireframe/process-flow");
        revalidatePath("/wireframe/wafer-status");
        revalidatePath("/wireframe/dashboard");
        revalidatePath(`/processes/${assignment.template_id}`);
        return ok(currentExecution);
      }
    }

    const targetMetadata = targetExecution ? toJsonRecord(targetExecution.metadata as Json) : {};
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
      run_notes: shouldCompleteSourceStep ? targetExecution?.run_notes ?? null : parsed.note ?? targetExecution?.run_notes ?? null,
      metadata: isRevertMove
        ? {
            ...targetMetadata,
            revert_target_at: now,
            reverted_from_step_id: currentStep.id,
            reverted_to_step_id: targetStep.id,
            revert_reason: parsed.note
          }
        : targetMetadata
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
      event_type: isRevertMove ? "wafer_step_reverted" : "wafer_step_moved",
      notes: parsed.note ?? null,
      metadata: {
        assignment_id: parsed.assignmentId,
        from_step_id: currentExecution?.process_step_id ?? null,
        to_step_id: parsed.targetStepId,
        to_step_name: targetStep.name,
        reset_step_execution_ids: activeExecutionIds,
        completed_source_step_execution_id: shouldCompleteSourceStep ? currentExecution?.id ?? null : null,
        movement_kind: isRevertMove ? "revert" : "advance",
        reverted_step_execution_ids: revertedExecutionIds
      }
    });

    if (eventError) {
      return fail(eventError.message);
    }

    revalidatePath("/", "layout");
    revalidatePath("/process-flow");
    revalidatePath("/wafer-status");
    revalidatePath("/dashboard");
    revalidatePath("/wireframe/process-flow");
    revalidatePath("/wireframe/wafer-status");
    revalidatePath("/wireframe/dashboard");
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
