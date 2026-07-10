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
