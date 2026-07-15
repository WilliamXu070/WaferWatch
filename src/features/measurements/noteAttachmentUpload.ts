"use client";

import { registerAttachment } from "@/features/measurements/actions";
import { createClient } from "@/lib/supabase/client";

export const MAX_NOTE_ATTACHMENTS = 8;
export const NOTE_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

const NOTE_ATTACHMENT_BUCKET = "wafer-process-files";

function sanitizeFileName(fileName: string) {
  return fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "attachment";
}

export type UploadedNoteAttachment = {
  id: string;
  bucketName: string;
  objectPath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

export async function uploadWaferNoteAttachments({
  projectId,
  waferId,
  dieLabel,
  category = "notes",
  stepExecutionId,
  noteId,
  files
}: {
  projectId: string;
  waferId: string;
  dieLabel: string;
  category?: string;
  stepExecutionId?: string | null;
  noteId: string;
  files: readonly File[];
}): Promise<UploadedNoteAttachment[]> {
  const uploaded: UploadedNoteAttachment[] = [];

  for (const file of files.slice(0, MAX_NOTE_ATTACHMENTS)) {
    if (file.size > NOTE_ATTACHMENT_MAX_BYTES) {
      throw new Error(`${file.name} is larger than 50 MB.`);
    }

    const safeFileName = sanitizeFileName(file.name);
    const safeDieLabel = sanitizeFileName(dieLabel);
    const safeCategory = sanitizeFileName(category);
    const objectPath = `${projectId}/wafers/${waferId}/dies/${safeDieLabel}/${safeCategory}/${noteId}/${crypto.randomUUID()}-${safeFileName}`;
    const signedResponse = await fetch("/api/storage/signed-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId,
        bucketName: NOTE_ATTACHMENT_BUCKET,
        objectPath
      })
    });

    if (!signedResponse.ok) {
      const payload = await signedResponse.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error ?? "Unable to create note attachment upload.");
    }

    const signedUpload = await signedResponse.json() as { path: string; token: string };
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(NOTE_ATTACHMENT_BUCKET)
      .uploadToSignedUrl(signedUpload.path, signedUpload.token, file, {
        contentType: file.type || "application/octet-stream"
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const registered = await registerAttachment({
      projectId,
      waferId,
      stepExecutionId: stepExecutionId ?? null,
      bucketName: NOTE_ATTACHMENT_BUCKET,
      objectPath,
      fileName: file.name || safeFileName,
      mimeType: file.type || null,
      sizeBytes: file.size
    });

    if (!registered.ok) {
      throw new Error(registered.error);
    }

    uploaded.push({
      id: registered.data.id,
      bucketName: registered.data.bucket_name,
      objectPath: registered.data.object_path,
      fileName: registered.data.file_name,
      mimeType: registered.data.mime_type,
      sizeBytes: registered.data.size_bytes
    });
  }

  return uploaded;
}
