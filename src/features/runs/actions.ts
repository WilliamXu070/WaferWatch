"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  moveApprovedCheckpointSchema,
  routeCheckpointSubmissionSchema,
  submitStepCheckpointSchema,
  undoDieProcessHistorySchema
} from "@/features/runs/schemas";
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

    revalidateCheckpointWorkflow();
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

    revalidateCheckpointWorkflow();
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

export async function routeCheckpointSubmission(input: unknown) {
  try {
    await requireAccount();
    const parsed = routeCheckpointSubmissionSchema.parse(input);
    const supabase = await createServerSupabaseClient();
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

    revalidateCheckpointWorkflow();
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}
