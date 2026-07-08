"use client";

import { useCallback, useMemo, useState } from "react";
import {
  getAttachmentDownloadUrl,
  registerAttachment
} from "@/features/measurements/actions";
import { isGeneratedDicedPieceNote } from "@/features/runs/dicingNoteTransfer";
import { upsertTextSurface } from "@/features/text-surfaces/actions";
import { createClient } from "@/lib/supabase/client";
import type { WaferStatusTileModel } from "../../types";
import { DetailCard } from "./DetailCard";
import {
  getWaferDieNotesScopeKey,
  getWaferDieStepNotesScopeKey,
  waferDieNotesSurface
} from "./waferDieDetailData";

export type WaferDieNoteAttachment = {
  id: string;
  bucketName: string;
  objectPath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type WaferDieNote = {
  id: string;
  author: string;
  body: string;
  attachments?: WaferDieNoteAttachment[];
  processStepId?: string | null;
  processStepName?: string | null;
  createdAt: string;
  updatedAt: string;
};

type NotesSortOrder = "newest" | "oldest";

const MAX_NOTE_LENGTH = 1600;
const MAX_ATTACHMENTS_PER_NOTE = 8;
const NOTE_ATTACHMENT_BUCKET = "wafer-process-files";
const NOTE_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
const NOTE_ATTACHMENT_ACCEPT = [
  ".png",
  ".jpg",
  ".jpeg",
  ".tif",
  ".tiff",
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".csv",
  ".json"
].join(",");
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const notesSortOptions: Array<{ id: NotesSortOrder; label: string }> = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" }
];
const EMPTY_NOTES: readonly WaferDieNote[] = [];

function nowIso() {
  return new Date().toISOString();
}

function formatNoteTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Saved note";
  }

  const hour = date.getUTCHours();
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;

  return `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCDate()}, ${hour12}:${minute} ${suffix}`;
}

function getNoteTimeValue(note: WaferDieNote) {
  const value = new Date(note.updatedAt).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function getFallbackNoteId(body: string, timestamp: string) {
  return `note-${timestamp}-${body.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`;
}

function sanitizeFileName(fileName: string) {
  return fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "attachment";
}

function formatFileSize(sizeBytes: number | null | undefined) {
  if (!sizeBytes) {
    return "";
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function coerceAttachment(value: unknown): WaferDieNoteAttachment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const attachment = value as Partial<Record<keyof WaferDieNoteAttachment, unknown>>;
  if (
    typeof attachment.id !== "string" ||
    !attachment.id ||
    typeof attachment.bucketName !== "string" ||
    !attachment.bucketName ||
    typeof attachment.objectPath !== "string" ||
    !attachment.objectPath ||
    typeof attachment.fileName !== "string" ||
    !attachment.fileName
  ) {
    return null;
  }

  return {
    id: attachment.id,
    bucketName: attachment.bucketName,
    objectPath: attachment.objectPath,
    fileName: attachment.fileName,
    mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType : null,
    sizeBytes: typeof attachment.sizeBytes === "number" ? attachment.sizeBytes : null
  };
}

function coerceNote(value: unknown): WaferDieNote | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const note = value as Partial<Record<keyof WaferDieNote, unknown>>;
  if (typeof note.body !== "string" || !note.body.trim()) {
    return null;
  }

  const body = note.body.trim().slice(0, MAX_NOTE_LENGTH);
  const timestamp = typeof note.createdAt === "string" && note.createdAt ? note.createdAt : "unknown";
  return {
    id: typeof note.id === "string" && note.id ? note.id : getFallbackNoteId(body, timestamp),
    author: typeof note.author === "string" && note.author.trim() ? note.author.trim() : "WaferWatch",
    body,
    attachments: Array.isArray(note.attachments)
      ? note.attachments.map(coerceAttachment).filter((attachment): attachment is WaferDieNoteAttachment => Boolean(attachment))
      : [],
    processStepId: typeof note.processStepId === "string" && note.processStepId ? note.processStepId : null,
    processStepName: typeof note.processStepName === "string" && note.processStepName ? note.processStepName : null,
    createdAt: timestamp,
    updatedAt: typeof note.updatedAt === "string" && note.updatedAt ? note.updatedAt : timestamp
  };
}

export function parsePersistedNotes(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(coerceNote)
      .filter((note): note is WaferDieNote => Boolean(note))
      .sort((first, second) => getNoteTimeValue(first) - getNoteTimeValue(second));
  } catch {
    return [];
  }
}

export function getInitialWaferDieNotes(tile: WaferStatusTileModel): WaferDieNote[] {
  const persistedNotes = parsePersistedNotes(tile.notesSurfaceValue);
  if (persistedNotes) {
    return persistedNotes;
  }

  const legacyNote = tile.legacyNote?.trim();
  if (!legacyNote || isGeneratedDicedPieceNote(legacyNote)) {
    return [];
  }

  return [
    {
      id: `legacy-${tile.waferId}`,
      author: "Wafer note",
      body: legacyNote.slice(0, MAX_NOTE_LENGTH),
      createdAt: "legacy",
      updatedAt: "legacy"
    }
  ];
}

export function getInitialWaferDieNotesForStep(tile: WaferStatusTileModel, stepId: string): WaferDieNote[] {
  const step = tile.processSteps?.find((candidate) => candidate.id === stepId);
  const executionNote = step?.runNote?.trim()
    ? {
        id: `execution-note:${step.executionId ?? step.id}`,
        author: "Process move",
        body: step.runNote.trim().slice(0, MAX_NOTE_LENGTH),
        attachments: [],
        processStepId: stepId,
        processStepName: step.name,
        createdAt: step.completedAt ?? step.startedAt ?? step.createdAt ?? "unknown",
        updatedAt: step.completedAt ?? step.startedAt ?? step.createdAt ?? "unknown"
      }
    : null;
  const persistedNotes = parsePersistedNotes(tile.notesSurfaceValuesByStepId?.[stepId]);
  if (persistedNotes) {
    const notes = persistedNotes.map((note) => ({
      ...note,
      processStepId: note.processStepId ?? stepId,
      processStepName: note.processStepName ?? step?.name ?? null
    }));

    if (executionNote && !notes.some((note) => note.id === executionNote.id || note.body === executionNote.body)) {
      notes.push(executionNote);
    }

    return notes;
  }

  return executionNote ? [executionNote] : [];
}

export function getInitialWaferDieNotesByStep(tile: WaferStatusTileModel): Record<string, WaferDieNote[]> {
  const steps = tile.processSteps ?? [];
  const notesByStepId = Object.fromEntries(
    steps.map((step) => [step.id, getInitialWaferDieNotesForStep(tile, step.id)])
  );

  if (steps.length > 0) {
    const firstStepId = tile.currentStepId ?? steps[0]?.id;
    const legacyNotes = getInitialWaferDieNotes(tile).filter((note) => !note.processStepId);
    if (firstStepId && legacyNotes.length > 0 && (notesByStepId[firstStepId]?.length ?? 0) === 0) {
      notesByStepId[firstStepId] = legacyNotes.map((note) => ({
        ...note,
        processStepId: firstStepId,
        processStepName: steps.find((step) => step.id === firstStepId)?.name ?? null
      }));
    }
  }

  return notesByStepId;
}

export function flattenStepNotes(notesByStepId: Record<string, readonly WaferDieNote[]>) {
  return Object.values(notesByStepId).flat();
}

function NoteAuthorMark({ author }: { author: string }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#111111] text-[12px] font-semibold text-white">
      {author.trim().charAt(0).toUpperCase() || "N"}
    </span>
  );
}

function EmptyNotesState() {
  return (
    <div className="grid min-h-[180px] place-items-center rounded-lg border border-dashed border-[#ddddda] bg-white px-5 py-8 text-center">
      <div>
        <p className="text-[15px] font-semibold text-[#111111]">No notes yet</p>
        <p className="mt-2 max-w-[320px] text-[13px] leading-5 text-[#777770]">
          Add the first persistent note for this die.
        </p>
      </div>
    </div>
  );
}

export function NotesCard({
  notes,
  onOpenNotes
}: {
  notes: readonly WaferDieNote[];
  onOpenNotes: () => void;
}) {
  const latestNotes = useMemo(
    () => [...notes].sort((first, second) => getNoteTimeValue(second) - getNoteTimeValue(first)).slice(0, 2),
    [notes]
  );

  return (
    <DetailCard title="Notes (latest)">
      <div className="grid gap-3">
        {latestNotes.length ? (
          latestNotes.map((note) => (
            <article key={note.id} className="border-b border-[#eeeeea] py-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-md bg-[#111111] text-[11px] font-semibold text-white">
                  {note.author.trim().charAt(0).toUpperCase() || "N"}
                </span>
                <strong className="text-[13px] text-[#111111]">{note.author}</strong>
                <span className="text-[12px] font-medium text-[#8a8a83]">{formatNoteTime(note.updatedAt)}</span>
              </div>
              <p className="line-clamp-3 text-[13px] leading-5 text-[#44443f]">{note.body}</p>
            </article>
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-[#ddddda] bg-white px-4 py-5 text-[13px] font-medium text-[#777770]">
            No notes yet
          </p>
        )}
        <button
          type="button"
          onClick={onOpenNotes}
          className="mt-1 h-10 rounded-lg border border-[#e1e1dc] bg-white text-[14px] font-semibold text-[#44443f] hover:bg-[#fafafa]"
        >
          Open Notes tab
        </button>
      </div>
    </DetailCard>
  );
}

export function WaferDieNotesDashboard({
  tile,
  notesByStepId,
  onNotesChange
}: {
  tile: WaferStatusTileModel;
  notesByStepId: Record<string, readonly WaferDieNote[]>;
  onNotesChange: (stepId: string, notes: WaferDieNote[]) => void;
}) {
  const processSteps = tile.processSteps?.length ? tile.processSteps : [];
  const stageRows = processSteps.length
    ? processSteps
    : [{ id: "die", name: "Die notes", stepOrder: 1 }];
  const totalNotes = stageRows.reduce((total, step) => total + (notesByStepId[step.id]?.length ?? 0), 0);
  const [draftByStepId, setDraftByStepId] = useState<Record<string, string>>({});
  const [draftFilesByStepId, setDraftFilesByStepId] = useState<Record<string, File[]>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [sortOrder, setSortOrder] = useState<NotesSortOrder>("oldest");
  const [isSaving, setIsSaving] = useState(false);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const textSurfaceIdentityForStep = useCallback(
    (stepId: string) => ({
      projectId: tile.projectId,
      scopeType: waferDieNotesSurface.scopeType,
      scopeKey: stepId !== "die"
        ? getWaferDieStepNotesScopeKey(tile.waferId, tile.dieLabel || tile.code, stepId)
        : getWaferDieNotesScopeKey(tile.waferId, tile.dieLabel || tile.code),
      fieldKey: waferDieNotesSurface.fieldKey
    }),
    [tile.code, tile.dieLabel, tile.projectId, tile.waferId]
  );

  const uploadNoteAttachments = useCallback(
    async (
      stepExecutionId: string | null | undefined,
      noteId: string,
      files: readonly File[]
    ): Promise<WaferDieNoteAttachment[]> => {
      const uploaded: WaferDieNoteAttachment[] = [];

      for (const file of files.slice(0, MAX_ATTACHMENTS_PER_NOTE)) {
        if (file.size > NOTE_ATTACHMENT_MAX_BYTES) {
          throw new Error(`${file.name} is larger than 50 MB.`);
        }

        const uploadId = crypto.randomUUID();
        const safeFileName = sanitizeFileName(file.name);
        const dieLabel = sanitizeFileName(tile.dieLabel || tile.code);
        const objectPath = `${tile.projectId}/wafers/${tile.waferId}/dies/${dieLabel}/notes/${noteId}/${uploadId}-${safeFileName}`;
        const signedResponse = await fetch("/api/storage/signed-upload", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            projectId: tile.projectId,
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
          projectId: tile.projectId,
          waferId: tile.waferId,
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
    },
    [tile.code, tile.dieLabel, tile.projectId, tile.waferId]
  );

  const openAttachment = useCallback(async (attachment: WaferDieNoteAttachment) => {
    setOpeningAttachmentId(attachment.id);
    setError(null);

    const result = await getAttachmentDownloadUrl({ attachmentId: attachment.id });

    setOpeningAttachmentId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
  }, []);

  const persistNotes = useCallback(
    async (stepId: string, nextNotes: WaferDieNote[], previousNotes: readonly WaferDieNote[]) => {
      onNotesChange(stepId, nextNotes);
      setIsSaving(true);
      setError(null);

      const result = await upsertTextSurface({
        ...textSurfaceIdentityForStep(stepId),
        value: JSON.stringify(nextNotes)
      });

      setIsSaving(false);
      if (result.ok) {
        setSavedAt(nowIso());
        return;
      }

      onNotesChange(stepId, [...previousNotes]);
      setError(result.error);
    },
    [onNotesChange, textSurfaceIdentityForStep]
  );

  const addNote = async (stepId: string, stepName: string, stepExecutionId: string | null | undefined) => {
    const draft = draftByStepId[stepId] ?? "";
    const body = draft.trim();
    if (!body || isSaving) {
      return;
    }

    const notes = notesByStepId[stepId] ?? EMPTY_NOTES;
    const timestamp = nowIso();
    const noteId = crypto.randomUUID();
    const files = draftFilesByStepId[stepId] ?? [];
    setIsSaving(true);
    setError(null);

    let attachments: WaferDieNoteAttachment[];
    try {
      attachments = await uploadNoteAttachments(stepExecutionId, noteId, files);
    } catch (uploadError) {
      setIsSaving(false);
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload note attachments.");
      return;
    }

    const nextNotes = [
      ...notes,
      {
        id: noteId,
        author: "You",
        body: body.slice(0, MAX_NOTE_LENGTH),
        attachments,
        processStepId: stepId === "die" ? null : stepId,
        processStepName: stepId === "die" ? null : stepName,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ];

    setDraftByStepId((current) => ({ ...current, [stepId]: "" }));
    setDraftFilesByStepId((current) => ({ ...current, [stepId]: [] }));
    await persistNotes(stepId, nextNotes, notes);
  };

  const startEditing = (note: WaferDieNote) => {
    setEditingId(note.id);
    setEditValue(note.body);
    setError(null);
  };

  const saveEdit = async (stepId: string, noteId: string) => {
    const body = editValue.trim();
    if (!body || isSaving) {
      return;
    }

    const notes = notesByStepId[stepId] ?? EMPTY_NOTES;
    const nextNotes = notes.map((note) =>
      note.id === noteId
        ? {
            ...note,
            author: note.author === "Wafer note" ? "You" : note.author,
            body: body.slice(0, MAX_NOTE_LENGTH),
            updatedAt: nowIso()
          }
        : note
    );

    setEditingId(null);
    setEditValue("");
    await persistNotes(stepId, nextNotes, notes);
  };

  const deleteNote = async (stepId: string, noteId: string) => {
    if (isSaving) {
      return;
    }

    const notes = notesByStepId[stepId] ?? EMPTY_NOTES;
    const nextNotes = notes.filter((note) => note.id !== noteId);
    if (editingId === noteId) {
      setEditingId(null);
      setEditValue("");
    }

    await persistNotes(stepId, nextNotes, notes);
  };

  return (
    <DetailCard title="Notes" className="min-h-[520px]">
      <div className="grid gap-5">
        <div className="flex min-h-5 flex-wrap items-center justify-between gap-3 text-[12px] font-semibold">
          <span className="text-[#777770]">{totalNotes} {totalNotes === 1 ? "note" : "notes"} across all stages</span>
          <div className="flex items-center gap-1 rounded-lg border border-[#e1e1dc] bg-white p-1">
            {notesSortOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSortOrder(option.id)}
                className={[
                  "h-7 rounded-md px-3 text-[12px] font-semibold",
                  sortOrder === option.id
                    ? "bg-[#111111] text-white"
                    : "text-[#66665f] hover:bg-[#fafafa]"
                ].join(" ")}
                aria-pressed={sortOrder === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className={error ? "text-[#a33a2b]" : "text-[#777770]"}>
            {error ?? (isSaving ? "Saving..." : savedAt ? `Saved ${formatNoteTime(savedAt)}` : "")}
          </span>
        </div>

        <div className="grid gap-4">
          {stageRows.map((step, index) => {
            const notes = notesByStepId[step.id] ?? EMPTY_NOTES;
            const visibleNotes = [...notes].sort((first, second) => {
              const difference = getNoteTimeValue(first) - getNoteTimeValue(second);
              return sortOrder === "oldest" ? difference : -difference;
            });
            const draft = draftByStepId[step.id] ?? "";
            const draftFiles = draftFilesByStepId[step.id] ?? [];
            const stepExecutionId = "executionId" in step ? step.executionId : null;

            return (
              <section key={step.id} className="rounded-lg border border-[#e6e6e0] bg-white p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-[15px] font-semibold text-[#111111]">
                    {index + 1}. {step.name}
                  </h3>
                  <span className="text-[12px] font-semibold text-[#777770]">
                    {notes.length} {notes.length === 1 ? "note" : "notes"}
                  </span>
                </div>
                {visibleNotes.length ? (
                  <div className="grid gap-1">
                    {visibleNotes.map((note) => (
                      <article key={note.id} className="border-b border-[#eeeeea] py-4 last:border-b-0">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <NoteAuthorMark author={note.author} />
                    <div className="min-w-0">
                      <strong className="block text-[14px] text-[#111111]">{note.author}</strong>
                      <span className="text-[13px] font-medium text-[#8a8a83]">
                        {formatNoteTime(note.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {editingId === note.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditValue("");
                        }}
                        className="h-8 rounded-md border border-[#e1e1dc] bg-white px-3 text-[12px] font-semibold text-[#55554f] hover:bg-[#fafafa]"
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditing(note)}
                        className="h-8 rounded-md border border-[#e1e1dc] bg-white px-3 text-[12px] font-semibold text-[#55554f] hover:bg-[#fafafa]"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void deleteNote(step.id, note.id)}
                      disabled={isSaving}
                      className="h-8 rounded-md border border-[#e1e1dc] bg-white px-3 text-[12px] font-semibold text-[#8a3b30] hover:bg-[#fff7f4] disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {editingId === note.id ? (
                  <div className="grid gap-3">
                    <textarea
                      value={editValue}
                      onChange={(event) => setEditValue(event.target.value.slice(0, MAX_NOTE_LENGTH))}
                      className="min-h-[112px] w-full resize-y rounded-lg border border-[#e1e1dc] bg-white px-3 py-3 text-[14px] leading-6 text-[#111111] outline-none focus:border-[#111111]"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void saveEdit(step.id, note.id)}
                        disabled={!editValue.trim() || isSaving}
                        className="h-9 rounded-lg bg-[#111111] px-4 text-[13px] font-semibold text-white hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#c9c9c2]"
                      >
                        Save edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-[14px] leading-6 text-[#44443f]">{note.body}</p>
                )}
                {note.attachments?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {note.attachments.map((attachment) => (
                      <button
                        key={attachment.id}
                        type="button"
                        onClick={() => void openAttachment(attachment)}
                        disabled={openingAttachmentId === attachment.id}
                        className="inline-flex h-8 max-w-full items-center gap-2 rounded-md border border-[#e1e1dc] bg-[#fafafa] px-3 text-[12px] font-semibold text-[#44443f] hover:bg-white disabled:opacity-60"
                        title={attachment.fileName}
                      >
                        <span className="max-w-[220px] truncate">{attachment.fileName}</span>
                        <span className="text-[#8a8a83]">{formatFileSize(attachment.sizeBytes)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyNotesState />
                )}
                <div className="mt-3 border-t border-[#eeeeea] pt-3">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraftByStepId((current) => ({
                      ...current,
                      [step.id]: event.target.value.slice(0, MAX_NOTE_LENGTH)
                    }))}
                    placeholder={`Write a note for ${step.name}...`}
                    className="min-h-[88px] w-full resize-y border-0 bg-transparent text-[14px] leading-6 text-[#111111] outline-none placeholder:text-[#9b9b94]"
                  />
                  {draftFiles.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {draftFiles.map((file) => (
                        <span
                          key={`${file.name}:${file.size}:${file.lastModified}`}
                          className="inline-flex h-8 max-w-full items-center gap-2 rounded-md border border-[#e1e1dc] bg-[#fafafa] px-3 text-[12px] font-semibold text-[#44443f]"
                        >
                          <span className="max-w-[220px] truncate">{file.name}</span>
                          <span className="text-[#8a8a83]">{formatFileSize(file.size)}</span>
                          <button
                            type="button"
                            onClick={() => setDraftFilesByStepId((current) => ({
                              ...current,
                              [step.id]: (current[step.id] ?? []).filter((candidate) => candidate !== file)
                            }))}
                            className="text-[#8a3b30]"
                          >
                            Remove
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#eeeeea] pt-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-[12px] font-medium text-[#8a8a83]">
                        {draft.length}/{MAX_NOTE_LENGTH}
                      </p>
                      <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-[#e1e1dc] bg-white px-3 text-[12px] font-semibold text-[#55554f] hover:bg-[#fafafa]">
                        Attach files
                        <input
                          type="file"
                          multiple
                          accept={NOTE_ATTACHMENT_ACCEPT}
                          className="sr-only"
                          disabled={isSaving}
                          onChange={(event) => {
                            const selectedFiles = Array.from(event.currentTarget.files ?? []);
                            event.currentTarget.value = "";
                            setDraftFilesByStepId((current) => {
                              const existing = current[step.id] ?? [];
                              return {
                                ...current,
                                [step.id]: [...existing, ...selectedFiles].slice(0, MAX_ATTACHMENTS_PER_NOTE)
                              };
                            });
                          }}
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => void addNote(step.id, step.name, stepExecutionId)}
                      disabled={!draft.trim() || isSaving}
                      className="h-10 rounded-lg bg-[#111111] px-4 text-[14px] font-semibold text-white hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#c9c9c2]"
                    >
                      Add note to stage
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </DetailCard>
  );
}
