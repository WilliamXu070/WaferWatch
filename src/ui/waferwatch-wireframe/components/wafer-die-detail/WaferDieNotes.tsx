"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import Image from "next/image";
import { PendingNoteAttachments } from "@/components/notes/PendingNoteAttachments";
import { getAttachmentDownloadUrl } from "@/features/measurements/actions";
import { getClipboardImageFiles } from "@/features/measurements/clipboardImages";
import {
  formatNoteAttachmentSize,
  MAX_NOTE_ATTACHMENTS,
  mergeNoteAttachmentFiles,
  prepareNoteAttachmentFiles
} from "@/features/measurements/noteAttachmentDraft";
import {
  uploadWaferNoteAttachments,
  type UploadedNoteAttachment
} from "@/features/measurements/noteAttachmentUpload";
import { saveWaferStatusStepParameterRecord } from "@/features/process-flows/actions";
import { isGeneratedDicedPieceNote } from "@/features/runs/dicingNoteTransfer";
import { mutateTextSurfaceJsonArray } from "@/features/text-surfaces/actions";
import type { WaferStatusTileModel } from "../../types";
import { StepFileIcon } from "../../icons";
import { DetailCard } from "./DetailCard";
import { SequentialStepPicker } from "./SequentialStepPicker";
import { StepParameterHistory } from "./StepParameterHistory";
import { buildStepVisitHistory } from "./stepVisitHistoryModel";
import { createTiffPngPreview, isTiffImage } from "./tiffPreview";
import {
  getWaferDieNotesScopeKey,
  getWaferDieStepNotesScopeKey,
  waferDieNotesSurface
} from "./waferDieDetailData";

export type WaferDieNoteAttachment = UploadedNoteAttachment;

export type WaferDieNote = {
  id: string;
  authorId?: string | null;
  author: string;
  body: string;
  attachments?: WaferDieNoteAttachment[];
  processStepId?: string | null;
  processStepName?: string | null;
  processVisitId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WaferDieNoteViewer = {
  id: string;
  displayName: string;
};

const MAX_NOTE_LENGTH = 1600;
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

function formatFileSize(sizeBytes: number | null | undefined) {
  return formatNoteAttachmentSize(sizeBytes);
}

function isImageAttachment(attachment: WaferDieNoteAttachment) {
  return attachment.mimeType?.startsWith("image/") ?? /\.(?:avif|gif|heic|heif|jpe?g|png|tiff?|webp)$/i.test(attachment.fileName);
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
    processVisitId: typeof note.processVisitId === "string" && note.processVisitId ? note.processVisitId : null,
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
  const persistedNotes = parsePersistedNotes(tile.notesSurfaceValuesByStepId?.[stepId]);
  if (persistedNotes) {
    return persistedNotes.map((note) => ({
      ...note,
      processStepId: note.processStepId ?? stepId,
      processStepName: note.processStepName ?? step?.name ?? null
    }));
  }

  return [];
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
    <div className="grid min-h-[72px] flex-1 place-items-center rounded-lg border border-dashed border-[#ddddda] bg-white px-4 py-3 text-center">
      <div>
        <p className="text-[15px] font-semibold text-[#111111]">No notes yet</p>
        <p className="mt-1 max-w-[320px] text-[12px] leading-4 text-[#777770]">
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
  const visits = useMemo(() => buildStepVisitHistory(tile), [tile]);
  const [selectedVisitId, setSelectedVisitId] = useState(() =>
    [...visits].reverse().find((visit) => visit.state === "current")?.id ?? visits.at(-1)?.id ?? "die"
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

  const appendDraftFiles = useCallback(async (stepId: string, files: readonly File[]) => {
    await prepareNoteAttachmentFiles(files);
    setDraftFilesByStepId((current) => {
      const existing = current[stepId] ?? [];
      const merged = mergeNoteAttachmentFiles(existing, files);
      setError(
        merged.oversizedCount > 0
          ? "Files must be 50 MB or smaller."
          : merged.overflowCount > 0
            ? `You can attach up to ${MAX_NOTE_ATTACHMENTS} files.`
            : null
      );

      return {
        ...current,
        [stepId]: merged.files
      };
    });
  }, []);

  const addNote = async (
    stepId: string,
    stepName: string,
    stepExecutionId: string | null | undefined,
    visitId: string
  ) => {
    const draft = draftByStepId[visitId] ?? "";
    const body = draft.trim();
    const files = draftFilesByStepId[visitId] ?? [];
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
      attachments = await uploadWaferNoteAttachments({
        projectId: tile.projectId,
        waferId: tile.waferId,
        dieLabel: tile.dieLabel || tile.code,
        stepExecutionId,
        noteId,
        files
      });
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
        processVisitId: visitId === "die" ? null : visitId,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ];

    setDraftByStepId((current) => ({ ...current, [visitId]: "" }));
    setDraftFilesByStepId((current) => ({ ...current, [visitId]: [] }));
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

  const selectedVisit = visits.find((visit) => visit.id === selectedVisitId) ?? visits.at(-1) ?? null;
  const selectedStepId = selectedVisit?.stepId ?? "die";
  const selectedStepName = selectedVisit?.stepName ?? "Die notes";
  const selectedNotes = notesByStepId[selectedStepId] ?? EMPTY_NOTES;
  const latestVisitForSelectedStep = [...visits].reverse().find((visit) => visit.stepId === selectedStepId) ?? null;
  const visibleNotes = selectedNotes.filter((note) =>
    note.processVisitId
      ? note.processVisitId === selectedVisit?.id
      : latestVisitForSelectedStep?.id === selectedVisit?.id || !selectedVisit
  ).sort((first, second) => {
    const difference = getNoteTimeValue(first) - getNoteTimeValue(second);
    return difference;
  });
  const selectedDraftKey = selectedVisit?.id ?? "die";
  const selectedDraft = draftByStepId[selectedDraftKey] ?? "";
  const selectedDraftFiles = draftFilesByStepId[selectedDraftKey] ?? [];
  const selectedStepExecutionId = selectedVisit?.executionId ?? null;
  const selectedStepParameterRecords = selectedVisit?.parameterRecords ?? [];
  const selectedStep = tile.processSteps?.find((step) => step.id === selectedStepId) ?? null;

  return (
    <div className="wafer-step-workspace grid min-h-0 gap-3 md:grid-cols-[210px_minmax(0,1fr)] lg:grid-cols-[224px_minmax(0,1fr)]">
      <section className="wafer-step-history grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-[#e6e6e0] bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-[#eeeeea] px-3 py-2.5">
          <h3 className="text-[13px] font-semibold text-[#111111]">Step history</h3>
          {visits.length > 1 ? (
            <span className="text-[10px] font-semibold text-[#777770] md:hidden">
              Swipe timeline <span aria-hidden>→</span>
            </span>
          ) : null}
        </div>
        <div className="wafer-step-history__scroll min-h-0 overflow-y-auto p-1.5">
          {visits.length ? (
            <SequentialStepPicker
              visits={visits}
              family={tile.family}
              selectedVisitId={selectedVisit?.id}
              onSelectVisit={setSelectedVisitId}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-[#ddddda] bg-white px-4 py-5 text-[13px] font-medium text-[#777770]">
              No step history has been recorded.
            </p>
          )}
        </div>
      </section>

      <section className="wafer-step-detail grid min-h-0 min-w-0 grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-[#e6e6e0] bg-white">
        <div className="row-start-1 min-w-0 w-full border-b border-[#eeeeea] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#1fa69a]" aria-hidden />
              <h3 className="truncate text-[15px] font-semibold text-[#111111]">{selectedStepName}</h3>
              {selectedVisit?.visitNumber && selectedVisit.visitNumber > 1 ? (
                <span className="text-[12px] font-semibold text-[#777770]">Visit {selectedVisit.visitNumber}</span>
              ) : null}
              <span className="text-[13px] font-semibold text-[#8a8a83]">
                {visibleNotes.length} {visibleNotes.length === 1 ? "note" : "notes"}
              </span>
            </div>
            <span className={error ? "text-[12px] font-semibold text-[#a33a2b]" : "text-[12px] font-semibold text-[#777770]"}>
              {error ?? (isSaving ? "Saving..." : savedAt ? `Saved ${formatNoteTime(savedAt)}` : "")}
            </span>
          </div>
        </div>

        {selectedVisit && (selectedVisit.state !== "current" || selectedVisit.completionNote) ? (
          <section className="row-start-2 min-w-0 w-full border-b border-[#eeeeea] bg-[#fbfbf8] px-3 py-2" aria-label="Step completion record">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#777770]">
                {selectedVisit.state === "current" ? "Current visit" : "Completion note"}
              </h4>
              <span className="text-[11px] font-medium text-[#8a8a83]">
                {selectedVisit.completedAt
                  ? formatNoteTime(selectedVisit.completedAt)
                  : selectedVisit.startedAt
                    ? `Started ${formatNoteTime(selectedVisit.startedAt)}`
                    : "Time not recorded"}
              </span>
            </div>
            {selectedVisit.completionNote ? (
              <p className="mt-1 max-w-[75ch] whitespace-pre-wrap text-[12px] leading-5 text-[#3f3f3a]">
                {selectedVisit.completionNote}
              </p>
            ) : (
              <p className="mt-1 text-[11px] font-medium text-[#8a8a83]">
                {selectedVisit.state === "current" ? "This step is currently in progress." : "No completion note was added."}
              </p>
            )}
            {selectedVisit.completionActor.name ? (
              <p className="mt-1 text-[11px] font-medium text-[#92928a]">Recorded by {selectedVisit.completionActor.name}</p>
            ) : null}
          </section>
        ) : null}

        <StepParameterHistory
          key={`${selectedVisit?.id ?? "die"}:${selectedStepParameterRecords[0]?.revision ?? 0}`}
          records={selectedStepParameterRecords}
          templateSchema={selectedStep?.parametersSchema ?? {}}
          projectId={tile.projectId}
          waferId={tile.waferId}
          stepId={selectedStepId}
          stepExecutionId={selectedStepExecutionId}
          canEdit={canEdit && Boolean(selectedVisit)}
          onSave={saveWaferStatusStepParameterRecord}
          className="wafer-step-detail__parameters row-start-3 min-w-0 w-full max-w-full max-h-[250px] overflow-y-auto"
        />

        <div className="wafer-step-detail__notes row-start-4 flex min-h-0 min-w-0 w-full max-w-full flex-col gap-3 overflow-y-auto bg-[#fbfbf8] p-3">
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
                      onClick={() => void deleteNote(selectedStepId, note.id)}
                      disabled={isSaving}
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
                        onClick={() => void saveEdit(selectedStepId, note.id)}
                        disabled={!editValue.trim() || isSaving}
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
        <div className="wafer-step-detail__composer row-start-5 min-w-0 w-full max-w-full border-t border-[#e6e6e0] bg-white p-2">
          <div className="mb-2">
            <PendingNoteAttachments
              files={selectedDraftFiles}
              disabled={isSaving}
              description="Paste an image or attach a file to this note."
              onAddFiles={(files) => void appendDraftFiles(selectedDraftKey, files)}
              onRemoveFile={(file) => setDraftFilesByStepId((current) => ({
                ...current,
                [selectedDraftKey]: (current[selectedDraftKey] ?? []).filter((candidate) => candidate !== file)
              }))}
            />
          </div>
          <div className="wafer-step-detail__composer-row flex min-w-0 items-end gap-1.5">
            <textarea
              id={`wafer-die-note-${selectedDraftKey}`}
              name="waferDieNote"
              value={selectedDraft}
              onChange={(event) => setDraftByStepId((current) => ({
                ...current,
                [selectedDraftKey]: event.target.value.slice(0, MAX_NOTE_LENGTH)
              }))}
              placeholder={`Write a note for ${selectedStepName}...`}
              className="wafer-step-detail__composer-input min-h-10 max-h-20 min-w-0 flex-1 resize-y rounded-md border border-[#deded8] bg-[#fbfbf8] px-3 py-2 text-[14px] leading-5 text-[#111111] outline-none placeholder:text-[#9b9b94] focus:border-[#777770]"
              onPaste={(event) => {
                const pastedImages = getClipboardImageFiles(event.clipboardData);
                if (pastedImages.length > 0) {
                  event.preventDefault();
                  void appendDraftFiles(selectedDraftKey, pastedImages);
                }
              }}
            />
            <button
              type="button"
              onClick={() => void addNote(selectedStepId, selectedStepName, selectedStepExecutionId, selectedDraftKey)}
              disabled={(!selectedDraft.trim() && selectedDraftFiles.length === 0) || isSaving}
              className="h-10 shrink-0 rounded-md bg-[#171714] px-3.5 text-[12px] font-semibold text-white transition-transform hover:bg-[#30302b] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#c9c9c2]"
            >
              Add note
            </button>
          </div>
          {selectedDraft.length ? (
            <p className="mt-1 text-right text-[10px] font-medium text-[#8a8a83]">{selectedDraft.length}/{MAX_NOTE_LENGTH}</p>
          ) : null}
        </div>
        ) : null}
      </section>
    </div>
  );
}
