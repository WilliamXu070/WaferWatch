import assert from "node:assert/strict";
import test from "node:test";
import {
  getBoundedPinchAccumulatorScale,
  getPinchTargetScale,
  getTouchDistance,
  isTouchTapWithinThreshold,
  shouldStartNodePointerInteraction
} from "./gesture";

test("keeps touch gestures from selecting or dragging process-flow steps", () => {
  assert.equal(shouldStartNodePointerInteraction("touch"), false);
});

test("preserves mouse and pen step editing", () => {
  assert.equal(shouldStartNodePointerInteraction("mouse"), true);
  assert.equal(shouldStartNodePointerInteraction("pen"), true);
});

test("calculates pinch zoom symmetrically from one stable gesture baseline", () => {
  assert.equal(getPinchTargetScale(1, 1, 1.25), 1.25);
  assert.equal(getPinchTargetScale(1, 1, 0.8), 0.8);
  assert.equal(getPinchTargetScale(0.8, 0.8, 1), 1);
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

test("distinguishes a deliberate touch tap from a moving gesture", () => {
  assert.equal(isTouchTapWithinThreshold(100, 100, 105, 104), true);
  assert.equal(isTouchTapWithinThreshold(100, 100, 109, 100), false);
});
