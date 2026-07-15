export type TouchPoint = {
  clientX: number;
  clientY: number;
};

export function shouldStartNodePointerInteraction(pointerType: string) {
  return pointerType !== "touch";
}

export function getPinchTargetScale(
  initialAppScale: number,
  initialGestureScale: number,
  currentGestureScale: number
) {
  const safeInitialGestureScale = Number.isFinite(initialGestureScale) && initialGestureScale > 0
    ? initialGestureScale
    : 1;
  const safeCurrentGestureScale = Number.isFinite(currentGestureScale) && currentGestureScale > 0
    ? currentGestureScale
    : safeInitialGestureScale;

  return initialAppScale * (safeCurrentGestureScale / safeInitialGestureScale);
}

export function getTouchDistance(first: TouchPoint, second: TouchPoint) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

export function getBoundedPinchAccumulatorScale(
  currentAppScale: number,
  previousDistance: number,
  currentDistance: number,
  minScale: number,
  maxScale: number
) {
  return Math.min(
    maxScale,
    Math.max(
      minScale,
      getPinchTargetScale(currentAppScale, previousDistance, currentDistance)
    )
  );
}

export function isTouchTapWithinThreshold(
  startClientX: number,
  startClientY: number,
  clientX: number,
  clientY: number,
  threshold = 8
) {
  return Math.hypot(clientX - startClientX, clientY - startClientY) <= threshold;
}
