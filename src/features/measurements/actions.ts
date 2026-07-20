"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { assertProjectAccess, requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  attachmentDownloadSchema,
  attachmentCreateSchema,
  attachmentCreateBatchSchema,
  waferStepNoteFinalizeBatchSchema
} from "@/features/measurements/schemas";
import type { Json } from "@/types/database";

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  worker: (value: T, index: number) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index], index);
    }
  }));
  return results;
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

export async function registerAttachmentsBatch(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = attachmentCreateBatchSchema.parse(input);
    await assertProjectAccess(parsed.projectId, "write");
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("attachments")
      .upsert(parsed.attachments.map((attachment) => ({
        project_id: parsed.projectId,
        wafer_id: attachment.waferId ?? null,
        step_execution_id: attachment.stepExecutionId ?? null,
        measurement_id: attachment.measurementId ?? null,
        bucket_name: attachment.bucketName,
        object_path: attachment.objectPath,
        file_name: attachment.fileName,
        mime_type: attachment.mimeType ?? null,
        size_bytes: attachment.sizeBytes ?? null,
        uploaded_by: account.userId
      })), { onConflict: "bucket_name,object_path" })
      .select("*");
    return error ? fail(error.message) : ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function finalizeWaferStepNotesBatch(input: unknown) {
  const startedAt = performance.now();
  try {
    const authStartedAt = performance.now();
    const account = await requireAccount();
    const parsed = waferStepNoteFinalizeBatchSchema.parse(input);
    await assertProjectAccess(parsed.projectId, "write");
    const authDurationMs = performance.now() - authStartedAt;
    const supabase = await createServerSupabaseClient();
    const attachmentInputs = parsed.notes.flatMap((note) => note.attachments.map((attachment) => ({
      project_id: parsed.projectId,
      wafer_id: note.waferId,
      step_execution_id: note.stepExecutionId ?? null,
      measurement_id: null,
      bucket_name: "wafer-process-files",
      object_path: attachment.objectPath,
      file_name: attachment.fileName,
      mime_type: attachment.mimeType ?? null,
      size_bytes: attachment.sizeBytes ?? null,
      uploaded_by: account.userId
    })));

    const finalizationStartedAt = performance.now();
    const { data: registeredAttachments, error: attachmentError } = attachmentInputs.length
      ? await supabase
          .from("attachments")
          .upsert(attachmentInputs, { onConflict: "bucket_name,object_path" })
          .select("*")
      : { data: [], error: null };
    if (attachmentError) return fail(attachmentError.message);
    const attachmentsByPath = new Map((registeredAttachments ?? []).map((attachment) => [attachment.object_path, attachment]));

    const outcomes = await mapWithConcurrency(parsed.notes, 4, async (note) => {
      const attachments = note.attachments.map((attachment) => {
        const registered = attachmentsByPath.get(attachment.objectPath);
        if (!registered) throw new Error("An uploaded attachment could not be registered.");
        return {
          id: registered.id,
          bucketName: registered.bucket_name,
          objectPath: registered.object_path,
          fileName: registered.file_name,
          mimeType: registered.mime_type,
          sizeBytes: registered.size_bytes
        };
      });
      const { data, error } = await supabase.rpc("mutate_text_surface_json_array", {
        target_project_id: parsed.projectId,
        target_scope_type: note.scopeType,
        target_scope_key: note.scopeKey,
        target_field_key: note.fieldKey,
        operation: "add",
        item_id: note.noteId,
        item: { ...note.item, attachments } as Json
      });
      return error
        ? { noteId: note.noteId, ok: false as const, error: error.message }
        : { noteId: note.noteId, ok: true as const, data, attachments };
    });

    console.info("[ProcessFlowPerf]", JSON.stringify({
      action: "note_finalization_batch",
      notes: parsed.notes.length,
      attachments: attachmentInputs.length,
      auth_ms: Math.round(authDurationMs),
      finalization_ms: Math.round(performance.now() - finalizationStartedAt),
      total_ms: Math.round(performance.now() - startedAt)
    }));
    return ok(outcomes);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function getAttachmentDownloadUrl(input: unknown) {
  try {
    const parsed = attachmentDownloadSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data: attachment, error } = await supabase
      .from("attachments")
      .select("*")
      .eq("id", parsed.attachmentId)
      .single();

    if (error) {
      return fail(error.message);
    }

    await assertProjectAccess(attachment.project_id, "read");

    const admin = createSupabaseAdminClient();
    const signed = await admin.storage
      .from(attachment.bucket_name)
      .createSignedUrl(attachment.object_path, 60 * 60);

    if (signed.error) {
      return fail(signed.error.message);
    }

    return ok({
      signedUrl: signed.data.signedUrl,
      fileName: attachment.file_name,
      mimeType: attachment.mime_type
    });
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}
