"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  correctWaferProcessHistorySchema,
  moveApprovedCheckpointSchema,
  processFlowMutationBatchSchema,
  routeCheckpointSubmissionSchema,
  submitStepCheckpointSchema,
  undoDieProcessHistorySchema
} from "@/features/runs/schemas";
import type { ProcessFlowMutationOutcome } from "@/components/process-flow/types";
import type { Json } from "@/types/database";
import { executeWorkflowCommandForCurrentActor } from "@/features/workflow-commands/server";
import type { WorkflowCommandResult } from "@/features/workflow-commands/types";

function revalidateCheckpointWorkflow() {
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/process-flow");
  revalidatePath("/wafer-status");
}

function jsonRecord(data: Json | undefined) {
  return data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, Json | undefined>
    : {};
}

async function workflowActionResult<T>(
  execute: () => Promise<WorkflowCommandResult>,
  select: (data: Json) => T
): Promise<ActionResult<T>> {
  try {
    const result = await execute();
    return result.ok ? ok(select(result.data)) : fail(result.message);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

async function resolveProcessFlowMutationTemplateId(
  mutation: import("@/features/runs/schemas").ProcessFlowMutationInput,
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
) {
  if (mutation.kind === "route") {
    const { data, error } = await supabase
      .from("process_step_attempts")
      .select("template_id")
      .eq("id", mutation.attemptId)
      .single();
    if (error) throw error;
    return data.template_id;
  }
  if (mutation.kind === "move") {
    const { data, error } = await supabase
      .from("wafer_process_assignments")
      .select("template_id")
      .eq("id", mutation.assignmentId)
      .single();
    if (error) throw error;
    return data.template_id;
  }
  const { data: execution, error: executionError } = await supabase
    .from("step_executions")
    .select("process_step_id")
    .eq("id", mutation.stepExecutionId)
    .single();
  if (executionError) throw executionError;
  const { data: step, error: stepError } = await supabase
    .from("process_steps")
    .select("template_id")
    .eq("id", execution.process_step_id)
    .single();
  if (stepError) throw stepError;
  return step.template_id;
}

async function getRouteCommandKind(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  attemptId: string,
  targetStepId: string
): Promise<"wafer.route" | "wafer.redo"> {
  const { data: attempt, error: attemptError } = await supabase
    .from("process_step_attempts")
    .select("assignment_id")
    .eq("id", attemptId)
    .single();
  if (attemptError) throw attemptError;
  const { data: priorVisit, error: priorVisitError } = await supabase
    .from("vw_operation_run_history")
    .select("operation_run_member_id")
    .eq("assignment_id", attempt.assignment_id)
    .eq("process_step_id", targetStepId)
    .eq("member_status", "completed")
    .limit(1)
    .maybeSingle();
  if (priorVisitError) throw priorVisitError;
  return priorVisit ? "wafer.redo" : "wafer.route";
}

export async function persistProcessFlowMutationsBatch(input: unknown) {
  const startedAt = performance.now();
  const parsed = processFlowMutationBatchSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "The Process Flow command is invalid.");
  try {
    const supabase = await createServerSupabaseClient();
    const first = parsed.data.mutations[0]!;
    const templateId = await resolveProcessFlowMutationTemplateId(first, supabase);
    const mutationId = first.kind === "route" ? first.movementMutationId : first.mutationId;
    const isSingle = parsed.data.mutations.length === 1;
    const result = isSingle && first.kind === "submit"
      ? await executeWorkflowCommandForCurrentActor({
          kind: "wafer.submit",
          mutationId,
          templateId,
          payload: {
            assignmentId: first.assignmentId,
            stepExecutionId: first.stepExecutionId,
            batchId: first.batchId,
            notes: first.notes ?? null,
            evidence: first.evidence
          }
        })
      : isSingle && first.kind === "route"
        ? await executeWorkflowCommandForCurrentActor({
            kind: await getRouteCommandKind(supabase, first.attemptId, first.targetStepId),
            mutationId,
            templateId,
            payload: {
              assignmentId: first.assignmentId,
              batchId: first.batchId,
              attemptId: first.attemptId,
              targetStepId: first.targetStepId,
              decisionMutationId: first.decisionMutationId,
              note: first.note
            }
          })
        : await executeWorkflowCommandForCurrentActor({
            kind: "wafer.batch.move",
            mutationId,
            templateId,
            payload: { mutations: parsed.data.mutations }
          });
    console.info("[ProcessFlowPerf]", JSON.stringify({
      action: "workflow_batch",
      mutationCount: parsed.data.mutations.length,
      totalMs: Math.round(performance.now() - startedAt)
    }));
    if (!result.ok) return fail(result.message);
    if (!isSingle || first.kind === "move") {
      return ok(Array.isArray(result.data) ? result.data as unknown as ProcessFlowMutationOutcome[] : []);
    }
    return ok([{
      operationId: mutationId,
      assignmentId: first.assignmentId,
      ok: true,
      data: result.data
    }]);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function submitStepCheckpoint(input: unknown) {
  const parsed = submitStepCheckpointSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "The checkpoint command is invalid.");
  return workflowActionResult(async () => {
    const supabase = await createServerSupabaseClient();
    const mutation = { kind: "submit" as const, assignmentId: crypto.randomUUID(), ...parsed.data };
    const templateId = await resolveProcessFlowMutationTemplateId(mutation, supabase);
    return executeWorkflowCommandForCurrentActor({
      kind: "wafer.submit",
      mutationId: parsed.data.mutationId,
      templateId,
      payload: {
        stepExecutionId: parsed.data.stepExecutionId,
        batchId: parsed.data.batchId,
        notes: parsed.data.notes ?? null,
        evidence: parsed.data.evidence
      }
    });
  }, (data) => data);
}

export async function moveApprovedCheckpointWafer(input: unknown) {
  const parsed = moveApprovedCheckpointSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "The movement command is invalid.");
  return workflowActionResult(async () => {
    const supabase = await createServerSupabaseClient();
    const mutation = { kind: "move" as const, ...parsed.data };
    const templateId = await resolveProcessFlowMutationTemplateId(mutation, supabase);
    return executeWorkflowCommandForCurrentActor({
      kind: "wafer.batch.move",
      mutationId: parsed.data.mutationId,
      templateId,
      payload: { mutations: [mutation] }
    });
  }, (data) => Array.isArray(data) ? (jsonRecord(data[0]).data ?? null) : null);
}

export async function undoDieProcessHistoryState(input: unknown) {
  try {
    await requireAccount();
    const parsed = undoDieProcessHistorySchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("undo_die_process_history_state", {
      target_assignment_id: parsed.assignmentId,
      expected_step_id: parsed.expectedStepId,
      expected_step_status: parsed.expectedStepStatus,
      mutation_id: parsed.mutationId
    });

    if (error) {
      return fail(toErrorMessage(error));
    }

    revalidateCheckpointWorkflow();
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

/**
 * Creates an append-only history overlay. The RPC owns the template snapshot,
 * required-field validation, revision check, and linked parameter record so a
 * Status edit and Process Flow always project the same data.
 */
export async function correctWaferProcessHistory(input: unknown) {
  try {
    await requireAccount();
    const parsed = correctWaferProcessHistorySchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("correct_wafer_process_history", {
      target_assignment_id: parsed.assignmentId,
      correction_kind: parsed.kind,
      target_visit_id: parsed.kind === "insert" ? parsed.anchorVisitId : parsed.visitId,
      anchor_visit_id: parsed.kind === "insert" ? parsed.anchorVisitId : null,
      placement: parsed.kind === "insert" ? parsed.placement : null,
      target_step_id: parsed.kind === "insert" ? parsed.stepId : null,
      completed_at: parsed.kind === "insert" ? parsed.completedAt : null,
      reason: parsed.reason,
      expected_history_revision: parsed.expectedHistoryRevision,
      mutation_id: parsed.mutationId,
      parameter_values: parsed.kind === "insert" ? parsed.parameterValues as Json : {},
      parameter_notes: parsed.kind === "insert" ? parsed.parameterNotes as Json : {}
    });
    if (error) return fail(toErrorMessage(error));

    revalidateCheckpointWorkflow();
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function routeCheckpointSubmission(input: unknown) {
  const parsed = routeCheckpointSubmissionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "The routing command is invalid.");
  return workflowActionResult(async () => {
    const supabase = await createServerSupabaseClient();
    const mutation = { kind: "route" as const, assignmentId: crypto.randomUUID(), ...parsed.data };
    const templateId = await resolveProcessFlowMutationTemplateId(mutation, supabase);
    const kind = await getRouteCommandKind(supabase, parsed.data.attemptId, parsed.data.targetStepId);
    return executeWorkflowCommandForCurrentActor({
      kind,
      mutationId: parsed.data.movementMutationId,
      templateId,
      payload: {
        batchId: parsed.data.batchId,
        attemptId: parsed.data.attemptId,
        targetStepId: parsed.data.targetStepId,
        decisionMutationId: parsed.data.decisionMutationId,
        note: parsed.data.note
      }
    });
  }, (data) => data);
}
