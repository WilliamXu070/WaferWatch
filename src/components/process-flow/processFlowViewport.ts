import { MAX_SCALE, MIN_SCALE } from "./constants";

export const PROCESS_FLOW_VIEWPORT_VERSION = 1 as const;
const PROCESS_FLOW_VIEWPORT_STORAGE_PREFIX = "waferwatch:process-flow-viewport:v1";
const processFlowViewportMemory = new Map<string, ProcessFlowViewportSnapshot>();

export type ProcessFlowViewportSnapshot = {
  version: typeof PROCESS_FLOW_VIEWPORT_VERSION;
  scale: number;
  centerX: number;
  centerY: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function clampProcessFlowScale(scale: number) {
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function getProcessFlowViewportStorageKey(processId: string) {
  return `${PROCESS_FLOW_VIEWPORT_STORAGE_PREFIX}:${encodeURIComponent(processId)}`;
}

export function serializeProcessFlowViewport(snapshot: ProcessFlowViewportSnapshot) {
  return JSON.stringify(snapshot);
}

export function parseProcessFlowViewport(value: string | null): ProcessFlowViewportSnapshot | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<ProcessFlowViewportSnapshot> | null;
    if (
      !parsed ||
      parsed.version !== PROCESS_FLOW_VIEWPORT_VERSION ||
      !isFiniteNonNegativeNumber(parsed.scale) ||
      !isFiniteNonNegativeNumber(parsed.centerX) ||
      !isFiniteNonNegativeNumber(parsed.centerY)
    ) {
      return null;
    }

    return {
      version: PROCESS_FLOW_VIEWPORT_VERSION,
      scale: clampProcessFlowScale(parsed.scale),
      centerX: parsed.centerX,
      centerY: parsed.centerY
    };
  } catch {
    return null;
  }
}

export function readProcessFlowViewport(storage: StorageLike, processId: string) {
  const remembered = processFlowViewportMemory.get(processId);
  if (remembered) return remembered;

  try {
    const snapshot = parseProcessFlowViewport(storage.getItem(getProcessFlowViewportStorageKey(processId)));
    if (snapshot) processFlowViewportMemory.set(processId, snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

export function rememberProcessFlowViewport(
  processId: string,
  snapshot: ProcessFlowViewportSnapshot
) {
  processFlowViewportMemory.set(processId, snapshot);
}

export function writeProcessFlowViewport(
  storage: StorageLike,
  processId: string,
  snapshot: ProcessFlowViewportSnapshot
) {
  rememberProcessFlowViewport(processId, snapshot);
  try {
    storage.setItem(
      getProcessFlowViewportStorageKey(processId),
      serializeProcessFlowViewport(snapshot)
    );
    return true;
  } catch {
    return false;
  }
}

export function captureProcessFlowViewport({
  scale,
  scrollLeft,
  scrollTop,
  clientWidth,
  clientHeight
}: {
  scale: number;
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
}): ProcessFlowViewportSnapshot {
  const boundedScale = clampProcessFlowScale(scale);
  return {
    version: PROCESS_FLOW_VIEWPORT_VERSION,
    scale: boundedScale,
    centerX: Math.max(0, (scrollLeft + clientWidth / 2) / boundedScale),
    centerY: Math.max(0, (scrollTop + clientHeight / 2) / boundedScale)
  };
}

export function getProcessFlowViewportScrollPosition({
  snapshot,
  clientWidth,
  clientHeight,
  sceneWidth,
  sceneHeight
}: {
  snapshot: ProcessFlowViewportSnapshot;
  clientWidth: number;
  clientHeight: number;
  sceneWidth: number;
  sceneHeight: number;
}) {
  const scale = clampProcessFlowScale(snapshot.scale);
  const maxScrollLeft = Math.max(0, sceneWidth * scale - clientWidth);
  const maxScrollTop = Math.max(0, sceneHeight * scale - clientHeight);
  return {
    scrollLeft: Math.min(maxScrollLeft, Math.max(0, snapshot.centerX * scale - clientWidth / 2)),
    scrollTop: Math.min(maxScrollTop, Math.max(0, snapshot.centerY * scale - clientHeight / 2))
  };
}
