import {
  NODE_CHIP_COLUMNS,
  WAFER_CHIP_GAP_X,
  WAFER_CHIP_GAP_Y,
  WAFER_CHIP_HEIGHT,
  WAFER_CHIP_WIDTH
} from "./constants";

export const WAFER_DRAG_THRESHOLD_PX = 10;

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
