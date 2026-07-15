"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { assertProjectAccess, requireAccount, requireProcessManager } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  draftProcessStepArchiveSchema,
  draftProcessStepReorderSchema,
  draftProcessStepReviewerSchema,
  orderedDraftProcessStepCreateSchema,
  processFlowStepCreateSchema,
  processFlowWaferDeleteSchema,
  processFlowWaferCreateSchema,
  publishedProcessStepReviewerRecoverySchema,
  processAssignmentSchema,
  processStepDeleteSchema,
  processStepCreateSchema,
  processStepNodeTypeUpdateSchema,
  processStepCheckpointReviewerSchema,
  processStepPositionsUpdateSchema,
  processStepPositionUpdateSchema,
  processStepTransitionCreateSchema,
  processStepTransitionDeleteSchema,
  processTemplateDeleteSchema,
  processTemplateDuplicateSchema,
  processTemplateNameUpdateSchema,
  processTemplatePublishSchema,
  processTemplateCreateSchema,
  processStepNameUpdateSchema
} from "@/features/process-flows/schemas";
import { normalizeWaferCode } from "@/features/process-flows/waferNaming";
import {
  getWaferFamilyDeleteIds,
  isLegacyDeletedWaferFamily
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
  revalidatePath("/wireframe/dashboard");
  revalidatePath("/wireframe/process-flow");
  revalidatePath("/wireframe/wafer-status");
  revalidatePath("/wireframe/calendar");
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
        .contains("metadata", { parent_wafer_id: existingWafer.id });

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
      .select("id, template_id, wafer_id, wafers(*)")
      .eq("id", parsed.assignmentId)
      .is("deleted_at", null)
      .single();

    if (assignmentError) {
      return fail(assignmentError.message);
    }

    const wafer = Array.isArray(assignment.wafers) ? assignment.wafers[0] : assignment.wafers;
    if (!wafer) {
      return fail("The selected wafer no longer exists.");
    }

    await assertProjectAccess(wafer.project_id, "write");

    const adminSupabase = createSupabaseAdminClient();
    const waferMetadata = wafer.metadata && typeof wafer.metadata === "object" && !Array.isArray(wafer.metadata)
      ? wafer.metadata as Record<string, Json | undefined>
      : {};
    const parentWaferId = typeof waferMetadata.parent_wafer_id === "string"
      ? waferMetadata.parent_wafer_id
      : null;
    const familyRootId = parentWaferId ?? wafer.id;
    const { data: discoveredChildren, error: childLookupError } = await adminSupabase
      .from("wafers")
      .select("id")
      .eq("project_id", wafer.project_id)
      .is("deleted_at", null)
      .contains("metadata", { parent_wafer_id: familyRootId });

    if (childLookupError) {
      return fail(childLookupError.message);
    }

    const deleteIds = getWaferFamilyDeleteIds(
      wafer.id,
      wafer.metadata,
      (discoveredChildren ?? []).map((child) => child.id)
    );
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

export async function duplicateProcessTemplateVersion(input: unknown) {
  try {
    await requireProcessManager();
    const parsed = processTemplateDuplicateSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("duplicate_process_template_version", {
      source_template_id: parsed.templateId,
      next_version: parsed.version,
      next_name: parsed.name ?? null
    });

    if (error) {
      return fail(error.message);
    }

    revalidateProcessFlow(data.id);
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function publishProcessTemplateVersion(input: unknown) {
  try {
    await requireProcessManager();
    const parsed = processTemplatePublishSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("publish_process_template_version", {
      target_template_id: parsed.templateId
    });

    if (error) {
      return fail(error.message);
    }

    revalidateProcessFlow(data.id);
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function createOrderedDraftProcessStep(input: unknown) {
  try {
    const parsed = orderedDraftProcessStepCreateSchema.parse(input);
    await getTemplateForWrite(parsed.templateId);
    const slug = await getAvailableStepSlug(parsed.templateId, parsed.name);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("create_ordered_draft_process_step", {
      target_template_id: parsed.templateId,
      target_position: parsed.position,
      step_name: parsed.name,
      step_slug: slug,
      step_process_area: parsed.processArea,
      reviewer_id: parsed.requiredReviewerId ?? null,
      step_expected_duration_minutes: parsed.expectedDurationMinutes ?? null,
      step_queue_target_minutes: parsed.queueTargetMinutes ?? null,
      step_required_tool_type: parsed.requiredToolType ?? null,
      step_requires_recipe: parsed.requiresRecipe,
      step_instructions: parsed.instructions ?? null,
      step_parameters_schema: parsed.parametersSchema as Json,
      step_canvas_x: parsed.canvasX ?? null,
      step_canvas_y: parsed.canvasY ?? null
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

export async function reorderDraftProcessStep(input: unknown) {
  try {
    const parsed = draftProcessStepReorderSchema.parse(input);
    const step = await getStepForWrite(parsed.stepId);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("normalize_draft_process_step_order", {
      target_template_id: step.template_id,
      moved_step_id: step.id,
      target_position: parsed.position
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

export async function archiveDraftProcessStep(input: unknown) {
  try {
    const parsed = draftProcessStepArchiveSchema.parse(input);
    const step = await getStepForWrite(parsed.stepId);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("archive_draft_process_step", {
      target_step_id: parsed.stepId
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

export async function updateDraftProcessStepReviewer(input: unknown) {
  try {
    const parsed = draftProcessStepReviewerSchema.parse(input);
    const step = await getStepForWrite(parsed.stepId);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("assign_draft_process_step_reviewer", {
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

export async function reassignUnavailableCheckpointReviewer(input: unknown) {
  try {
    await requireProcessManager();
    const parsed = publishedProcessStepReviewerRecoverySchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("reassign_unavailable_checkpoint_reviewer", {
      target_step_id: parsed.stepId,
      replacement_reviewer_id: parsed.reviewerId,
      mutation_id: parsed.mutationId,
      reason: parsed.reason
    });

    if (error) {
      return fail(error.message);
    }

    revalidateProcessFlow(data.template_id);
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

    const { data: updatedSteps, error: positionsError } = await supabase.rpc(
      "update_process_step_positions_versioned",
      { position_updates: parsed.positions as Json }
    );

    if (positionsError) {
      return fail(positionsError.message);
    }

    for (const templateId of templateIds) {
      revalidateProcessFlow(templateId);
    }

    return ok({ updated: parsed.positions.length, steps: updatedSteps });
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

    const { data: template, error: templateError } = await supabase
      .from("process_templates")
      .select("id, lifecycle_status")
      .eq("id", parsed.templateId)
      .single();

    if (templateError) {
      return fail(templateError.message);
    }

    if (template.lifecycle_status !== "published") {
      return fail("Only published process versions can be assigned to wafers.");
    }

    const { data: steps, error: stepsError } = await supabase
      .from("process_steps")
      .select("*")
      .eq("template_id", parsed.templateId)
      .is("archived_at", null)
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
        current_step_id: steps[0].id,
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
