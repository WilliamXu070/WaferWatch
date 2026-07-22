"use server";

import { fail, ok } from "@/lib/action-result";
import { requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json, PlannedOperationResource } from "@/types/database";
import {
  applyProposalSchema,
  createPlanSchema,
  createPlannedBatchSchema,
  createPlannedOperationSchema,
  deletePlannedOperationSchema,
  generateProposalSchema,
  publishPlanSchema,
  replacePlannedBatchMembersSchema,
  requestReplanSchema,
  updatePlannedOperationSchema
} from "./schemas";
import {
  buildPlanAdjustment,
  SCHEDULER_VERSION,
  type SchedulerResource
} from "./scheduler";

export async function createProcessPlan(input: unknown) {
  try {
    await requireAccount();
    const value = createPlanSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("create_process_plan", {
      target_project_id: value.projectId,
      target_template_id: value.templateId,
      planning_starts_at: value.startsAt,
      planning_ends_at: value.endsAt,
      mutation_id: value.mutationId
    });
    return error ? fail(error.message) : ok(data);
  } catch (error) { return fail(toErrorMessage(error)); }
}

export async function createPlannedBatch(input: unknown) {
  try {
    await requireAccount();
    const value = createPlannedBatchSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("create_planned_batch", {
      target_revision_id: value.revisionId,
      logical_id: value.logicalId,
      batch_name: value.name,
      batch_note: value.note ?? null,
      assignment_ids: value.assignmentIds,
      mutation_id: value.mutationId
    });
    return error ? fail(error.message) : ok(data);
  } catch (error) { return fail(toErrorMessage(error)); }
}

export async function replacePlannedBatchMembers(input: unknown) {
  try {
    await requireAccount();
    const value = replacePlannedBatchMembersSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("replace_planned_batch_members", {
      target_batch_id: value.batchId,
      expected_revision: value.expectedRevision,
      assignment_ids: value.assignmentIds,
      mutation_id: value.mutationId
    });
    return error ? fail(error.message) : ok(data);
  } catch (error) { return fail(toErrorMessage(error)); }
}

export async function createPlannedOperation(input: unknown) {
  try {
    await requireAccount();
    const value = createPlannedOperationSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("create_planned_operation", {
      target_revision_id: value.revisionId,
      logical_id: value.logicalId,
      target_step_id: value.stepId,
      target_batch_id: value.batchId ?? null,
      operation_name: value.name,
      starts_at: value.startsAt,
      ends_at: value.endsAt,
      user_pinned: value.userPinned,
      parameter_rows: value.parameters as unknown as Json,
      resource_rows: value.resources as unknown as Json,
      mutation_id: value.mutationId
    });
    return error ? fail(error.message) : ok(data);
  } catch (error) { return fail(toErrorMessage(error)); }
}

export async function updatePlannedOperation(input: unknown) {
  try {
    await requireAccount();
    const value = updatePlannedOperationSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("update_planned_operation", {
      target_operation_id: value.operationId,
      expected_revision: value.expectedRevision,
      patch: value.patch as Json,
      mutation_id: value.mutationId
    });
    return error ? fail(error.message) : ok(data);
  } catch (error) { return fail(toErrorMessage(error)); }
}

export async function deletePlannedOperation(input: unknown) {
  try {
    await requireAccount();
    const value = deletePlannedOperationSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("delete_planned_operation", {
      target_operation_id: value.operationId,
      expected_revision: value.expectedRevision,
      mutation_id: value.mutationId
    });
    return error ? fail(error.message) : ok(data);
  } catch (error) { return fail(toErrorMessage(error)); }
}

export async function publishProcessPlan(input: unknown) {
  try {
    await requireAccount();
    const value = publishPlanSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("publish_process_plan", {
      target_revision_id: value.revisionId,
      expected_revision: value.expectedRevision,
      mutation_id: value.mutationId
    });
    return error ? fail(error.message) : ok(data);
  } catch (error) { return fail(toErrorMessage(error)); }
}

export async function requestPlanAdjustment(input: unknown) {
  try {
    await requireAccount();
    const value = requestReplanSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("create_plan_replan_request", {
      target_plan_id: value.planId,
      source_run_id: value.sourceRunId ?? null,
      request_kind: value.kind,
      requested_change: value.requestedChange as Json,
      mutation_id: value.mutationId
    });
    return error ? fail(error.message) : ok(data);
  } catch (error) { return fail(toErrorMessage(error)); }
}

function resourceId(resource: PlannedOperationResource) {
  return resource.person_id ?? resource.tool_id ?? resource.recipe_id ?? resource.location_id;
}

export async function generatePlanAdjustmentProposal(input: unknown) {
  try {
    await requireAccount();
    const value = generateProposalSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data: request, error: requestError } = await supabase
      .from("plan_replan_requests")
      .select("*")
      .eq("id", value.requestId)
      .single();
    if (requestError) return fail(requestError.message);
    const [{ data: plan, error: planError }, { data: draft, error: draftError }] = await Promise.all([
      supabase.from("process_plans").select("*").eq("id", request.plan_id).single(),
      supabase.from("process_plan_revisions").select("*").eq("id", request.draft_revision_id).single()
    ]);
    if (planError || draftError) return fail((planError ?? draftError)!.message);
    const [operationsResult, dependenciesResult, resourcesResult, reservationsResult, toolsResult] = await Promise.all([
      supabase.from("planned_operations").select("*").eq("revision_id", draft.id),
      supabase.from("planned_operation_dependencies").select("*").eq("revision_id", draft.id),
      supabase.from("planned_operation_resources").select("*, planned_operations!inner(revision_id)").eq("planned_operations.revision_id", draft.id),
      supabase.from("tool_reservations").select("tool_id, starts_at, ends_at").eq("project_id", plan.project_id).eq("status", "scheduled")
        .lt("starts_at", draft.planning_ends_at).gt("ends_at", draft.planning_starts_at),
      supabase.from("fabrication_tools").select("id, status")
    ]);
    const firstError = [operationsResult, dependenciesResult, resourcesResult, reservationsResult, toolsResult].find((result) => result.error)?.error;
    if (firstError) return fail(firstError.message);
    const operationIds = (operationsResult.data ?? []).map((operation) => operation.id);
    const runsResult = operationIds.length
      ? await supabase
          .from("operation_runs")
          .select("planned_operation_id, status")
          .in("planned_operation_id", operationIds)
      : { data: [], error: null } as const;
    if (runsResult.error) return fail(runsResult.error.message);
    const requestedChange = request.requested_change && typeof request.requested_change === "object" && !Array.isArray(request.requested_change)
      ? request.requested_change as Record<string, Json | undefined>
      : {};
    const sourceRun = request.source_run_id
      ? await supabase.from("operation_runs").select("planned_operation_id, completed_at").eq("id", request.source_run_id).maybeSingle()
      : { data: null, error: null };
    if (sourceRun.error) return fail(sourceRun.error.message);
    const resources = (resourcesResult.data ?? []).flatMap((resource) => {
      const id = resourceId(resource as PlannedOperationResource);
      return id ? [{ operationId: resource.planned_operation_id, kind: resource.resource_kind, resourceId: id } as SchedulerResource] : [];
    });
    const proposal = buildPlanAdjustment({
      operations: (operationsResult.data ?? []).map((operation) => ({
        id: operation.id,
        logicalId: operation.logical_id,
        startsAt: operation.scheduled_start_at,
        endsAt: operation.scheduled_end_at,
        rowVersion: operation.row_version,
        userPinned: operation.user_pinned,
        status: operation.status
      })),
      dependencies: (dependenciesResult.data ?? []).map((dependency) => ({
        predecessorId: dependency.predecessor_operation_id,
        successorId: dependency.successor_operation_id,
        lagMinutes: dependency.lag_minutes
      })),
      resources,
      unavailableToolIds: new Set((toolsResult.data ?? []).filter((tool) => tool.status !== "available").map((tool) => tool.id)),
      reservations: (reservationsResult.data ?? []).map((reservation) => ({ toolId: reservation.tool_id, startsAt: reservation.starts_at, endsAt: reservation.ends_at })),
      lockedOperationIds: new Set((runsResult.data ?? []).filter((run) => run.planned_operation_id && ["running", "completed", "awaiting_review"].includes(run.status)).map((run) => run.planned_operation_id!)),
      rootOperationId: sourceRun.data?.planned_operation_id ?? (typeof requestedChange.operationId === "string" ? requestedChange.operationId : null),
      notBefore: sourceRun.data?.completed_at ?? (typeof requestedChange.notBefore === "string" ? requestedChange.notBefore : null),
      delayMinutes: typeof requestedChange.delayMinutes === "number" ? requestedChange.delayMinutes : 0,
      windowStartsAt: draft.planning_starts_at,
      windowEndsAt: draft.planning_ends_at
    });
    const { data, error } = await supabase.rpc("store_plan_adjustment_proposal", {
      target_request_id: request.id,
      expected_draft_version: draft.row_version,
      moved_operations: proposal.moves as unknown as Json,
      unresolved_conflicts: proposal.conflicts as unknown as Json,
      scheduler_version: SCHEDULER_VERSION
    });
    return error ? fail(error.message) : ok(data);
  } catch (error) { return fail(toErrorMessage(error)); }
}

export async function applyPlanAdjustmentProposal(input: unknown) {
  try {
    await requireAccount();
    const value = applyProposalSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("apply_plan_adjustment_proposal", {
      target_proposal_id: value.proposalId,
      mutation_id: value.mutationId
    });
    return error ? fail(error.message) : ok(data);
  } catch (error) { return fail(toErrorMessage(error)); }
}
