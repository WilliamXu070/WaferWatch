export const WAFER_DIE_NOTES_SCOPE_TYPE = "wireframe:wafer_die";
export const WAFER_DIE_NOTES_FIELD_KEY = "notes";

export type DicingNoteSurfaceInput = {
  scope_key: string;
  value: string;
};

export type DicingChildWaferInput = {
  id: string;
  dieLabel: string;
};

export type DicingNoteSurfaceClone = {
  scopeKey: string;
  value: string;
};

type DicingMoveNote = {
  id: string;
  author: string;
  body: string;
  attachments: [];
  processStepId: string;
  processStepName: string;
  createdAt: string;
  updatedAt: string;
};

export function getWaferDieNotesScopeKey(waferId: string, dieLabel: string) {
  return `${waferId}:${dieLabel}`;
}

export function isGeneratedDicedPieceNote(value: string | null | undefined) {
  return Boolean(value?.trim().match(/^Diced piece \S+ from .+\.$/));
}

export function buildDicingNoteSurfaceClones({
  childWafers,
  parentScopeKey,
  surfaces
}: {
  childWafers: readonly DicingChildWaferInput[];
  parentScopeKey: string;
  surfaces: readonly DicingNoteSurfaceInput[];
}): DicingNoteSurfaceClone[] {
  const parentStepPrefix = `${parentScopeKey}:step:`;
  const clones: DicingNoteSurfaceClone[] = [];

  for (const surface of surfaces) {
    if (surface.scope_key !== parentScopeKey && !surface.scope_key.startsWith(parentStepPrefix)) {
      continue;
    }

    const suffix = surface.scope_key.slice(parentScopeKey.length);
    for (const child of childWafers) {
      clones.push({
        scopeKey: `${getWaferDieNotesScopeKey(child.id, child.dieLabel)}${suffix}`,
        value: surface.value
      });
    }
  }

  return clones;
}

function parseNoteArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendDicingMoveNoteToClones({
  childWafers,
  clones,
  dicingStepId,
  dicingStepName,
  noteBody,
  timestamp,
  noteAuthor = "Unknown user"
}: {
  childWafers: readonly DicingChildWaferInput[];
  clones: readonly DicingNoteSurfaceClone[];
  dicingStepId: string;
  dicingStepName: string;
  noteBody: string | null | undefined;
  timestamp: string;
  noteAuthor?: string;
}): DicingNoteSurfaceClone[] {
  const body = noteBody?.trim();
  if (!body) {
    return [...clones];
  }

  const clonesByScopeKey = new Map(clones.map((clone) => [clone.scopeKey, clone.value]));
  for (const child of childWafers) {
    const childStepScopeKey = `${getWaferDieNotesScopeKey(child.id, child.dieLabel)}:step:${dicingStepId}`;
    const existingNotes = parseNoteArray(clonesByScopeKey.get(childStepScopeKey) ?? "[]");
    const note: DicingMoveNote = {
      id: `dicing-move-note:${dicingStepId}`,
      author: noteAuthor.trim() || "Unknown user",
      body,
      attachments: [],
      processStepId: dicingStepId,
      processStepName: dicingStepName,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    if (!existingNotes.some((existing) => {
      if (!existing || typeof existing !== "object") {
        return false;
      }

      const candidate = existing as { id?: unknown; body?: unknown };
      return candidate.id === note.id || candidate.body === note.body;
    })) {
      existingNotes.push(note);
    }

    clonesByScopeKey.set(childStepScopeKey, JSON.stringify(existingNotes));
  }

  return Array.from(clonesByScopeKey, ([scopeKey, value]) => ({ scopeKey, value }));
}
