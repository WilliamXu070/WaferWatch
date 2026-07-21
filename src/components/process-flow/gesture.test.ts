import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getBoundedPinchAccumulatorScale,
  getPanScrollPosition,
  getPinchTargetScale,
  getNestedWaferTouchOwner,
  getStableZoomAnchor,
  getTouchGestureOwner,
  getTouchCentroid,
  getTouchDistance,
  getWheelZoomTargetScale,
  getZoomScrollPosition,
  isTouchTapWithinThreshold
} from "./gesture";

test("gives one-finger touch ownership only to a selected step or wafer", () => {
  assert.equal(getTouchGestureOwner("canvas"), "viewport");
  assert.equal(getTouchGestureOwner("step", false), "viewport");
  assert.equal(getTouchGestureOwner("wafer", false), "viewport");
  assert.equal(getTouchGestureOwner("step", true), "item");
  assert.equal(getTouchGestureOwner("wafer", true), "item");
});

test("keeps a selected step in control through its unselected wafer hit areas", () => {
  assert.equal(getNestedWaferTouchOwner({ isStepSelected: true, isWaferSelected: false }), "step");
  assert.equal(getNestedWaferTouchOwner({ isStepSelected: true, isWaferSelected: true }), "wafer");
  assert.equal(getNestedWaferTouchOwner({ isStepSelected: false, isWaferSelected: true }), "wafer");
  assert.equal(getNestedWaferTouchOwner({ isStepSelected: false, isWaferSelected: false }), "viewport");
});

test("routes a selected step's nested wafer touch into node drag and preserves a stationary wafer tap", async () => {
  const source = await readFile(new URL("../ProcessFlowDiagram.tsx", import.meta.url), "utf8");

  assert.match(source, /getNestedWaferTouchOwner\(\{[\s\S]*isStepSelected: selectedNodeIds\.has\(node\.id\)[\s\S]*\}\) === "step"/);
  assert.match(source, /pendingTouchStepWaferRef\.current = \{[\s\S]*beginNodeDrag\(event, node\)/);
  assert.match(source, /movedNodes\.length === 0[\s\S]*selectWafer\(pendingWaferTap\.nodeId, wafer\)/);
});

test("pans the viewport from the physical pointer delta regardless of touch target", () => {
  assert.deepEqual(getPanScrollPosition({
    startScrollLeft: 480,
    startScrollTop: 320,
    startClientX: 180,
    startClientY: 240,
    clientX: 220,
    clientY: 190
  }), {
    scrollLeft: 440,
    scrollTop: 370
  });
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
  assert.ok(largeZoom < 0.6);
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

test("uses a moving two-finger centroid to pan even when pinch scale is unchanged", () => {
  const sceneAnchor = getStableZoomAnchor(1, 500, 300, { paneX: 200, paneY: 160 });
  const translatedScroll = getZoomScrollPosition({
    ...sceneAnchor,
    paneX: 240,
    paneY: 190
  }, 1);

  assert.deepEqual(translatedScroll, { scrollLeft: 460, scrollTop: 270 });
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
