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

export function getWaferDieNotesScopeKey(waferId: string, dieLabel: string) {
  return `${waferId}:${dieLabel}`;
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
