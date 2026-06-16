"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { assertProjectAccess, requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  attachmentCreateSchema,
  measurementCreateSchema,
  processIssueCreateSchema
} from "@/features/measurements/schemas";
import type { Json } from "@/types/database";

export async function addMeasurement(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = measurementCreateSchema.parse(input);
    await assertProjectAccess(parsed.projectId, "write");

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("measurements")
      .insert({
        project_id: parsed.projectId,
        wafer_id: parsed.waferId,
        step_execution_id: parsed.stepExecutionId ?? null,
        measured_by: account.userId,
        measurement_type: parsed.measurementType,
        metric_name: parsed.metricName,
        metric_value: parsed.metricValue ?? null,
        metric_unit: parsed.metricUnit ?? null,
        measured_at: parsed.measuredAt ?? new Date().toISOString(),
        data: parsed.data as Json,
        file_path: parsed.filePath ?? null
      })
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    await supabase.from("process_events").insert({
      project_id: parsed.projectId,
      wafer_id: parsed.waferId,
      step_execution_id: parsed.stepExecutionId ?? null,
      actor_id: account.userId,
      event_type: "measurement_added",
      metadata: {
        measurement_id: data.id,
        metric_name: parsed.metricName
      }
    });

    revalidatePath("/", "layout");
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function reportProcessIssue(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = processIssueCreateSchema.parse(input);
    await assertProjectAccess(parsed.projectId, "write");

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("process_issues")
      .insert({
        project_id: parsed.projectId,
        wafer_id: parsed.waferId ?? null,
        step_execution_id: parsed.stepExecutionId ?? null,
        reported_by: account.userId,
        assigned_to: parsed.assignedTo ?? null,
        severity: parsed.severity,
        title: parsed.title,
        description: parsed.description ?? null
      })
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    await supabase.from("process_events").insert({
      project_id: parsed.projectId,
      wafer_id: parsed.waferId ?? null,
      step_execution_id: parsed.stepExecutionId ?? null,
      actor_id: account.userId,
      event_type: "issue_reported",
      notes: parsed.title,
      metadata: {
        issue_id: data.id,
        severity: parsed.severity
      }
    });

    revalidatePath("/", "layout");
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function registerAttachment(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = attachmentCreateSchema.parse(input);
    await assertProjectAccess(parsed.projectId, "write");

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("attachments")
      .insert({
        project_id: parsed.projectId,
        wafer_id: parsed.waferId ?? null,
        step_execution_id: parsed.stepExecutionId ?? null,
        measurement_id: parsed.measurementId ?? null,
        bucket_name: parsed.bucketName,
        object_path: parsed.objectPath,
        file_name: parsed.fileName,
        mime_type: parsed.mimeType ?? null,
        size_bytes: parsed.sizeBytes ?? null,
        uploaded_by: account.userId
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
