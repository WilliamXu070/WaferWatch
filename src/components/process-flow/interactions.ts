import {
  NODE_CHIP_COLUMNS,
  WAFER_CHIP_GAP_X,
  WAFER_CHIP_GAP_Y,
  WAFER_CHIP_HEIGHT,
  WAFER_CHIP_WIDTH
} from "./constants";

export const WAFER_DRAG_THRESHOLD_PX = 10;

export function getStepDoubleClickAction({
  x,
  y,
  nodeWidth
}: {
  x: number;
  y: number;
  nodeWidth: number;
}): "rename" | "parameters" {
  const isNearTitle = x >= 50 && x <= nodeWidth - 88 && y >= 8 && y <= 52;
  return isNearTitle ? "rename" : "parameters";
}

export function getProcessMoveActionNote(kind: "submit" | "move", note: string, targetLabel: string) {
  const trimmedNote = note.trim();
  if (trimmedNote || kind === "submit") return trimmedNote;
  return `Moved to ${targetLabel}.`;
}

export function hasCrossedWaferDragThreshold({
  startClientX,
  startClientY,
  clientX,
  clientY,
  threshold = WAFER_DRAG_THRESHOLD_PX
}: {
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
  threshold?: number;
}) {
  return Math.hypot(clientX - startClientX, clientY - startClientY) >= threshold;
}

export function getNearestWaferGridIndex({
  x,
  y,
  waferCount
}: {
  x: number;
  y: number;
  waferCount: number;
}) {
  if (waferCount <= 0) {
    return null;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < waferCount; index += 1) {
    const centerX = (index % NODE_CHIP_COLUMNS) * WAFER_CHIP_GAP_X + WAFER_CHIP_WIDTH / 2;
    const centerY = Math.floor(index / NODE_CHIP_COLUMNS) * WAFER_CHIP_GAP_Y + WAFER_CHIP_HEIGHT / 2;
    const distance = Math.hypot(x - centerX, y - centerY);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  return nearestIndex;
}

export function shouldCommitWaferDrop(eventType: string, hasMoved: boolean) {
  return eventType === "pointerup" && hasMoved;
}
