import assert from "node:assert/strict";
import test from "node:test";
import {
  getBoundedPinchAccumulatorScale,
  getPinchTargetScale,
  getStableZoomAnchor,
  getTouchCentroid,
  getTouchDistance,
  getWheelZoomTargetScale,
  getZoomScrollPosition,
  isTouchTapWithinThreshold,
  shouldStartNodePointerInteraction,
  supportsWebKitGestureEvents
} from "./gesture";

test("keeps touch gestures from selecting or dragging process-flow steps", () => {
  assert.equal(shouldStartNodePointerInteraction("touch"), false);
});

test("preserves mouse and pen step editing", () => {
  assert.equal(shouldStartNodePointerInteraction("mouse"), true);
  assert.equal(shouldStartNodePointerInteraction("pen"), true);
});

test("dampens pinch zoom while keeping outward and inward motion reciprocal", () => {
  const expandedScale = getPinchTargetScale(1, 1, 1.25);
  const restoredScale = getPinchTargetScale(expandedScale, 1.25, 1);

  assert.ok(expandedScale > 1);
  assert.ok(expandedScale < 1.25);
  assert.ok(Math.abs(restoredScale - 1) < 0.000001);
});

test("uses bounded proportional wheel zoom instead of fixed scale jumps", () => {
  const smallZoom = getWheelZoomTargetScale(0.35, -8, 0.35, 2.6);
  const largeZoom = getWheelZoomTargetScale(0.35, -100, 0.35, 2.6);
  const boundedLargeZoom = getWheelZoomTargetScale(0.35, -10_000, 0.35, 2.6);

  assert.ok(smallZoom > 0.35);
  assert.ok(smallZoom < largeZoom);
  assert.equal(largeZoom, boundedLargeZoom);
  assert.ok(largeZoom < 0.38);
});

test("detects Safari gesture events so iPhone pinch has one input owner", () => {
  assert.equal(supportsWebKitGestureEvents({ ongesturestart: null }), true);
  assert.equal(supportsWebKitGestureEvents({ GestureEvent: class GestureEvent {} }), true);
  assert.equal(supportsWebKitGestureEvents({ PointerEvent: class PointerEvent {} }), false);
});

test("keeps the same scene point anchored across queued zoom frames", () => {
  const panePoint = { paneX: 200, paneY: 160 };
  const firstAnchor = getStableZoomAnchor(1, 500, 300, panePoint);
  const firstTargetScroll = getZoomScrollPosition(firstAnchor, 1.1);
  const queuedAnchor = getStableZoomAnchor(1.1, 500, 300, panePoint, firstAnchor);
  const queuedTargetScroll = getZoomScrollPosition(queuedAnchor, 1.2);

  assert.ok(Math.abs(firstTargetScroll.scrollLeft - 570) < 0.000001);
  assert.ok(Math.abs(firstTargetScroll.scrollTop - 346) < 0.000001);
  assert.equal(queuedAnchor.sceneX, firstAnchor.sceneX);
  assert.equal(queuedAnchor.sceneY, firstAnchor.sceneY);
  assert.ok(Math.abs(queuedTargetScroll.scrollLeft - 640) < 0.000001);
  assert.ok(Math.abs(queuedTargetScroll.scrollTop - 392) < 0.000001);
});

test("derives pinch scale from two touch pointers and rebases at a zoom boundary", () => {
  const initialDistance = getTouchDistance(
    { clientX: 120, clientY: 300 },
    { clientX: 220, clientY: 300 }
  );
  const expandedDistance = getTouchDistance(
    { clientX: 45, clientY: 300 },
    { clientX: 295, clientY: 300 }
  );
  const cappedScale = getBoundedPinchAccumulatorScale(2, initialDistance, expandedDistance, 0.35, 2.6);
  const reversedScale = getBoundedPinchAccumulatorScale(cappedScale, expandedDistance, 240, 0.35, 2.6);

  assert.equal(cappedScale, 2.6);
  assert.ok(reversedScale < cappedScale);
});

test("anchors pinch zoom to the actual two-finger centroid", () => {
  assert.deepEqual(getTouchCentroid([
    { clientX: 80, clientY: 180 },
    { clientX: 220, clientY: 320 }
  ]), { clientX: 150, clientY: 250 });
  assert.equal(getTouchCentroid([]), null);
});

test("distinguishes a deliberate touch tap from a moving gesture", () => {
  assert.equal(isTouchTapWithinThreshold(100, 100, 105, 104), true);
  assert.equal(isTouchTapWithinThreshold(100, 100, 109, 100), false);
});
