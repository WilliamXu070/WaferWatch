import assert from "node:assert/strict";
import test from "node:test";
import { hasCrossedWaferDragThreshold } from "./interactions";

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
