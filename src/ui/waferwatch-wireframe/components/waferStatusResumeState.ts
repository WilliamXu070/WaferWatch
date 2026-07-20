import { dieDetailTabs, type DieDetailTab } from "./wafer-die-detail/waferDieDetailData";

const RESUME_STATE_VERSION = 1;
const RESUME_STATE_PREFIX = "waferwatch:wafer-status:resume:";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type WaferStatusResumeState = {
  version: typeof RESUME_STATE_VERSION;
  selected: {
    waferId: string;
    dieLabel: string | null;
  };
  detail: boolean;
  tab: DieDetailTab;
};

const detailTabIds = new Set<string>(dieDetailTabs.map((tab) => tab.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDieDetailTab(value: unknown): value is DieDetailTab {
  return typeof value === "string" && detailTabIds.has(value);
}

export function getWaferStatusResumeStorageKey(processId: string) {
  return `${RESUME_STATE_PREFIX}${processId}`;
}

export function readWaferStatusResumeState(
  storage: StorageLike | null | undefined,
  processId: string
): WaferStatusResumeState | null {
  if (!storage || !processId) return null;

  try {
    const raw = storage.getItem(getWaferStatusResumeStorageKey(processId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== RESUME_STATE_VERSION || !isRecord(value.selected)) {
      return null;
    }
    if (typeof value.selected.waferId !== "string" || !value.selected.waferId ||
      (value.selected.dieLabel !== null && typeof value.selected.dieLabel !== "string") ||
      typeof value.detail !== "boolean" || !isDieDetailTab(value.tab)) {
      return null;
    }

    return {
      version: RESUME_STATE_VERSION,
      selected: {
        waferId: value.selected.waferId,
        dieLabel: value.selected.dieLabel
      },
      detail: value.detail,
      tab: value.tab
    };
  } catch {
    return null;
  }
}

export function writeWaferStatusResumeState(
  storage: StorageLike | null | undefined,
  processId: string,
  state: WaferStatusResumeState
) {
  if (!storage || !processId) return;

  try {
    storage.setItem(getWaferStatusResumeStorageKey(processId), JSON.stringify(state));
  } catch {
    // Status remains usable when browser storage is unavailable or full.
  }
}

export function clearWaferStatusResumeState(
  storage: StorageLike | null | undefined,
  processId: string
) {
  if (!storage || !processId) return;

  try {
    storage.removeItem(getWaferStatusResumeStorageKey(processId));
  } catch {
    // Status remains usable when browser storage is unavailable.
  }
}
