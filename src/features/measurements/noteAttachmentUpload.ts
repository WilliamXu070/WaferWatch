"use client";

import { finalizeWaferStepNotesBatch, registerAttachmentsBatch } from "@/features/measurements/actions";
import {
  getNoteAttachmentMimeType,
  MAX_NOTE_ATTACHMENTS,
  NOTE_ATTACHMENT_MAX_BYTES
} from "@/features/measurements/noteAttachmentDraft";
import { normalizeNoteAttachmentFiles } from "@/features/measurements/noteAttachmentFile";
import { createClient } from "@/lib/supabase/client";
import { getStableAttachmentObjectPath, mapWithConcurrency } from "./backgroundAttachmentQueue";
import {
  getWaferDieStepNotesScopeKey,
  waferDieNotesSurface
} from "@/ui/waferwatch-wireframe/components/wafer-die-detail/waferDieDetailData";

export { MAX_NOTE_ATTACHMENTS, NOTE_ATTACHMENT_MAX_BYTES } from "@/features/measurements/noteAttachmentDraft";

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

export type WaferStepNoteAttachmentInput = {
  projectId: string;
  waferId: string;
  dieLabel: string;
  stepId: string;
  stepName: string;
  stepExecutionId?: string | null;
  noteId: string;
  authorId?: string | null;
  author: string;
  body: string;
  files: readonly File[];
};

export type BackgroundAttachmentJob = {
  id: string;
  noteId: string;
  objectPath: string;
  file: File;
  status: "queued" | "uploading" | "uploaded";
};

function createAttachmentJobs(input: WaferStepNoteAttachmentInput, noteIndex: number) {
  return input.files.slice(0, MAX_NOTE_ATTACHMENTS).map((file, fileIndex): BackgroundAttachmentJob & { noteIndex: number } => {
    if (file.size > NOTE_ATTACHMENT_MAX_BYTES) {
      throw new Error(`${file.name} is larger than 50 MB.`);
    }
    const safeFileName = sanitizeFileName(file.name);
    const objectPath = getStableAttachmentObjectPath({
      projectId: input.projectId,
      waferId: input.waferId,
      dieLabel: sanitizeFileName(input.dieLabel),
      category: "notes",
      noteId: input.noteId,
      fileIndex,
      fileName: safeFileName
    });
    return {
      id: `${input.noteId}:${fileIndex}`,
      noteId: input.noteId,
      noteIndex,
      objectPath,
      file,
      status: "queued"
    };
  });
}

export async function persistWaferStepNoteAttachmentsBatch(
  inputs: readonly WaferStepNoteAttachmentInput[]
): Promise<Map<string, UploadedNoteAttachment[]>> {
  if (!inputs.length) return new Map();
  const projectIds = new Set(inputs.map((input) => input.projectId));
  if (projectIds.size !== 1) throw new Error("Attachment batches must belong to one project.");

  const totalStartedAt = performance.now();
  const normalizedInputs = await Promise.all(inputs.map(async (input) => ({
    ...input,
    files: await normalizeNoteAttachmentFiles(input.files)
  })));
  const jobs = normalizedInputs.flatMap(createAttachmentJobs);
  const signingStartedAt = performance.now();
  const signedResponse = await fetch("/api/storage/signed-upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      uploads: jobs.map((job) => ({
        projectId: normalizedInputs[job.noteIndex].projectId,
        bucketName: NOTE_ATTACHMENT_BUCKET,
        objectPath: job.objectPath
      }))
    })
  });
  if (!signedResponse.ok) {
    const payload = await signedResponse.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? "Unable to create note attachment uploads.");
  }
  const signed = await signedResponse.json() as {
    uploads: Array<{ objectPath: string; path: string; token: string }>;
  };
  const signedByObjectPath = new Map(signed.uploads.map((upload) => [upload.objectPath, upload]));

  const uploadStartedAt = performance.now();
  const supabase = createClient();
  await mapWithConcurrency(jobs, 3, async (job) => {
    const signedUpload = signedByObjectPath.get(job.objectPath);
    if (!signedUpload) throw new Error("A signed upload was not returned for an attachment.");
    job.status = "uploading";
    const { error } = await supabase.storage
      .from(NOTE_ATTACHMENT_BUCKET)
      .uploadToSignedUrl(signedUpload.path, signedUpload.token, job.file, {
        contentType: getNoteAttachmentMimeType(job.file) ?? "application/octet-stream"
      });
    if (error) throw new Error(error.message);
    job.status = "uploaded";
  });

  const timestamp = new Date().toISOString();
  const notes = normalizedInputs.map((input, noteIndex) => ({
    noteId: input.noteId,
    waferId: input.waferId,
    stepExecutionId: input.stepExecutionId ?? null,
    scopeType: waferDieNotesSurface.scopeType,
    scopeKey: getWaferDieStepNotesScopeKey(input.waferId, input.dieLabel, input.stepId),
    fieldKey: waferDieNotesSurface.fieldKey,
    item: {
      id: input.noteId,
      authorId: input.authorId ?? null,
      author: input.author,
      body: input.body,
      attachments: [],
      processStepId: input.stepId,
      processStepName: input.stepName,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    attachments: jobs.filter((job) => job.noteIndex === noteIndex).map((job) => ({
      objectPath: job.objectPath,
      fileName: job.file.name || sanitizeFileName(job.file.name),
      mimeType: getNoteAttachmentMimeType(job.file),
      sizeBytes: job.file.size
    }))
  }));
  const finalizationStartedAt = performance.now();
  const finalized = await finalizeWaferStepNotesBatch({ projectId: normalizedInputs[0].projectId, notes });
  if (!finalized.ok) throw new Error(finalized.error);
  const failed = finalized.data.filter((outcome) => !outcome.ok);
  if (failed.length) {
    const failedIds = new Set(failed.map((outcome) => outcome.noteId));
    const retried = await finalizeWaferStepNotesBatch({
      projectId: inputs[0].projectId,
      notes: notes.filter((note) => failedIds.has(note.noteId))
    });
    if (!retried.ok) throw new Error(retried.error);
    const retryFailure = retried.data.find((outcome) => !outcome.ok);
    if (retryFailure && !retryFailure.ok) throw new Error(retryFailure.error);
    finalized.data.splice(0, finalized.data.length,
      ...finalized.data.filter((outcome) => !failedIds.has(outcome.noteId)),
      ...retried.data
    );
  }

  console.info("[ProcessFlowPerf]", JSON.stringify({
    action: "background_attachments",
    notes: inputs.length,
    attachments: jobs.length,
    signing_ms: Math.round(uploadStartedAt - signingStartedAt),
    upload_ms: Math.round(finalizationStartedAt - uploadStartedAt),
    finalization_ms: Math.round(performance.now() - finalizationStartedAt),
    total_ms: Math.round(performance.now() - totalStartedAt)
  }));
  return new Map(finalized.data.flatMap((outcome) => outcome.ok
    ? [[outcome.noteId, outcome.attachments] as const]
    : []));
}

export async function uploadWaferNoteAttachments(input: {
  projectId: string;
  waferId: string;
  dieLabel: string;
  category?: string;
  stepExecutionId?: string | null;
  noteId: string;
  files: readonly File[];
}): Promise<UploadedNoteAttachment[]> {
  const selectedFiles = input.files.slice(0, MAX_NOTE_ATTACHMENTS);
  selectedFiles.forEach((file) => {
    if (file.size > NOTE_ATTACHMENT_MAX_BYTES) throw new Error(`${file.name} is larger than 50 MB.`);
  });
  const files = await normalizeNoteAttachmentFiles(selectedFiles);
  files.forEach((file) => {
    if (file.size > NOTE_ATTACHMENT_MAX_BYTES) throw new Error(`${file.name} is larger than 50 MB after conversion.`);
  });
  const objectPaths = files.map((file, index) => getStableAttachmentObjectPath({
    projectId: input.projectId,
    waferId: input.waferId,
    dieLabel: sanitizeFileName(input.dieLabel),
    category: sanitizeFileName(input.category ?? "notes"),
    noteId: input.noteId,
    fileIndex: index,
    fileName: sanitizeFileName(file.name)
  }));
  const signedResponse = await fetch("/api/storage/signed-upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uploads: objectPaths.map((objectPath) => ({
      projectId: input.projectId,
      bucketName: NOTE_ATTACHMENT_BUCKET,
      objectPath
    })) })
  });
  if (!signedResponse.ok) {
    const payload = await signedResponse.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? "Unable to create note attachment uploads.");
  }
  const signed = await signedResponse.json() as { uploads: Array<{ objectPath: string; path: string; token: string }> };
  const signedByPath = new Map(signed.uploads.map((upload) => [upload.objectPath, upload]));
  const supabase = createClient();
  await mapWithConcurrency(files, 3, async (file, index) => {
    const signedUpload = signedByPath.get(objectPaths[index]);
    if (!signedUpload) throw new Error("A signed upload was not returned for an attachment.");
    const { error } = await supabase.storage.from(NOTE_ATTACHMENT_BUCKET).uploadToSignedUrl(
      signedUpload.path,
      signedUpload.token,
      file,
      { contentType: getNoteAttachmentMimeType(file) ?? "application/octet-stream" }
    );
    if (error) throw new Error(error.message);
  });
  const registered = await registerAttachmentsBatch({
    projectId: input.projectId,
    attachments: files.map((file, index) => ({
      waferId: input.waferId,
      stepExecutionId: input.stepExecutionId ?? null,
      bucketName: NOTE_ATTACHMENT_BUCKET,
      objectPath: objectPaths[index],
      fileName: file.name || sanitizeFileName(file.name),
      mimeType: getNoteAttachmentMimeType(file),
      sizeBytes: file.size
    }))
  });
  if (!registered.ok) throw new Error(registered.error);
  return registered.data.map((attachment) => ({
    id: attachment.id,
    bucketName: attachment.bucket_name,
    objectPath: attachment.object_path,
    fileName: attachment.file_name,
    mimeType: attachment.mime_type,
    sizeBytes: attachment.size_bytes
  }));
}

export async function persistWaferStepNoteAttachments(input: WaferStepNoteAttachmentInput) {
  const result = await persistWaferStepNoteAttachmentsBatch([input]);
  return result.get(input.noteId) ?? [];
}
