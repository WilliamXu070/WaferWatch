import type { PanePoint, ZoomAnchor } from "./types";

export type TouchPoint = {
  clientX: number;
  clientY: number;
};

const PINCH_ZOOM_EXPONENT = 0.72;
const WHEEL_ZOOM_SENSITIVITY = 0.011;
const MAX_WHEEL_DELTA = 48;

export type TouchGestureTarget = "canvas" | "step" | "wafer";

/**
 * Phone gestures have one ownership rule: only a selected object owns a
 * one-finger gesture. Everything else navigates the viewport.
 */
export function getTouchGestureOwner(
  target: TouchGestureTarget,
  isSelected = false
): "item" | "viewport" {
  return target !== "canvas" && isSelected ? "item" : "viewport";
}

export function getPanScrollPosition({
  startScrollLeft,
  startScrollTop,
  startClientX,
  startClientY,
  clientX,
  clientY
}: {
  startScrollLeft: number;
  startScrollTop: number;
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
}) {
  return {
    scrollLeft: startScrollLeft - (clientX - startClientX),
    scrollTop: startScrollTop - (clientY - startClientY)
  };
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

  const gestureRatio = safeCurrentGestureScale / safeInitialGestureScale;
  return initialAppScale * Math.pow(gestureRatio, PINCH_ZOOM_EXPONENT);
}

export function getWheelZoomTargetScale(
  currentScale: number,
  deltaY: number,
  minScale: number,
  maxScale: number
) {
  const boundedDelta = Math.min(MAX_WHEEL_DELTA, Math.max(-MAX_WHEEL_DELTA, deltaY));
  const targetScale = currentScale * Math.exp(-boundedDelta * WHEEL_ZOOM_SENSITIVITY);
  return Math.min(maxScale, Math.max(minScale, targetScale));
}

export function getZoomScrollPosition(anchor: ZoomAnchor, scale: number) {
  return {
    scrollLeft: anchor.sceneX * scale - anchor.paneX,
    scrollTop: anchor.sceneY * scale - anchor.paneY
  };
}

export function getStableZoomAnchor(
  currentScale: number,
  scrollLeft: number,
  scrollTop: number,
  panePoint: PanePoint,
  pendingAnchor: ZoomAnchor | null = null
): ZoomAnchor {
  const effectiveScroll = pendingAnchor
    ? getZoomScrollPosition(pendingAnchor, currentScale)
    : { scrollLeft, scrollTop };

  return {
    paneX: panePoint.paneX,
    paneY: panePoint.paneY,
    sceneX: (effectiveScroll.scrollLeft + panePoint.paneX) / currentScale,
    sceneY: (effectiveScroll.scrollTop + panePoint.paneY) / currentScale
  };
}

export function getTouchDistance(first: TouchPoint, second: TouchPoint) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

export function getTouchCentroid(points: readonly TouchPoint[]) {
  if (points.length === 0) {
    return null;
  }

  const total = points.reduce(
    (sum, point) => ({ clientX: sum.clientX + point.clientX, clientY: sum.clientY + point.clientY }),
    { clientX: 0, clientY: 0 }
  );
  return {
    clientX: total.clientX / points.length,
    clientY: total.clientY / points.length
  };
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
