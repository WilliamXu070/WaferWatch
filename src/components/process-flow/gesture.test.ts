import assert from "node:assert/strict";
import test from "node:test";
import {
  getBoundedPinchAccumulatorScale,
  getPinchTargetScale,
  getStableZoomAnchor,
  getTouchDistance,
  getTouchPanScrollPosition,
  getZoomScrollPosition,
  isTouchTapWithinThreshold,
  shouldStartNodePointerInteraction
} from "./gesture";
import { clampScale } from "./labels";

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

test("derives physical pinch scale from the distance between two touch pointers", () => {
  const initialDistance = getTouchDistance(
    { clientX: 120, clientY: 300 },
    { clientX: 220, clientY: 300 }
  );
  const expandedDistance = getTouchDistance(
    { clientX: 95, clientY: 300 },
    { clientX: 245, clientY: 300 }
  );
  const contractedDistance = getTouchDistance(
    { clientX: 145, clientY: 300 },
    { clientX: 195, clientY: 300 }
  );

  assert.equal(getPinchTargetScale(0.5, initialDistance, expandedDistance), 0.75);
  assert.equal(getPinchTargetScale(0.5, initialDistance, contractedDistance), 0.25);
});

test("converts one-finger movement into canvas scrolling without native page pan", () => {
  assert.deepEqual(getTouchPanScrollPosition(
    620,
    263,
    { clientX: 195, clientY: 500 },
    { clientX: 145, clientY: 440 }
  ), {
    scrollLeft: 670,
    scrollTop: 323
  });
});

test("rebases one-finger scrolling so reversing at a canvas edge responds immediately", () => {
  const nextScroll = getTouchPanScrollPosition(
    0,
    120,
    { clientX: 250, clientY: 400 },
    { clientX: 240, clientY: 400 }
  );

  assert.equal(nextScroll.scrollLeft, 10);
  assert.equal(nextScroll.scrollTop, 120);
});

test("rebases bounded pinch zoom so reversing at maximum scale responds immediately", () => {
  const cappedScale = getBoundedPinchAccumulatorScale(2, 100, 150, 0.35, 2.6);
  const rebasedReverseScale = getBoundedPinchAccumulatorScale(cappedScale, 150, 140, 0.35, 2.6);
  const fixedBaselineReverseScale = clampScale(getPinchTargetScale(2, 100, 140));

  assert.equal(cappedScale, 2.6);
  assert.ok(rebasedReverseScale < cappedScale);
  assert.equal(fixedBaselineReverseScale, cappedScale);
});

test("keeps sub-pixel pinch progress between rendered scale updates", () => {
  let accumulatorScale = 0.35;
  let previousDistance = 100;

  for (const currentDistance of [101, 102, 103, 104, 105]) {
    accumulatorScale = getBoundedPinchAccumulatorScale(
      accumulatorScale,
      previousDistance,
      currentDistance,
      0.35,
      2.6
    );
    previousDistance = currentDistance;
  }

  assert.equal(clampScale(accumulatorScale), 0.37);
});

test("keeps the same scene point under the visible pane center while zooming", () => {
  const center = { paneX: 195, paneY: 250 };
  const anchor = getStableZoomAnchor(0.5, 805, 350, center);
  const nextViewport = getZoomScrollPosition(anchor, 0.65);

  assert.deepEqual(anchor, {
    paneX: 195,
    paneY: 250,
    sceneX: 2000,
    sceneY: 1200
  });
  assert.deepEqual(nextViewport, {
    scrollLeft: 1105,
    scrollTop: 530
  });
});

test("uses the pending viewport when another zoom frame arrives before layout commits", () => {
  const center = { paneX: 195, paneY: 250 };
  const firstAnchor = getStableZoomAnchor(0.5, 805, 350, center);
  const secondAnchor = getStableZoomAnchor(
    0.65,
    805,
    350,
    center,
    firstAnchor
  );

  assert.deepEqual(secondAnchor, firstAnchor);
});

test("distinguishes a deliberate touch tap from a moving gesture", () => {
  assert.equal(isTouchTapWithinThreshold(100, 100, 105, 104), true);
  assert.equal(isTouchTapWithinThreshold(100, 100, 109, 100), false);
});
