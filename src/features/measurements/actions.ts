"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { assertProjectAccess, requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  attachmentDownloadSchema,
  attachmentCreateSchema
} from "@/features/measurements/schemas";

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
