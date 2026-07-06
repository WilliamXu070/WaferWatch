"use client";

import { useCallback, useMemo, useState } from "react";
import { upsertTextSurface } from "@/features/text-surfaces/actions";
import type { WaferStatusTileModel } from "../../types";
import { DetailCard } from "./DetailCard";
import {
  getWaferDieNotesScopeKey,
  waferDieNotesSurface
} from "./waferDieDetailData";

export type WaferDieNote = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type NotesSortOrder = "newest" | "oldest";

const MAX_NOTE_LENGTH = 1600;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const notesSortOptions: Array<{ id: NotesSortOrder; label: string }> = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" }
];

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
    createdAt: timestamp,
    updatedAt: typeof note.updatedAt === "string" && note.updatedAt ? note.updatedAt : timestamp
  };
}

function parsePersistedNotes(value: string | null | undefined) {
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
  if (!legacyNote) {
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
  notes,
  onNotesChange
}: {
  tile: WaferStatusTileModel;
  notes: readonly WaferDieNote[];
  onNotesChange: (notes: WaferDieNote[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [sortOrder, setSortOrder] = useState<NotesSortOrder>("oldest");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const textSurfaceIdentity = useMemo(
    () => ({
      projectId: tile.projectId,
      scopeType: waferDieNotesSurface.scopeType,
      scopeKey: getWaferDieNotesScopeKey(tile.waferId, tile.dieLabel || tile.code),
      fieldKey: waferDieNotesSurface.fieldKey
    }),
    [tile.code, tile.dieLabel, tile.projectId, tile.waferId]
  );
  const visibleNotes = useMemo(
    () =>
      [...notes].sort((first, second) => {
        const difference = getNoteTimeValue(first) - getNoteTimeValue(second);
        return sortOrder === "oldest" ? difference : -difference;
      }),
    [notes, sortOrder]
  );

  const persistNotes = useCallback(
    async (nextNotes: WaferDieNote[], previousNotes: readonly WaferDieNote[]) => {
      onNotesChange(nextNotes);
      setIsSaving(true);
      setError(null);

      const result = await upsertTextSurface({
        ...textSurfaceIdentity,
        value: JSON.stringify(nextNotes)
      });

      setIsSaving(false);
      if (result.ok) {
        setSavedAt(nowIso());
        return;
      }

      onNotesChange([...previousNotes]);
      setError(result.error);
    },
    [onNotesChange, textSurfaceIdentity]
  );

  const addNote = async () => {
    const body = draft.trim();
    if (!body || isSaving) {
      return;
    }

    const timestamp = nowIso();
    const nextNotes = [
      ...notes,
      {
        id: crypto.randomUUID(),
        author: "You",
        body: body.slice(0, MAX_NOTE_LENGTH),
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ];

    setDraft("");
    await persistNotes(nextNotes, notes);
  };

  const startEditing = (note: WaferDieNote) => {
    setEditingId(note.id);
    setEditValue(note.body);
    setError(null);
  };

  const saveEdit = async (noteId: string) => {
    const body = editValue.trim();
    if (!body || isSaving) {
      return;
    }

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
    await persistNotes(nextNotes, notes);
  };

  const deleteNote = async (noteId: string) => {
    if (isSaving) {
      return;
    }

    const nextNotes = notes.filter((note) => note.id !== noteId);
    if (editingId === noteId) {
      setEditingId(null);
      setEditValue("");
    }

    await persistNotes(nextNotes, notes);
  };

  return (
    <DetailCard title="Notes" className="min-h-[520px]">
      <div className="grid gap-5">
        <div className="flex min-h-5 flex-wrap items-center justify-between gap-3 text-[12px] font-semibold">
          <span className="text-[#777770]">{notes.length} {notes.length === 1 ? "note" : "notes"}</span>
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

        {notes.length ? (
          <div className="grid gap-1">
            {visibleNotes.map((note) => (
              <article key={note.id} className="border-b border-[#eeeeea] py-5">
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
                      onClick={() => void deleteNote(note.id)}
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
                        onClick={() => void saveEdit(note.id)}
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
              </article>
            ))}
          </div>
        ) : (
          <EmptyNotesState />
        )}

        <div className="rounded-lg border border-[#e6e6e0] bg-white p-4">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, MAX_NOTE_LENGTH))}
            placeholder="Write a note..."
            className="min-h-[112px] w-full resize-y border-0 bg-transparent text-[14px] leading-6 text-[#111111] outline-none placeholder:text-[#9b9b94]"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#eeeeea] pt-3">
            <p className="text-[12px] font-medium text-[#8a8a83]">
              {draft.length}/{MAX_NOTE_LENGTH}
            </p>
            <button
              type="button"
              onClick={addNote}
              disabled={!draft.trim() || isSaving}
              className="h-10 rounded-lg bg-[#111111] px-4 text-[14px] font-semibold text-white hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#c9c9c2]"
            >
              Add note
            </button>
          </div>
        </div>
      </div>
    </DetailCard>
  );
}
