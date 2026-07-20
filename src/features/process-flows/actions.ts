"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { assertProjectAccess, requireAccount, requireProcessManager } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  processFlowArchiveRestoreSchema,
  processFlowArchiveSchema,
  processFlowStepCreateSchema,
  processFlowWaferDeleteSchema,
  processFlowWaferCreateSchema,
  processStepDeleteSchema,
  processStepExecutionModeUpdateSchema,
  processStepCheckpointReviewerSchema,
  processStepPositionsUpdateSchema,
  processStepTransitionCreateSchema,
  processStepTransitionDeleteSchema,
  processTemplateDeleteSchema,
  processTemplateNameUpdateSchema,
  processTemplateCreateSchema,
  processStepNameUpdateSchema,
  processStepParametersUpdateSchema,
  stepParameterRecordSaveSchema,
  stepParameterRecordsBatchSaveSchema,
  waferStatusStepParameterRecordSaveSchema
} from "@/features/process-flows/schemas";
import {
  mergeStepParameterDefinitions,
  readStepParameterDefinitions,
  writeStepParameterDefinitions,
  type StepParameterDefinition
} from "@/features/process-flows/stepParameters";
import { normalizeWaferCode } from "@/features/process-flows/waferNaming";
import {
  getWaferFamilyDeleteIds,
  isLegacyDeletedWaferFamily,
  keepExistingWaferFamilyDeleteIds
} from "@/features/process-flows/waferDeletion";
import type { Json, ProcessStep } from "@/types/database";

type ProcessTemplateWriteContext = {
  id: string;
  owner_project_id: string | null;
  lifecycle_status: "draft" | "published";
};

const DEFAULT_PROCESS_FLOW_STEPS = [
  {
    step_order: 10,
    name: "Process start",
    slug: "process-start",
    process_area: "start",
    node_type: "start" as const,
    canvas_x: 520,
    canvas_y: 120
  },
  {
    step_order: 20,
    name: "Process step",
    slug: "process-step",
    process_area: "process",
    node_type: "procedure" as const,
    canvas_x: 520,
    canvas_y: 360
  },
  {
    step_order: 30,
    name: "Process complete",
    slug: "process-complete",
    process_area: "complete",
    node_type: "end" as const,
    canvas_x: 520,
    canvas_y: 600
  }
] as const;

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
    .select("id, owner_project_id, lifecycle_status")
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

async function getDefaultOwnerProjectId(accountId: string) {
  const supabase = await createServerSupabaseClient();
  const activeTemplateResult = await supabase
    .from("process_templates")
    .select("owner_project_id")
    .not("owner_project_id", "is", null)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeTemplateResult.error) {
    throw activeTemplateResult.error;
  }

  if (activeTemplateResult.data?.owner_project_id) {
    await assertProjectAccess(activeTemplateResult.data.owner_project_id, "write");
    return activeTemplateResult.data.owner_project_id;
  }

  const memberProjectResult = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", accountId)
    .in("role", ["owner", "editor"])
    .limit(1)
    .maybeSingle();

  if (memberProjectResult.error) {
    throw memberProjectResult.error;
  }

  if (memberProjectResult.data?.project_id) {
    await assertProjectAccess(memberProjectResult.data.project_id, "write");
    return memberProjectResult.data.project_id;
  }

  const ownedProjectResult = await supabase
    .from("projects")
    .select("id")
    .eq("owner_id", accountId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ownedProjectResult.error) {
    throw ownedProjectResult.error;
  }

  return ownedProjectResult.data?.id ?? null;
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
  revalidatePath("/dashboard");
  revalidatePath("/process-flow");
  revalidatePath("/wafer-status");
  revalidatePath("/calendar");
  revalidatePath(`/processes/${templateId}`);
}

async function rollbackIncompleteWaferCreate(waferId: string) {
  const adminSupabase = createSupabaseAdminClient();
  const { error } = await adminSupabase
    .from("wafers")
    .delete()
    .eq("id", waferId);

  return error?.message ?? null;
}

function appendRollbackError(message: string, rollbackError: string | null) {
  return rollbackError ? `${message} Cleanup also failed: ${rollbackError}` : message;
}

async function deleteWaferFamilyRecords({
  adminSupabase,
  deleteIds,
  projectId
}: {
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>;
  deleteIds: string[];
  projectId: string;
}) {
  const uniqueDeleteIds = Array.from(new Set(deleteIds));
  const [attachmentsResult, inspectionsResult] = await Promise.all([
    adminSupabase
      .from("attachments")
      .select("bucket_name, object_path")
      .eq("project_id", projectId)
      .in("wafer_id", uniqueDeleteIds),
    adminSupabase
      .from("die_inspections")
      .select("image_bucket, image_path")
      .eq("project_id", projectId)
      .in("wafer_id", uniqueDeleteIds)
  ]);

  if (attachmentsResult.error) {
    throw attachmentsResult.error;
  }
  if (inspectionsResult.error) {
    throw inspectionsResult.error;
  }

  const storagePathsByBucket = new Map<string, Set<string>>();
  const addStoragePath = (bucket: string, path: string) => {
    const paths = storagePathsByBucket.get(bucket) ?? new Set<string>();
    paths.add(path);
    storagePathsByBucket.set(bucket, paths);
  };
  (attachmentsResult.data ?? []).forEach((attachment) => {
    addStoragePath(attachment.bucket_name, attachment.object_path);
  });
  (inspectionsResult.data ?? []).forEach((inspection) => {
    addStoragePath(inspection.image_bucket, inspection.image_path);
  });

  for (const [bucket, paths] of storagePathsByBucket) {
    const { error } = await adminSupabase.storage.from(bucket).remove([...paths]);
    if (error) {
      throw error;
    }
  }

  for (const waferId of uniqueDeleteIds) {
    const { error } = await adminSupabase
      .from("text_surfaces")
      .delete()
      .eq("project_id", projectId)
      .like("scope_key", `${waferId}:%`);

    if (error) {
      throw error;
    }
  }

  const { data, error } = await adminSupabase
    .from("wafers")
    .delete()
    .eq("project_id", projectId)
    .in("id", uniqueDeleteIds)
    .select("id");

  if (error) {
    throw error;
  }

  return (data ?? []).map((wafer) => wafer.id);
}

function getMetadataRecord(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function deriveWaferFamily(waferCode: string) {
  const leading = waferCode.trim().toUpperCase().match(/^[A-Z]+/)?.[0];
  return leading || waferCode.trim().toUpperCase() || "WAFER";
}

async function getTemplateProjectForWaferCreate(templateId: string) {
  const account = await requireAccount();
  const supabase = await createServerSupabaseClient();
  const { data: template, error: templateError } = await supabase
    .from("process_templates")
    .select("id, owner_project_id, lifecycle_status")
    .eq("id", templateId)
    .single();

  if (templateError) {
    throw templateError;
  }

  if (template.lifecycle_status !== "published") {
    throw new Error("Only published process versions can receive wafers.");
  }

  if (template.owner_project_id) {
    await assertProjectAccess(template.owner_project_id, "write");
    return { account, projectId: template.owner_project_id };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (projectError) {
    throw projectError;
  }

  if (project?.id) {
    await assertProjectAccess(project.id, "write");
    return { account, projectId: project.id };
  }

  const slug = `waferwatch-${account.userId.slice(0, 8)}`;
  const { data: createdProject, error: createProjectError } = await supabase
    .from("projects")
    .insert({
      slug,
      name: "WaferWatch Workspace",
      owner_id: account.userId,
      visibility: "private",
      status: "active"
    })
    .select("id")
    .single();

  if (createProjectError) {
    throw createProjectError;
  }

  return { account, projectId: createdProject.id };
}

export async function createWaferAtProcessStart(input: unknown) {
  try {
    const parsed = processFlowWaferCreateSchema.parse(input);
    const { account, projectId } = await getTemplateProjectForWaferCreate(parsed.templateId);
    const supabase = await createServerSupabaseClient();

    const { data: steps, error: stepsError } = await supabase
      .from("process_steps")
      .select("*")
      .eq("template_id", parsed.templateId)
      .is("archived_at", null)
      .order("step_order", { ascending: true });

    if (stepsError) {
      return fail(stepsError.message);
    }

    const sortedSteps = steps ?? [];
    const startStep = sortedSteps[0];
    if (!startStep) {
      return fail("Create a start step before adding wafers.");
    }

    const { data: existingWafers, error: existingWafersError } = await supabase
      .from("wafers")
      .select("id, wafer_code, status, metadata, wafer_process_assignments(status)")
      .eq("project_id", projectId)
      .is("deleted_at", null);

    if (existingWafersError) {
      return fail(existingWafersError.message);
    }

    const waferCode = normalizeWaferCode(parsed.waferCode);
    const existingWafer = (existingWafers ?? []).find(
      (wafer) => normalizeWaferCode(wafer.wafer_code) === waferCode
    );
    if (existingWafer) {
      const adminSupabase = createSupabaseAdminClient();
      const { data: discoveredChildren, error: childLookupError } = await adminSupabase
        .from("wafers")
        .select("id")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .eq("parent_wafer_id", existingWafer.id);

      if (childLookupError) {
        return fail(childLookupError.message);
      }

      const discoveredChildIds = (discoveredChildren ?? []).map((child) => child.id);
      const assignments = Array.isArray(existingWafer.wafer_process_assignments)
        ? existingWafer.wafer_process_assignments
        : [];
      if (!isLegacyDeletedWaferFamily({
        assignmentStatuses: assignments.map((assignment) => assignment.status),
        discoveredChildIds,
        metadata: existingWafer.metadata,
        waferStatus: existingWafer.status
      })) {
        return fail(`A wafer named ${waferCode} already exists.`);
      }

      const deletedIds = await deleteWaferFamilyRecords({
        adminSupabase,
        deleteIds: getWaferFamilyDeleteIds(existingWafer.id, existingWafer.metadata, discoveredChildIds),
        projectId
      });
      if (!deletedIds.includes(existingWafer.id)) {
        return fail(`The deleted ${waferCode} wafer could not be cleared before recreation.`);
      }
    }
    const dieLabels = Array.from({ length: parsed.dieCount }, (_, index) => `${waferCode}_${index + 1}`);
    const now = new Date().toISOString();
    const { data: wafer, error: waferError } = await supabase
      .from("wafers")
      .insert({
        project_id: projectId,
        wafer_code: waferCode,
        status: "queued",
        material_stack: null,
        diameter_mm: null,
        notes: null,
        metadata: {
          created_by: account.userId,
          created_from: "process_flow_add_wafer",
          wafer_family: deriveWaferFamily(waferCode),
          wafer_display_mode: "undiced",
          die_count: parsed.dieCount,
          die_labels: dieLabels
        }
      })
      .select("*")
      .single();

    if (waferError) {
      return fail(waferError.message);
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from("wafer_process_assignments")
      .insert({
        wafer_id: wafer.id,
        template_id: parsed.templateId,
        current_step_id: startStep.id,
        assigned_by: account.userId,
        status: "queued",
        assigned_at: now,
        started_at: null,
        completed_at: null
      })
      .select("*")
      .single();

    if (assignmentError) {
      const rollbackError = await rollbackIncompleteWaferCreate(wafer.id);
      return fail(appendRollbackError(assignmentError.message, rollbackError));
    }

    const executionRows = sortedSteps.map((step, index) => ({
      assignment_id: assignment.id,
      wafer_id: wafer.id,
      process_step_id: step.id,
      status: index === 0 ? "queued" : "pending",
      queue_started_at: index === 0 ? now : null,
      metadata: {}
    }));
    const { error: executionsError } = await supabase.from("step_executions").insert(executionRows);

    if (executionsError) {
      const rollbackError = await rollbackIncompleteWaferCreate(wafer.id);
      return fail(appendRollbackError(executionsError.message, rollbackError));
    }

    await supabase.from("process_events").insert({
      project_id: projectId,
      wafer_id: wafer.id,
      actor_id: account.userId,
      event_type: "wafer_created",
      notes: "Created from Process Flow.",
      metadata: {
        assignment_id: assignment.id,
        start_step_id: startStep.id,
        die_count: parsed.dieCount,
        die_labels: dieLabels,
        wafer_metadata: getMetadataRecord(wafer.metadata as Json)
      }
    });

    revalidateProcessFlow(parsed.templateId);
    return ok({ wafer, assignment });
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function deleteProcessFlowWafer(input: unknown) {
  try {
    await requireAccount();
    const parsed = processFlowWaferDeleteSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data: assignment, error: assignmentError } = await supabase
      .from("wafer_process_assignments")
      .select("id, template_id, wafer_id, deleted_at, wafers(*)")
      .eq("id", parsed.assignmentId)
      .maybeSingle();

    if (assignmentError) {
      return fail(assignmentError.message);
    }
    if (!assignment) {
      return ok({ deleted: null, deletedWaferIds: [], alreadyDeleted: true });
    }

    const wafer = Array.isArray(assignment.wafers) ? assignment.wafers[0] : assignment.wafers;
    if (!wafer) {
      return fail("The selected wafer no longer exists.");
    }

    if (assignment.deleted_at || wafer.deleted_at) {
      revalidateProcessFlow(assignment.template_id);
      return ok({
        deleted: assignment.wafer_id,
        deletedWaferIds: [assignment.wafer_id],
        alreadyDeleted: true
      });
    }

    await assertProjectAccess(wafer.project_id, "write");

    const adminSupabase = createSupabaseAdminClient();
    const waferMetadata = wafer.metadata && typeof wafer.metadata === "object" && !Array.isArray(wafer.metadata)
      ? wafer.metadata as Record<string, Json | undefined>
      : {};
    const parentWaferId = wafer.parent_wafer_id ?? (
      typeof waferMetadata.parent_wafer_id === "string" ? waferMetadata.parent_wafer_id : null
    );
    const familyRootId = parentWaferId ?? wafer.id;
    const { data: discoveredChildren, error: childLookupError } = await adminSupabase
      .from("wafers")
      .select("id")
      .eq("project_id", wafer.project_id)
      .is("deleted_at", null)
      .eq("parent_wafer_id", familyRootId);

    if (childLookupError) {
      return fail(childLookupError.message);
    }

    const candidateDeleteIds = getWaferFamilyDeleteIds(
      wafer.id,
      wafer.metadata,
      (discoveredChildren ?? []).map((child) => child.id)
    );
    const { data: existingDeleteRows, error: existingDeleteError } = await adminSupabase
      .from("wafers")
      .select("id")
      .eq("project_id", wafer.project_id)
      .is("deleted_at", null)
      .in("id", candidateDeleteIds);

    if (existingDeleteError) {
      return fail(existingDeleteError.message);
    }

    const deleteIds = keepExistingWaferFamilyDeleteIds(
      candidateDeleteIds,
      (existingDeleteRows ?? []).map((candidate) => candidate.id)
    );
    if (!deleteIds.includes(wafer.id)) {
      revalidateProcessFlow(assignment.template_id);
      return ok({
        deleted: assignment.wafer_id,
        deletedWaferIds: [assignment.wafer_id],
        alreadyDeleted: true
      });
    }
    const { data: deletedRows, error: deleteError } = await supabase.rpc(
      "soft_delete_process_flow_wafer_family",
      {
        target_project_id: wafer.project_id,
        target_wafer_ids: deleteIds
      }
    );
    if (deleteError) {
      return fail(deleteError.message);
    }

    const deletedIds = (deletedRows ?? []).map((row) => row.wafer_id);
    if (!deletedIds.includes(assignment.wafer_id)) {
      return fail("The selected wafer was not deleted from the active process.");
    }

    revalidateProcessFlow(assignment.template_id);
    return ok({
      deleted: assignment.wafer_id,
      deletedWaferIds: deletedIds
    });
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function archiveCompletedProcessWafers(input: unknown) {
  try {
    await requireAccount();
    const parsed = processFlowArchiveSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("archive_completed_wafer_assignments", {
      target_assignment_ids: parsed.items.map((item) => item.assignmentId),
      mutation_ids: parsed.items.map((item) => item.mutationId)
    });

    if (error) {
      return fail(error.message);
    }
    if ((data ?? []).length !== parsed.items.length) {
      return fail("One or more completed wafers were not archived.");
    }

    revalidateProcessFlow(parsed.templateId);
    return ok({ archived: data ?? [] });
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function restoreArchivedProcessWafer(input: unknown) {
  try {
    await requireAccount();
    const parsed = processFlowArchiveRestoreSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("restore_archived_wafer_to_step", {
      target_wafer_id: parsed.waferId,
      archived_assignment_id: parsed.archivedAssignmentId,
      target_step_id: parsed.targetStepId,
      mutation_id: parsed.mutationId
    });

    if (error) {
      return fail(error.message);
    }

    revalidateProcessFlow(parsed.templateId);
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function createProcessTemplate(input: unknown) {
  try {
    const account = await requireProcessManager();
    const parsed = processTemplateCreateSchema.parse(input);
    const ownerProjectId = parsed.ownerProjectId ?? (await getDefaultOwnerProjectId(account.userId));

    if (ownerProjectId) {
      await assertProjectAccess(ownerProjectId, "write");
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("process_templates")
      .insert({
        name: parsed.name,
        version: parsed.version,
        description: parsed.description ?? null,
        owner_project_id: ownerProjectId,
        is_active: parsed.isActive,
        lifecycle_status: "draft",
        created_by: account.userId
      })
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    const { data: steps, error: stepsError } = await supabase
      .from("process_steps")
      .insert(
        DEFAULT_PROCESS_FLOW_STEPS.map((step) => ({
          template_id: data.id,
          step_order: step.step_order,
          name: step.name,
          slug: step.slug,
          process_area: step.process_area,
          expected_duration_minutes: 60,
          queue_target_minutes: null,
          required_tool_type: null,
          requires_recipe: false,
          instructions: null,
          parameters_schema: {},
          node_type: step.node_type,
          canvas_x: step.canvas_x,
          canvas_y: step.canvas_y
        }))
      )
      .select("id, step_order");

    if (stepsError) {
      await supabase.from("process_templates").delete().eq("id", data.id);
      return fail(stepsError.message);
    }

    const orderedSteps = [...(steps ?? [])].sort((a, b) => a.step_order - b.step_order);
    const transitions = orderedSteps.slice(0, -1).map((step, index) => ({
      template_id: data.id,
      from_step_id: step.id,
      to_step_id: orderedSteps[index + 1]?.id,
      edge_type: "flow" as const,
      label: null,
      condition: {},
      priority: index
    })).filter((transition) => Boolean(transition.to_step_id));

    if (transitions.length) {
      const { error: transitionsError } = await supabase
        .from("process_step_transitions")
        .insert(transitions);

      if (transitionsError) {
        await supabase.from("process_templates").delete().eq("id", data.id);
        return fail(transitionsError.message);
      }
    }

    revalidatePath("/", "layout");
    revalidateProcessFlow(data.id);
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function updateProcessStepCheckpointReviewer(input: unknown) {
  try {
    const parsed = processStepCheckpointReviewerSchema.parse(input);
    const step = await getStepForWrite(parsed.stepId);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("assign_process_step_checkpoint_reviewer", {
      target_step_id: parsed.stepId,
      reviewer_id: parsed.reviewerId
    });

    if (error) {
      return fail(error.message);
    }

    revalidateProcessFlow(step.template_id);
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

export async function deleteProcessTemplate(input: unknown) {
  try {
    const parsed = processTemplateDeleteSchema.parse(input);
    const template = await getTemplateForWrite(parsed.templateId);
    const adminSupabase = createSupabaseAdminClient();

    const { error: assignmentsError } = await adminSupabase
      .from("wafer_process_assignments")
      .delete()
      .eq("template_id", parsed.templateId);

    if (assignmentsError) {
      return fail(assignmentsError.message);
    }

    const { error: templateError } = await adminSupabase
      .from("process_templates")
      .delete()
      .eq("id", parsed.templateId);

    if (templateError) {
      return fail(templateError.message);
    }

    revalidateProcessFlow(template.id);
    return ok({ deleted: parsed.templateId });
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

    const persistedStepById = new Map((steps ?? []).map((step) => [step.id, step]));
    const templateIds = Array.from(new Set((steps ?? []).map((step) => step.template_id)));
    await Promise.all(templateIds.map((templateId) => getTemplateForWrite(templateId)));

    const changedPositions = parsed.positions.filter((position) => {
      const step = persistedStepById.get(position.stepId);
      return step?.canvas_x !== position.canvasX || step?.canvas_y !== position.canvasY;
    });

    if (changedPositions.length === 0) {
      return ok({ updated: 0, steps: [] });
    }

    const { data: updatedSteps, error: positionsError } = await supabase.rpc(
      "update_process_step_positions_versioned",
      { position_updates: changedPositions as Json }
    );

    if (positionsError) {
      return fail(positionsError.message);
    }

    for (const templateId of templateIds) {
      revalidateProcessFlow(templateId);
    }

    return ok({ updated: changedPositions.length, steps: updatedSteps });
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function updateProcessStepExecutionMode(input: unknown) {
  try {
    const parsed = processStepExecutionModeUpdateSchema.parse(input);
    const step = await getStepForWrite(parsed.stepId);

    if (parsed.executionMode === "anytime" && step.node_type !== "procedure") {
      return fail("Only procedure steps can be made available anytime.");
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("process_steps")
      .update({ execution_mode: parsed.executionMode })
      .eq("id", parsed.stepId)
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    if (parsed.executionMode === "anytime") {
      const { error: transitionsError } = await supabase
        .from("process_step_transitions")
        .delete()
        .or(`from_step_id.eq.${parsed.stepId},to_step_id.eq.${parsed.stepId}`);

      if (transitionsError) {
        await supabase
          .from("process_steps")
          .update({ execution_mode: step.execution_mode })
          .eq("id", parsed.stepId);
        return fail(transitionsError.message);
      }
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
      .eq("name", parsed.expectedName)
      .select("*")
      .maybeSingle();

    if (error) {
      return fail(error.message);
    }

    if (!data) {
      return fail("This process step was renamed by another collaborator. The latest name has been loaded.");
    }

    revalidateProcessFlow(step.template_id);
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function updateProcessStepParameters(input: unknown) {
  try {
    const parsed = processStepParametersUpdateSchema.parse(input);
    const step = await getStepForWrite(parsed.stepId);
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("process_steps")
      .update({ parameters_schema: parsed.parametersSchema as Json })
      .eq("id", parsed.stepId)
      .eq("revision", parsed.expectedRevision)
      .select("*")
      .maybeSingle();

    if (error) {
      return fail(error.message);
    }

    if (!data) {
      return fail("This step was updated by another collaborator. Reload the page before saving again.");
    }

    revalidateProcessFlow(step.template_id);
    revalidatePath(`/process-flow/steps/${step.id}/parameters`);
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function saveStepParameterRecord(input: unknown) {
  try {
    const parsed = stepParameterRecordSaveSchema.parse(input);
    const account = await requireAccount();
    const supabase = await createServerSupabaseClient();
    const { data: movementEvent, error: movementError } = await supabase
      .from("process_events")
      .select("id, project_id, wafer_id, step_execution_id, metadata")
      .eq("client_mutation_id", parsed.movementMutationId)
      .maybeSingle();

    if (movementError) {
      return fail(movementError.message);
    }
    if (!movementEvent?.project_id || !movementEvent.wafer_id) {
      return fail("The movement event for these parameters could not be found.");
    }

    const eventMetadata = movementEvent.metadata && typeof movementEvent.metadata === "object" && !Array.isArray(movementEvent.metadata)
      ? movementEvent.metadata
      : {};
    if (
      eventMetadata.assignment_id !== parsed.assignmentId ||
      eventMetadata.target_step_id !== parsed.stepId
    ) {
      return fail("These parameters do not match the recorded wafer movement.");
    }

    await assertProjectAccess(movementEvent.project_id, "write");
    const [{ data: assignment, error: assignmentError }, { data: step, error: stepError }] = await Promise.all([
      supabase
        .from("wafer_process_assignments")
        .select("id, wafer_id, template_id")
        .eq("id", parsed.assignmentId)
        .single(),
      supabase
        .from("process_steps")
        .select("id, template_id, parameters_schema, revision")
        .eq("id", parsed.stepId)
        .single()
    ]);

    if (assignmentError) return fail(assignmentError.message);
    if (stepError) return fail(stepError.message);
    if (
      assignment.wafer_id !== movementEvent.wafer_id ||
      assignment.template_id !== step.template_id
    ) {
      return fail("The destination step is not part of this wafer process.");
    }

    const globalAdditions = parsed.localParameters.filter((parameter) => parameter.scope === "global");
    let schemaSnapshot = step.parameters_schema;
    if (globalAdditions.length > 0) {
      await requireProcessManager();
      const definitions: StepParameterDefinition[] = globalAdditions.map((parameter) => ({
        id: parameter.id,
        key: parameter.key,
        label: parameter.label,
        type: parameter.type,
        unit: parameter.unit,
        required: false,
        description: "",
        defaultValue: null
      }));
      const nextSchema = mergeStepParameterDefinitions(step.parameters_schema, definitions);
      const { data: updatedStep, error: updateStepError } = await supabase
        .from("process_steps")
        .update({ parameters_schema: nextSchema as Json })
        .eq("id", step.id)
        .eq("revision", step.revision)
        .select("parameters_schema")
        .maybeSingle();

      if (updateStepError) return fail(updateStepError.message);
      if (!updatedStep) {
        return fail("The step template changed while these parameters were open. Reload and try again.");
      }
      schemaSnapshot = updatedStep.parameters_schema;
    }

    const allowedGlobalKeys = new Set(readStepParameterDefinitions(schemaSnapshot).map((field) => field.key));
    const combinedGlobalValues = {
      ...Object.fromEntries(
        Object.entries(parsed.globalValues).filter(([key]) => allowedGlobalKeys.has(key))
      ),
      ...Object.fromEntries(
        globalAdditions.map((parameter) => [parameter.key, parameter.value])
      )
    };
    const localParameters = parsed.localParameters.filter((parameter) => parameter.scope === "local");
    const { data: record, error: recordError } = await supabase
      .from("step_parameter_records")
      .upsert({
        project_id: movementEvent.project_id,
        wafer_id: movementEvent.wafer_id,
        assignment_id: assignment.id,
        process_step_id: step.id,
        step_execution_id: movementEvent.step_execution_id,
        process_event_id: movementEvent.id,
        movement_mutation_id: parsed.movementMutationId,
        schema_snapshot: schemaSnapshot,
        global_values: combinedGlobalValues as Json,
        local_parameters: localParameters as Json,
        notes: parsed.notes,
        recorded_by: account.userId
      }, { onConflict: "movement_mutation_id" })
      .select("*")
      .single();

    if (recordError) {
      return fail(recordError.message);
    }

    revalidateProcessFlow(step.template_id);
    revalidatePath("/wafer-status");
    return ok(record);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function saveStepParameterRecordsBatch(input: unknown) {
  const startedAt = performance.now();
  try {
    const parsed = stepParameterRecordsBatchSaveSchema.parse(input);
    const authStartedAt = performance.now();
    await requireAccount();
    const authMs = performance.now() - authStartedAt;
    const supabase = await createServerSupabaseClient();
    const rpcStartedAt = performance.now();
    const { data, error } = await supabase.rpc("save_step_parameter_records_batch", {
      entries: parsed.entries.map((entry) => ({
        assignment_id: entry.assignmentId,
        step_id: entry.stepId,
        movement_mutation_id: entry.movementMutationId
      })) as Json,
      global_values: parsed.globalValues as Json,
      local_parameters: parsed.localParameters as Json,
      notes: parsed.notes
    });

    if (error) return fail(error.message);

    console.info("[ProcessFlowPerf]", JSON.stringify({
      action: "parameter_batch",
      recordCount: parsed.entries.length,
      authMs: Math.round(authMs),
      rpcMs: Math.round(performance.now() - rpcStartedAt),
      totalMs: Math.round(performance.now() - startedAt)
    }));
    return ok((data ?? []) as unknown as import("@/types/database").StepParameterRecord[]);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function saveWaferStatusStepParameterRecord(input: unknown) {
  try {
    const parsed = waferStatusStepParameterRecordSaveSchema.parse(input);
    const account = await requireAccount();
    await assertProjectAccess(parsed.projectId, "write");
    const supabase = await createServerSupabaseClient();

    const [{ data: wafer, error: waferError }, { data: step, error: stepError }] = await Promise.all([
      supabase
        .from("wafers")
        .select("id, project_id")
        .eq("id", parsed.waferId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("process_steps")
        .select("id, template_id, parameters_schema")
        .eq("id", parsed.stepId)
        .maybeSingle()
    ]);

    if (waferError) return fail(waferError.message);
    if (stepError) return fail(stepError.message);
    if (!wafer || wafer.project_id !== parsed.projectId) {
      return fail("This wafer is no longer available in the selected project.");
    }
    if (!step) {
      return fail("This process step is no longer available.");
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from("wafer_process_assignments")
      .select("id, template_id")
      .eq("wafer_id", parsed.waferId)
      .eq("template_id", step.template_id)
      .is("deleted_at", null)
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assignmentError) return fail(assignmentError.message);
    if (!assignment) {
      return fail("The process assignment for this step could not be found.");
    }

    let stepExecutionId = parsed.stepExecutionId;
    if (stepExecutionId) {
      const { data: execution, error: executionError } = await supabase
        .from("step_executions")
        .select("id")
        .eq("id", stepExecutionId)
        .eq("assignment_id", assignment.id)
        .eq("wafer_id", parsed.waferId)
        .eq("process_step_id", parsed.stepId)
        .maybeSingle();
      if (executionError) return fail(executionError.message);
      if (!execution) return fail("This recorded step visit has changed. Reload and try again.");
    } else {
      const { data: execution, error: executionError } = await supabase
        .from("step_executions")
        .select("id")
        .eq("assignment_id", assignment.id)
        .eq("wafer_id", parsed.waferId)
        .eq("process_step_id", parsed.stepId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (executionError) return fail(executionError.message);
      stepExecutionId = execution?.id ?? null;
    }

    let existingRecord: {
      id: string;
      revision: number;
      schema_snapshot: Json;
      process_event_id: string;
      movement_mutation_id: string;
    } | null = null;

    if (parsed.recordId) {
      const { data, error } = await supabase
        .from("step_parameter_records")
        .select("id, revision, schema_snapshot, process_event_id, movement_mutation_id")
        .eq("id", parsed.recordId)
        .eq("project_id", parsed.projectId)
        .eq("wafer_id", parsed.waferId)
        .eq("assignment_id", assignment.id)
        .eq("process_step_id", parsed.stepId)
        .maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail("This parameter entry was removed by another collaborator.");
      existingRecord = data;
    }

    const baseSchema = existingRecord?.schema_snapshot ?? step.parameters_schema;
    const existingDefinitions = new Map(
      readStepParameterDefinitions(baseSchema).map((definition) => [definition.key, definition])
    );
    const globalParameters = parsed.parameters.filter((parameter) => parameter.scope === "global");
    const localParameters = parsed.parameters.filter((parameter) => parameter.scope === "local");
    const nextDefinitions: StepParameterDefinition[] = globalParameters.map((parameter) => {
      const existing = existingDefinitions.get(parameter.key);
      return {
        id: parameter.id,
        key: parameter.key,
        label: parameter.label,
        type: parameter.type,
        unit: parameter.unit,
        required: existing?.required ?? false,
        description: existing?.description ?? "",
        defaultValue: existing?.defaultValue ?? null
      };
    });
    const schemaSnapshot = {
      ...writeStepParameterDefinitions(baseSchema, nextDefinitions),
      recordNotes: Object.fromEntries(
        globalParameters
          .filter((parameter) => parameter.notes)
          .map((parameter) => [parameter.key, parameter.notes])
      )
    };
    const globalValues = Object.fromEntries(
      globalParameters.map((parameter) => [parameter.key, parameter.value])
    );

    if (existingRecord) {
      const { data: updated, error: updateError } = await supabase
        .from("step_parameter_records")
        .update({
          schema_snapshot: schemaSnapshot as Json,
          global_values: globalValues as Json,
          local_parameters: localParameters as Json,
          notes: parsed.notes,
          recorded_by: account.userId
        })
        .eq("id", existingRecord.id)
        .eq("revision", parsed.expectedRevision ?? existingRecord.revision)
        .select("*")
        .maybeSingle();

      if (updateError) return fail(updateError.message);
      if (!updated) {
        return fail("These parameters changed in another session. Reload before saving again.");
      }

      revalidateProcessFlow(step.template_id);
      revalidatePath("/wafer-status");
      return ok(updated);
    }

    const movementMutationId = crypto.randomUUID();
    const { data: processEvent, error: processEventError } = await supabase
      .from("process_events")
      .insert({
        project_id: parsed.projectId,
        wafer_id: parsed.waferId,
        step_execution_id: stepExecutionId,
        actor_id: account.userId,
        event_type: "step_parameters_recorded",
        metadata: {
          assignment_id: assignment.id,
          target_step_id: parsed.stepId
        },
        client_mutation_id: movementMutationId
      })
      .select("id")
      .single();

    if (processEventError) return fail(processEventError.message);

    const { data: created, error: createError } = await supabase
      .from("step_parameter_records")
      .insert({
        project_id: parsed.projectId,
        wafer_id: parsed.waferId,
        assignment_id: assignment.id,
        process_step_id: parsed.stepId,
        step_execution_id: stepExecutionId,
        process_event_id: processEvent.id,
        movement_mutation_id: movementMutationId,
        schema_snapshot: schemaSnapshot as Json,
        global_values: globalValues as Json,
        local_parameters: localParameters as Json,
        notes: parsed.notes,
        recorded_by: account.userId
      })
      .select("*")
      .single();

    if (createError) return fail(createError.message);

    revalidateProcessFlow(step.template_id);
    revalidatePath("/wafer-status");
    return ok(created);
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

    for (const step of steps ?? []) {
      const { error: calendarEventsUpdateError } = await adminSupabase
        .from("process_calendar_events")
        .update({
          process_step_id: null,
          process_step_name_snapshot: step.name
        })
        .eq("process_step_id", step.id);

      if (calendarEventsUpdateError) {
        return fail(calendarEventsUpdateError.message);
      }
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
