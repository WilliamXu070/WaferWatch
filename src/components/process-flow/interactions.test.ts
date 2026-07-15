import assert from "node:assert/strict";
import test from "node:test";
import { getNearestWaferGridIndex, hasCrossedWaferDragThreshold } from "./interactions";

test("keeps stationary and jittering wafer presses as clicks", () => {
  assert.equal(hasCrossedWaferDragThreshold({
    startClientX: 100,
    startClientY: 100,
    clientX: 100,
    clientY: 100
  }), false);
  assert.equal(hasCrossedWaferDragThreshold({
    startClientX: 100,
    startClientY: 100,
    clientX: 106,
    clientY: 106
  }), false);
});

test("starts a wafer drag after intentional physical movement", () => {
  assert.equal(hasCrossedWaferDragThreshold({
    startClientX: 100,
    startClientY: 100,
    clientX: 110,
    clientY: 100
  }), true);
});

test("maps a phone Complete-lane press to the nearest existing wafer chip", () => {
  assert.equal(getNearestWaferGridIndex({ x: 20, y: 12, waferCount: 4 }), 0);
  assert.equal(getNearestWaferGridIndex({ x: 88, y: 12, waferCount: 4 }), 1);
  assert.equal(getNearestWaferGridIndex({ x: 20, y: 52, waferCount: 4 }), 2);
  assert.equal(getNearestWaferGridIndex({ x: 88, y: 52, waferCount: 4 }), 3);
  assert.equal(getNearestWaferGridIndex({ x: 20, y: 90, waferCount: 3 }), 2);
  assert.equal(getNearestWaferGridIndex({ x: 20, y: 12, waferCount: 0 }), null);
});
