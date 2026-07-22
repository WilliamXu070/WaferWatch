"use server";

import { fail, ok } from "@/lib/action-result";
import { requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import {
  completeOperationRunSchema,
  reviewOperationRunMembersSchema,
  startOperationRunSchema,
  submitOperationRunSchema
} from "./schemas";

export async function startOperationRun(input: unknown) {
  try {
    await requireAccount();
    const value = startOperationRunSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("start_operation_run", {
      process_step_id: value.processStepId,
      planned_operation_id: value.plannedOperationId ?? null,
      assignment_ids: value.assignmentIds,
      expected_assignment_revisions: value.expectedAssignmentRevisions as Json,
      run_kind: value.runKind,
      source_run_ids: value.sourceRunIds,
      reason: value.reason ?? null,
      mutation_id: value.mutationId
    });
    return error ? fail(error.message) : ok(data);
  } catch (error) { return fail(toErrorMessage(error)); }
}

export async function completeOperationRun(input: unknown) {
  try {
    await requireAccount();
    const value = completeOperationRunSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("complete_operation_run", {
      run_id: value.runId,
      expected_revision: value.expectedRevision,
      member_results: value.memberResults as unknown as Json,
      parameters: value.parameters as unknown as Json,
      resources: value.resources as unknown as Json,
      notes: value.notes as unknown as Json,
      mutation_id: value.mutationId
    });
    return error ? fail(error.message) : ok(data);
  } catch (error) { return fail(toErrorMessage(error)); }
}

export async function submitOperationRun(input: unknown) {
  try {
    await requireAccount();
    const value = submitOperationRunSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("submit_operation_run", {
      run_id: value.runId,
      expected_revision: value.expectedRevision,
      mutation_id: value.mutationId
    });
    return error ? fail(error.message) : ok(data);
  } catch (error) { return fail(toErrorMessage(error)); }
}

export async function reviewOperationRunMembers(input: unknown) {
  try {
    await requireAccount();
    const value = reviewOperationRunMembersSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("review_operation_run_members", {
      run_id: value.runId,
      decisions: value.decisions as unknown as Json,
      expected_member_revisions: value.expectedMemberRevisions as Json,
      mutation_id: value.mutationId
    });
    return error ? fail(error.message) : ok(data);
  } catch (error) { return fail(toErrorMessage(error)); }
}
