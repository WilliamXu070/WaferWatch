import { z } from "zod";
import { uuidSchema } from "@/lib/validation";

export const attachmentCreateSchema = z.object({
  projectId: uuidSchema,
  waferId: uuidSchema.nullable().optional(),
  stepExecutionId: uuidSchema.nullable().optional(),
  measurementId: uuidSchema.nullable().optional(),
  bucketName: z.enum(["wafer-characterization", "wafer-process-files", "wafer-maps"]),
  objectPath: z.string().trim().min(1).max(1000),
  fileName: z.string().trim().min(1).max(260),
  mimeType: z.string().trim().max(120).nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional()
});

export const attachmentDownloadSchema = z.object({
  attachmentId: uuidSchema
});

export const attachmentCreateBatchSchema = z.object({
  projectId: uuidSchema,
  attachments: z.array(attachmentCreateSchema.omit({ projectId: true })).min(1).max(256)
});

const waferStepNoteAttachmentSchema = attachmentCreateSchema.pick({
  objectPath: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true
});

export const waferStepNoteFinalizeBatchSchema = z.object({
  projectId: uuidSchema,
  notes: z.array(z.object({
    noteId: z.string().trim().min(1).max(200),
    waferId: uuidSchema,
    stepExecutionId: uuidSchema.nullable().optional(),
    scopeType: z.string().trim().min(2).max(80),
    scopeKey: z.string().trim().min(1).max(400),
    fieldKey: z.string().trim().min(2).max(80),
    item: z.record(z.string(), z.unknown()),
    attachments: z.array(waferStepNoteAttachmentSchema).max(8)
  })).min(1).max(256)
}).superRefine(({ notes }, ctx) => {
  const noteIds = new Set<string>();
  const objectPaths = new Set<string>();
  notes.forEach((note, noteIndex) => {
    if (noteIds.has(note.noteId)) {
      ctx.addIssue({ code: "custom", path: ["notes", noteIndex, "noteId"], message: "Note ids must be unique." });
    }
    noteIds.add(note.noteId);
    note.attachments.forEach((attachment, attachmentIndex) => {
      if (objectPaths.has(attachment.objectPath)) {
        ctx.addIssue({ code: "custom", path: ["notes", noteIndex, "attachments", attachmentIndex], message: "Attachment paths must be unique." });
      }
      objectPaths.add(attachment.objectPath);
    });
  });
});
