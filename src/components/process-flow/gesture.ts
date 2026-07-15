import type { PanePoint, ZoomAnchor } from "./types";

export function shouldStartNodePointerInteraction(pointerType: string) {
  return pointerType !== "touch";
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

export function isTouchTapWithinThreshold(
  startClientX: number,
  startClientY: number,
  clientX: number,
  clientY: number,
  threshold = 8
) {
  return Math.hypot(clientX - startClientX, clientY - startClientY) <= threshold;
}
