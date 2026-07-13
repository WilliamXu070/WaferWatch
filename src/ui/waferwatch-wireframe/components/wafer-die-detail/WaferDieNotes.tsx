"use client";

import {
  type ClipboardEvent as ReactClipboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { Camera, ImagePlus, Paperclip } from "lucide-react";
import Image from "next/image";
import {
  getAttachmentDownloadUrl,
  registerAttachment
} from "@/features/measurements/actions";
import { isGeneratedDicedPieceNote } from "@/features/runs/dicingNoteTransfer";
import { mutateTextSurfaceJsonArray } from "@/features/text-surfaces/actions";
import { createClient } from "@/lib/supabase/client";
import type { WaferStatusTileModel } from "../../types";
import { StepFileIcon } from "../../icons";
import { DetailCard } from "./DetailCard";
import { ProcessTimelineTree } from "./ProcessTimelineTree";
import { createTiffPngPreview, isTiffImage } from "./tiffPreview";
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
  authorId?: string | null;
  author: string;
  body: string;
  attachments?: WaferDieNoteAttachment[];
  processStepId?: string | null;
  processStepName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WaferDieNoteViewer = {
  id: string;
  displayName: string;
};

const MAX_NOTE_LENGTH = 1600;
const MAX_ATTACHMENTS_PER_NOTE = 8;
const NOTE_ATTACHMENT_BUCKET = "wafer-process-files";
const NOTE_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
const NOTE_ATTACHMENT_ACCEPT = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".heic",
  ".heif",
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
const NOTE_IMAGE_ACCEPT = "image/*,.heic,.heif";
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EMPTY_NOTES: readonly WaferDieNote[] = [];
const NOTE_AUTHOR_THEMES = [
  { background: "#e7f0fa", foreground: "#245b87" },
  { background: "#e7f4ed", foreground: "#216a49" },
  { background: "#fbf0dc", foreground: "#805817" },
  { background: "#f0eafa", foreground: "#65438a" },
  { background: "#f8e8ec", foreground: "#8a3c4b" },
  { background: "#e4f3f2", foreground: "#1f6965" }
] as const;
const SYSTEM_NOTE_THEME = { background: "#efefec", foreground: "#62625c" } as const;

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

function getAuthorInitials(author: string) {
  const initials = author
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "N";
}

function getAuthorTheme(note: WaferDieNote) {
  if (!note.authorId) {
    return SYSTEM_NOTE_THEME;
  }

  let hash = 0;
  for (const character of note.authorId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return NOTE_AUTHOR_THEMES[hash % NOTE_AUTHOR_THEMES.length];
}

function isOwnNote(note: WaferDieNote, currentUser: WaferDieNoteViewer | null | undefined) {
  return Boolean(note.authorId && currentUser?.id && note.authorId === currentUser.id);
}

function getNoteAuthorName(note: WaferDieNote, currentUser: WaferDieNoteViewer | null | undefined) {
  return isOwnNote(note, currentUser) ? currentUser?.displayName ?? note.author : note.author;
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

function isImageAttachment(attachment: WaferDieNoteAttachment) {
  return attachment.mimeType?.startsWith("image/") ?? /\.(?:avif|gif|heic|heif|jpe?g|png|tiff?|webp)$/i.test(attachment.fileName);
}

function getClipboardImageFiles(event: ReactClipboardEvent<HTMLTextAreaElement>) {
  return Array.from(event.clipboardData.items)
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
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
  if (typeof note.body !== "string") {
    return null;
  }

  const attachments = Array.isArray(note.attachments)
    ? note.attachments.map(coerceAttachment).filter((attachment): attachment is WaferDieNoteAttachment => Boolean(attachment))
    : [];
  const body = note.body.trim().slice(0, MAX_NOTE_LENGTH);
  if (!body && attachments.length === 0) {
    return null;
  }
  const timestamp = typeof note.createdAt === "string" && note.createdAt ? note.createdAt : "unknown";
  const authorId = typeof note.authorId === "string" && note.authorId.trim() ? note.authorId.trim() : null;
  const persistedAuthor = typeof note.author === "string" && note.author.trim() ? note.author.trim() : "WaferWatch";
  return {
    id: typeof note.id === "string" && note.id ? note.id : getFallbackNoteId(body, timestamp),
    authorId,
    author: !authorId && persistedAuthor.toLowerCase() === "you" ? "Unknown user" : persistedAuthor,
    body,
    attachments,
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

function NoteAuthorMark({ note, authorName }: { note: WaferDieNote; authorName: string }) {
  const theme = getAuthorTheme(note);

  return (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold"
      style={{ backgroundColor: theme.background, color: theme.foreground }}
      aria-hidden
    >
      {getAuthorInitials(authorName)}
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

function NoteImagePreview({ attachment }: { attachment: WaferDieNoteAttachment }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let generatedUrl: string | null = null;

    void getAttachmentDownloadUrl({ attachmentId: attachment.id }).then(async (result) => {
      if (!result.ok || cancelled) {
        if (!cancelled) setPreviewError(result.ok ? null : result.error);
        return;
      }

      try {
        const nextUrl = isTiffImage(attachment.fileName, attachment.mimeType)
          ? await fetch(result.data.signedUrl)
              .then((response) => {
                if (!response.ok) throw new Error("Unable to load the TIFF attachment.");
                return response.arrayBuffer();
              })
              .then(createTiffPngPreview)
          : result.data.signedUrl;

        if (isTiffImage(attachment.fileName, attachment.mimeType)) generatedUrl = nextUrl;
        if (!cancelled) setImageUrl(nextUrl);
      } catch (error) {
        if (!cancelled) setPreviewError(error instanceof Error ? error.message : "Unable to render image preview.");
      }
    });

    return () => {
      cancelled = true;
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    };
  }, [attachment.fileName, attachment.id, attachment.mimeType]);

  return imageUrl ? (
    <Image
      src={imageUrl}
      alt={attachment.fileName}
      fill
      unoptimized
      sizes="(max-width: 640px) 50vw, 180px"
      className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
    />
  ) : (
    <span className="grid h-full place-items-center px-3 text-center text-[12px] font-semibold text-[#777770]">
      {previewError ?? (isTiffImage(attachment.fileName, attachment.mimeType) ? "Rendering TIFF preview..." : "Image preview")}
    </span>
  );
}

export function NotesCard({
  notes,
  currentUser,
  onOpenNotes
}: {
  notes: readonly WaferDieNote[];
  currentUser?: WaferDieNoteViewer | null;
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
          latestNotes.map((note) => {
            const authorName = getNoteAuthorName(note, currentUser);
            const ownNote = isOwnNote(note, currentUser);

            return (
              <article key={note.id} className="border-b border-[#eeeeea] py-4">
                <div className="mb-2 flex items-center gap-2">
                  <NoteAuthorMark note={note} authorName={authorName} />
                  <strong className="text-[13px] text-[#111111]">{authorName}</strong>
                  {ownNote ? (
                    <span className="rounded-md bg-[#f0f0ed] px-1.5 py-0.5 text-[10px] font-bold text-[#5f5f59]">You</span>
                  ) : null}
                  <span className="text-[12px] font-medium text-[#8a8a83]">{formatNoteTime(note.updatedAt)}</span>
                </div>
                <p className="line-clamp-3 text-[13px] leading-5 text-[#44443f]">{note.body}</p>
              </article>
            );
          })
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

function isOpenIssueNote(note: WaferDieNote) {
  return /\b(issue|blocked|fail|failed|risk|chipping|investigating|urgent|problem)\b/i.test(note.body);
}

function isPinnedNote(note: WaferDieNote) {
  const pinned = (note as WaferDieNote & { pinned?: unknown }).pinned;
  return pinned === true || note.id.startsWith("pinned:");
}

export function WaferDieNotesDashboard({
  tile,
  canEdit = true,
  currentUser,
  notesByStepId,
  onNotesChange
}: {
  tile: WaferStatusTileModel;
  canEdit?: boolean;
  currentUser?: WaferDieNoteViewer | null;
  notesByStepId: Record<string, readonly WaferDieNote[]>;
  onNotesChange: (stepId: string, notes: WaferDieNote[]) => void;
}) {
  const processSteps = tile.processSteps?.length ? tile.processSteps : [];
  const stageRows = processSteps.length
    ? processSteps
    : [{ id: "die", name: "Die notes", stepOrder: 1 }];
  const [selectedStepId, setSelectedStepId] = useState(() =>
    tile.currentStepId && stageRows.some((step) => step.id === tile.currentStepId)
      ? tile.currentStepId
      : stageRows.find((step) => (notesByStepId[step.id]?.length ?? 0) > 0)?.id ?? stageRows[0]?.id ?? "die"
  );
  const [draftByStepId, setDraftByStepId] = useState<Record<string, string>>({});
  const [draftFilesByStepId, setDraftFilesByStepId] = useState<Record<string, File[]>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
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

  const persistNoteMutation = useCallback(
    async ({
      stepId,
      operation,
      noteId,
      note,
      optimisticNotes,
      previousNotes
    }: {
      stepId: string;
      operation: "add" | "update" | "delete";
      noteId: string;
      note: WaferDieNote | null;
      optimisticNotes: WaferDieNote[];
      previousNotes: readonly WaferDieNote[];
    }) => {
      onNotesChange(stepId, optimisticNotes);
      setIsSaving(true);
      setError(null);

      const result = await mutateTextSurfaceJsonArray({
        ...textSurfaceIdentityForStep(stepId),
        operation,
        itemId: noteId,
        item: note
      });

      setIsSaving(false);
      if (result.ok) {
        onNotesChange(stepId, parsePersistedNotes(result.data.value) ?? []);
        setSavedAt(nowIso());
        return;
      }

      onNotesChange(stepId, [...previousNotes]);
      setError(result.error);
    },
    [onNotesChange, textSurfaceIdentityForStep]
  );

  const appendDraftFiles = useCallback((stepId: string, files: readonly File[]) => {
    const acceptedFiles = files.filter((file) => file.size <= NOTE_ATTACHMENT_MAX_BYTES);
    if (acceptedFiles.length !== files.length) {
      setError("Images and files must be 50 MB or smaller.");
    }

    setDraftFilesByStepId((current) => {
      const existing = current[stepId] ?? [];
      const knownFiles = new Set(existing.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      const additions = acceptedFiles.filter((file) => {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (knownFiles.has(key)) {
          return false;
        }
        knownFiles.add(key);
        return true;
      });

      return {
        ...current,
        [stepId]: [...existing, ...additions].slice(0, MAX_ATTACHMENTS_PER_NOTE)
      };
    });
  }, []);

  const addNote = async (stepId: string, stepName: string, stepExecutionId: string | null | undefined) => {
    const draft = draftByStepId[stepId] ?? "";
    const body = draft.trim();
    const files = draftFilesByStepId[stepId] ?? [];
    if (!canEdit || (!body && files.length === 0) || isSaving) {
      return;
    }

    const notes = notesByStepId[stepId] ?? EMPTY_NOTES;
    const timestamp = nowIso();
    const noteId = crypto.randomUUID();
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
        authorId: currentUser?.id ?? null,
        author: currentUser?.displayName ?? "Unknown user",
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
    const addedNote = nextNotes[nextNotes.length - 1];
    await persistNoteMutation({
      stepId,
      operation: "add",
      noteId: addedNote.id,
      note: addedNote,
      optimisticNotes: nextNotes,
      previousNotes: notes
    });
  };

  const startEditing = (note: WaferDieNote) => {
    if (!canEdit) {
      return;
    }

    setEditingId(note.id);
    setEditValue(note.body);
    setError(null);
  };

  const saveEdit = async (stepId: string, noteId: string) => {
    const body = editValue.trim();
    if (!canEdit || !body || isSaving) {
      return;
    }

    const notes = notesByStepId[stepId] ?? EMPTY_NOTES;
    const nextNotes = notes.map((note) =>
      note.id === noteId
        ? {
            ...note,
            body: body.slice(0, MAX_NOTE_LENGTH),
            updatedAt: nowIso()
          }
        : note
    );

    setEditingId(null);
    setEditValue("");
    await persistNoteMutation({
      stepId,
      operation: "update",
      noteId,
      note: nextNotes.find((note) => note.id === noteId) ?? null,
      optimisticNotes: nextNotes,
      previousNotes: notes
    });
  };

  const deleteNote = async (stepId: string, noteId: string) => {
    if (!canEdit || isSaving) {
      return;
    }

    const notes = notesByStepId[stepId] ?? EMPTY_NOTES;
    const nextNotes = notes.filter((note) => note.id !== noteId);
    if (editingId === noteId) {
      setEditingId(null);
      setEditValue("");
    }

    await persistNoteMutation({
      stepId,
      operation: "delete",
      noteId,
      note: null,
      optimisticNotes: nextNotes,
      previousNotes: notes
    });
  };

  const selectedStep = stageRows.find((step) => step.id === selectedStepId) ?? stageRows[0];
  const selectedNotes = selectedStep ? notesByStepId[selectedStep.id] ?? EMPTY_NOTES : EMPTY_NOTES;
  const visibleNotes = [...selectedNotes].sort((first, second) => {
    const difference = getNoteTimeValue(first) - getNoteTimeValue(second);
    return difference;
  });
  const selectedDraft = selectedStep ? draftByStepId[selectedStep.id] ?? "" : "";
  const selectedDraftFiles = selectedStep ? draftFilesByStepId[selectedStep.id] ?? [] : [];
  const selectedStepExecutionId =
    selectedStep &&
    "executionId" in selectedStep &&
    typeof selectedStep.executionId === "string"
      ? selectedStep.executionId
      : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[440px_minmax(0,1fr)]">
      <DetailCard title="Process timeline" className="min-h-[520px]">
        {processSteps.length ? (
          <ProcessTimelineTree tile={tile} selectedStepId={selectedStep?.id} onSelectStep={setSelectedStepId} />
        ) : null}
      </DetailCard>

      <section className="overflow-hidden rounded-lg border border-[#e6e6e0] bg-white">
        <div className="border-b border-[#eeeeea] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#1fa69a]" aria-hidden />
              <h3 className="truncate text-[15px] font-semibold text-[#111111]">{selectedStep?.name ?? "Notes"}</h3>
              <span className="text-[13px] font-semibold text-[#8a8a83]">
                {selectedNotes.length} {selectedNotes.length === 1 ? "note" : "notes"}
              </span>
            </div>
            <span className={error ? "text-[12px] font-semibold text-[#a33a2b]" : "text-[12px] font-semibold text-[#777770]"}>
              {error ?? (isSaving ? "Saving..." : savedAt ? `Saved ${formatNoteTime(savedAt)}` : "")}
            </span>
          </div>
        </div>

        <div className="grid max-h-[540px] min-h-[300px] gap-3 overflow-y-auto bg-[#fbfbf8] p-3">
          {visibleNotes.length ? (
            visibleNotes.map((note) => {
              const authorName = getNoteAuthorName(note, currentUser);
              const ownNote = isOwnNote(note, currentUser);
              const authorTheme = getAuthorTheme(note);

              return (
                <article key={note.id} className="rounded-lg border border-[#e6e6e0] bg-white p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <NoteAuthorMark note={note} authorName={authorName} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {isPinnedNote(note) ? (
                          <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[11px] font-semibold text-[#2d74f0]">
                            Pinned
                          </span>
                        ) : null}
                        {isOpenIssueNote(note) ? (
                          <span className="rounded-full bg-[#fff2e8] px-2 py-0.5 text-[11px] font-semibold text-[#a84d1d]">
                            Open issue
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <strong className="text-[14px]" style={{ color: authorTheme.foreground }}>{authorName}</strong>
                        {ownNote ? (
                          <span className="rounded-md bg-[#f0f0ed] px-1.5 py-0.5 text-[10px] font-bold text-[#5f5f59]">
                            You
                          </span>
                        ) : null}
                        <span className="text-[13px] font-medium text-[#8a8a83]">{formatNoteTime(note.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                  {canEdit ? (
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
                      onClick={() => selectedStep ? void deleteNote(selectedStep.id, note.id) : undefined}
                      disabled={isSaving || !selectedStep}
                      className="h-8 rounded-md border border-[#e1e1dc] bg-white px-3 text-[12px] font-semibold text-[#8a3b30] hover:bg-[#fff7f4] disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                  ) : null}
                </div>

                {canEdit && editingId === note.id ? (
                  <div className="grid gap-3">
                    <textarea
                      value={editValue}
                      onChange={(event) => setEditValue(event.target.value.slice(0, MAX_NOTE_LENGTH))}
                      className="min-h-[112px] w-full resize-y rounded-lg border border-[#e1e1dc] bg-white px-3 py-3 text-[14px] leading-6 text-[#111111] outline-none focus:border-[#111111]"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => selectedStep ? void saveEdit(selectedStep.id, note.id) : undefined}
                        disabled={!editValue.trim() || isSaving || !selectedStep}
                        className="h-9 rounded-lg bg-[#111111] px-4 text-[13px] font-semibold text-white hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#c9c9c2]"
                      >
                        Save edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="max-w-[75ch] whitespace-pre-wrap text-[14px] leading-6 text-[#44443f]">{note.body}</p>
                )}

                {note.attachments?.some(isImageAttachment) ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {note.attachments.filter(isImageAttachment).map((attachment) => {
                      return (
                        <button
                          key={attachment.id}
                          type="button"
                          onClick={() => void openAttachment(attachment)}
                          disabled={openingAttachmentId === attachment.id}
                          className="group relative aspect-[4/3] overflow-hidden rounded-md border border-[#e1e1dc] bg-[#f5f5f1] text-left disabled:opacity-60"
                          title={`Open ${attachment.fileName}`}
                        >
                          <NoteImagePreview attachment={attachment} />
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {note.attachments?.some((attachment) => !isImageAttachment(attachment)) ? (
                  <div className="mt-3 grid max-w-[560px] gap-2">
                    {note.attachments.filter((attachment) => !isImageAttachment(attachment)).map((attachment) => (
                      <button
                        key={attachment.id}
                        type="button"
                        onClick={() => void openAttachment(attachment)}
                        disabled={openingAttachmentId === attachment.id}
                        className="grid h-9 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-[#e1e1dc] bg-[#fafafa] px-3 text-left text-[12px] font-semibold text-[#44443f] hover:bg-white disabled:opacity-60"
                        title={attachment.fileName}
                      >
                        <StepFileIcon className="text-[#777770]" />
                        <span className="truncate">{attachment.fileName}</span>
                        <span className="text-[#8a8a83]">{formatFileSize(attachment.sizeBytes)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                </article>
              );
            })
          ) : (
            <EmptyNotesState />
          )}
        </div>

        {canEdit ? (
        <div className="border-t border-[#e6e6e0] bg-white p-3">
          <textarea
            value={selectedDraft}
            onChange={(event) => selectedStep && setDraftByStepId((current) => ({
              ...current,
              [selectedStep.id]: event.target.value.slice(0, MAX_NOTE_LENGTH)
            }))}
            placeholder={selectedStep ? `Write a note for ${selectedStep.name}...` : "Write a note..."}
            className="min-h-[88px] w-full resize-y rounded-lg border border-[#e6e6e0] bg-[#fbfbf8] px-3 py-3 text-[14px] leading-6 text-[#111111] outline-none placeholder:text-[#9b9b94] focus:border-[#111111]"
            onPaste={(event) => {
              if (!selectedStep) {
                return;
              }

              const pastedImages = getClipboardImageFiles(event);
              if (pastedImages.length > 0) {
                event.preventDefault();
                appendDraftFiles(selectedStep.id, pastedImages);
              }
            }}
          />
          {selectedDraftFiles.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedDraftFiles.map((file) => (
                <span
                  key={`${file.name}:${file.size}:${file.lastModified}`}
                  className="inline-flex h-8 max-w-full items-center gap-2 rounded-md border border-[#e1e1dc] bg-[#fafafa] px-3 text-[12px] font-semibold text-[#44443f]"
                >
                  <span className="max-w-[220px] truncate">{file.name}</span>
                  <span className="text-[#8a8a83]">{formatFileSize(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => selectedStep && setDraftFilesByStepId((current) => ({
                      ...current,
                      [selectedStep.id]: (current[selectedStep.id] ?? []).filter((candidate) => candidate !== file)
                    }))}
                    className="text-[#8a3b30]"
                  >
                    Remove
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-1 text-[12px] font-medium text-[#8a8a83]">
                {selectedDraft.length}/{MAX_NOTE_LENGTH}
              </p>
              <label className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-[#e1e1dc] bg-white text-[#55554f] hover:bg-[#fafafa]" title="Attach files" aria-label="Attach files">
                <Paperclip size={16} aria-hidden />
                <input
                  type="file"
                  multiple
                  accept={NOTE_ATTACHMENT_ACCEPT}
                  className="sr-only"
                  disabled={isSaving}
                  onChange={(event) => {
                    if (!selectedStep) {
                      return;
                    }

                    const selectedFiles = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = "";
                    appendDraftFiles(selectedStep.id, selectedFiles);
                  }}
                />
              </label>
              <label className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-[#e1e1dc] bg-white text-[#55554f] hover:bg-[#fafafa]" title="Choose photos" aria-label="Choose photos">
                <ImagePlus size={16} aria-hidden />
                <input
                  type="file"
                  multiple
                  accept={NOTE_IMAGE_ACCEPT}
                  className="sr-only"
                  disabled={isSaving}
                  onChange={(event) => {
                    if (!selectedStep) {
                      return;
                    }

                    const selectedFiles = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = "";
                    appendDraftFiles(selectedStep.id, selectedFiles);
                  }}
                />
              </label>
              <label className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-[#e1e1dc] bg-white text-[#55554f] hover:bg-[#fafafa]" title="Take photo" aria-label="Take photo">
                <Camera size={16} aria-hidden />
                <input
                  type="file"
                  accept={NOTE_IMAGE_ACCEPT}
                  capture="environment"
                  className="sr-only"
                  disabled={isSaving}
                  onChange={(event) => {
                    if (!selectedStep) {
                      return;
                    }

                    const selectedFiles = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = "";
                    appendDraftFiles(selectedStep.id, selectedFiles);
                  }}
                />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!selectedStep) {
                    return;
                  }

                  setDraftByStepId((current) => ({ ...current, [selectedStep.id]: "" }));
                  setDraftFilesByStepId((current) => ({ ...current, [selectedStep.id]: [] }));
                }}
                className="h-10 rounded-lg border border-transparent px-4 text-[14px] font-semibold text-[#55554f] hover:bg-[#fafafa]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => selectedStep ? void addNote(selectedStep.id, selectedStep.name, selectedStepExecutionId) : undefined}
                disabled={(!selectedDraft.trim() && selectedDraftFiles.length === 0) || isSaving || !selectedStep}
                className="h-10 rounded-lg bg-[#2d74f0] px-5 text-[14px] font-semibold text-white hover:bg-[#1f60d1] disabled:cursor-not-allowed disabled:bg-[#c9c9c2]"
              >
                Add note
              </button>
            </div>
          </div>
        </div>
        ) : null}
      </section>
    </div>
  );
}
