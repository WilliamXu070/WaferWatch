"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
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
import type { Json, ProcessStep } from "@/types/database";

const DIE_COUNT = 8;
const DASHBOARD_BATCH_EVIDENCE_KEY = "_waferwatch_batch_id";

function withDashboardBatchEvidence(
  evidence: Record<string, unknown>,
  batchId: string
): Json {
  return {
    ...evidence,
    [DASHBOARD_BATCH_EVIDENCE_KEY]: batchId
  } as Json;
}

function stepExecutionIdFromMutationData(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = (data as Record<string, unknown>).step_execution_id;
  return typeof value === "string" ? value : null;
}

async function recordPlannedBatchMember({
  supabase,
  batchId,
  stepExecutionId,
  note,
  parentBatchId
}: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  batchId: string;
  stepExecutionId: string | null;
  note: string | null | undefined;
  parentBatchId?: string | null;
}) {
  if (!stepExecutionId) return;
  const { error } = await supabase.rpc("record_planned_batch_member", {
    target_batch_id: batchId,
    target_step_execution_id: stepExecutionId,
    batch_note: note ?? null,
    parent_batch_id: parentBatchId ?? null
  });
  if (error) {
    // The movement already succeeded in its authoritative RPC. Do not report a
    // false movement failure while a migration is rolling out; surface it to logs.
    console.error("[ProcessFlow] failed to persist planned batch member", error);
  }
}

async function batchIdForStepExecution(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  stepExecutionId: string
) {
  const { data } = await supabase
    .from("process_batch_members")
    .select("batch_id")
    .eq("step_execution_id", stepExecutionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.batch_id ?? null;
}

function toJsonRecord(value: unknown): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, Json | undefined>;
}

function normalizeProcessText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isDicingLikeStep(step: Pick<ProcessStep, "name" | "slug" | "process_area">) {
  const text = normalizeProcessText([
    step.name,
    step.slug,
    step.process_area
  ].join(" "));
  const compact = text.replace(/\s+/g, "");

  if (/(pre|post|after|before)(dicing|diced|dice|singulation|singulate|sawing|sawcut|cutting)/.test(compact)) {
    return false;
  }

  return /(dicing|diced|dice|dicng|diciing|dicin|dicingg|singulation|singulate|sawing|sawcut|cutting)/.test(compact);
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
  const record = toJsonRecord(metadata);
  const configuredLabels = Array.isArray(record.die_labels)
    ? record.die_labels
        .filter((label): label is string => typeof label === "string" && Boolean(label.trim()))
        .map((label) => label.trim())
    : [];

  if (configuredLabels.length > 0) {
    return [...new Set(configuredLabels)];
  }

  const configuredCount = record.die_count;
  if (typeof configuredCount === "number" && Number.isFinite(configuredCount) && configuredCount > 0) {
    return Array.from(
      { length: Math.floor(configuredCount) },
      (_, index) => `${waferCode.trim()}_${index + 1}`
    );
  }

  const prefix = getDieLabelPrefix(waferCode, metadata);
  return Array.from({ length: DIE_COUNT }, (_, index) => `${prefix}${index + 1}`);
}

function revalidateCheckpointWorkflow() {
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/process-flow");
  revalidatePath("/wafer-status");
}

async function getDicingChildSpecsForCheckpoint({
  attemptId,
  supabase
}: {
  attemptId: string;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
}) {
  const { data: attempt, error: attemptError } = await supabase
    .from("process_step_attempts")
    .select("process_step_id, wafer_id")
    .eq("id", attemptId)
    .single();

  if (attemptError) throw attemptError;

  const [stepResult, waferResult] = await Promise.all([
    supabase
      .from("process_steps")
      .select("id, name, slug, process_area")
      .eq("id", attempt.process_step_id)
      .single(),
    supabase
      .from("wafers")
      .select("id, wafer_code, metadata")
      .eq("id", attempt.wafer_id)
      .single()
  ]);

  if (stepResult.error) throw stepResult.error;
  if (waferResult.error) throw waferResult.error;
  if (!isDicingLikeStep(stepResult.data)) return null;

  const dieLabels = getDieLabels(waferResult.data.wafer_code, waferResult.data.metadata as Json);
  return dieLabels.map((dieLabel) => ({
    die_label: dieLabel,
    wafer_code: dieLabel.toUpperCase().startsWith(`${waferResult.data.wafer_code.trim().toUpperCase()}_`)
      ? dieLabel
      : `${waferResult.data.wafer_code}-${dieLabel}`
  }));
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function persistProcessFlowMutationsBatch(input: unknown) {
  const startedAt = performance.now();
  try {
    const parsed = processFlowMutationBatchSchema.parse(input);
    const authStartedAt = performance.now();
    await requireAccount();
    const authMs = performance.now() - authStartedAt;
    const supabase = await createServerSupabaseClient();
    const rpcStartedAt = performance.now();

    const outcomes = await mapWithConcurrency(parsed.mutations, 4, async (mutation): Promise<ProcessFlowMutationOutcome> => {
      const operationId = mutation.kind === "route" ? mutation.movementMutationId : mutation.mutationId;
      try {
        if (mutation.kind === "submit") {
          const existingBatchId = await batchIdForStepExecution(supabase, mutation.stepExecutionId);
          const batchId = existingBatchId ?? mutation.batchId;
          const { data, error } = await supabase.rpc("submit_step_checkpoint", {
            target_step_execution_id: mutation.stepExecutionId,
            mutation_id: mutation.mutationId,
            notes: mutation.notes ?? null,
            evidence: withDashboardBatchEvidence(mutation.evidence, batchId)
          });
          if (error) throw error;
          return { operationId, assignmentId: mutation.assignmentId, ok: true, data };
        }

        if (mutation.kind === "move") {
          const { data: sourceExecution } = await supabase
            .from("step_executions")
            .select("id")
            .eq("assignment_id", mutation.assignmentId)
            .eq("process_step_id", mutation.sourceStepId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const parentBatchId = sourceExecution?.id
            ? await batchIdForStepExecution(supabase, sourceExecution.id)
            : null;
          const { data, error } = await supabase.rpc(
            mutation.correctCheckpointRoute
              ? "correct_checkpoint_route_assignment"
              : "move_approved_checkpoint_assignment",
            {
              target_assignment_id: mutation.assignmentId,
              target_step_id: mutation.targetStepId,
              mutation_id: mutation.mutationId,
              notes: mutation.note
            }
          );
          if (error) throw error;
          await recordPlannedBatchMember({
            supabase,
            batchId: mutation.batchId,
            stepExecutionId: stepExecutionIdFromMutationData(data),
            note: mutation.note,
            parentBatchId
          });
          return { operationId, assignmentId: mutation.assignmentId, ok: true, data };
        }

        const { data: attempt } = await supabase
          .from("process_step_attempts")
          .select("batch_id")
          .eq("id", mutation.attemptId)
          .maybeSingle();
        const dicingChildSpecs = await getDicingChildSpecsForCheckpoint({
          attemptId: mutation.attemptId,
          supabase
        });
        const childSpecs = (dicingChildSpecs ?? []).map((spec) => ({
          ...spec,
          movement_mutation_id: crypto.randomUUID()
        }));
        const { data, error } = await supabase.rpc("route_checkpoint_submission", {
          target_attempt_id: mutation.attemptId,
          target_step_id: mutation.targetStepId,
          decision_mutation_id: mutation.decisionMutationId,
          movement_mutation_id: mutation.movementMutationId,
          notes: mutation.note,
          child_specs: childSpecs as Json
        });
        if (error) throw error;
        await recordPlannedBatchMember({
          supabase,
          batchId: mutation.batchId,
          stepExecutionId: stepExecutionIdFromMutationData(data),
          note: mutation.note,
          parentBatchId: attempt?.batch_id ?? null
        });
        return { operationId, assignmentId: mutation.assignmentId, ok: true, data };
      } catch (error) {
        return {
          operationId,
          assignmentId: mutation.assignmentId,
          ok: false,
          error: toErrorMessage(error)
        };
      }
    });

    console.info("[ProcessFlowPerf]", JSON.stringify({
      action: "workflow_batch",
      mutationCount: parsed.mutations.length,
      authMs: Math.round(authMs),
      rpcMs: Math.round(performance.now() - rpcStartedAt),
      totalMs: Math.round(performance.now() - startedAt)
    }));
    return ok(outcomes);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function submitStepCheckpoint(input: unknown) {
  try {
    await requireAccount();
    const parsed = submitStepCheckpointSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("submit_step_checkpoint", {
      target_step_execution_id: parsed.stepExecutionId,
      mutation_id: parsed.mutationId,
      notes: parsed.notes ?? null,
      evidence: withDashboardBatchEvidence(parsed.evidence, parsed.batchId)
    });

    if (error) {
      return fail(error.message);
    }

    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function moveApprovedCheckpointWafer(input: unknown) {
  try {
    await requireAccount();
    const parsed = moveApprovedCheckpointSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc(
      parsed.correctCheckpointRoute
        ? "correct_checkpoint_route_assignment"
        : "move_approved_checkpoint_assignment",
      {
        target_assignment_id: parsed.assignmentId,
        target_step_id: parsed.targetStepId,
        mutation_id: parsed.mutationId,
        notes: parsed.note
      }
    );

    if (error) {
      return fail(error.message);
    }

    await recordPlannedBatchMember({
      supabase,
      batchId: parsed.batchId,
      stepExecutionId: stepExecutionIdFromMutationData(data),
      note: parsed.note
    });

    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
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
      return fail(error.message);
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
    if (error) return fail(error.message);

    revalidateCheckpointWorkflow();
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function routeCheckpointSubmission(input: unknown) {
  try {
    await requireAccount();
    const parsed = routeCheckpointSubmissionSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data: attempt } = await supabase
      .from("process_step_attempts")
      .select("batch_id")
      .eq("id", parsed.attemptId)
      .maybeSingle();
    const dicingChildSpecs = await getDicingChildSpecsForCheckpoint({
      attemptId: parsed.attemptId,
      supabase
    });
    const childSpecs = (dicingChildSpecs ?? []).map((spec) => ({
      ...spec,
      movement_mutation_id: crypto.randomUUID()
    }));
    const { data, error } = await supabase.rpc("route_checkpoint_submission", {
      target_attempt_id: parsed.attemptId,
      target_step_id: parsed.targetStepId,
      decision_mutation_id: parsed.decisionMutationId,
      movement_mutation_id: parsed.movementMutationId,
      notes: parsed.note,
      child_specs: childSpecs as Json
    });

    if (error) {
      return fail(error.message);
    }

    await recordPlannedBatchMember({
      supabase,
      batchId: parsed.batchId,
      stepExecutionId: stepExecutionIdFromMutationData(data),
      note: parsed.note,
      parentBatchId: attempt?.batch_id ?? null
    });

    revalidateCheckpointWorkflow();
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}
