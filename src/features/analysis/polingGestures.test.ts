import assert from "node:assert/strict";
import test from "node:test";
import { getPolingWheelIntent } from "./polingGestures";

test("ordinary two-finger trackpad movement pans on both axes", () => {
  assert.deepEqual(
    getPolingWheelIntent({ ctrlKey: false, deltaX: 18, deltaY: 42 }),
    { kind: "pan", deltaX: 18, deltaY: -42 }
  );
  assert.deepEqual(
    getPolingWheelIntent({ ctrlKey: false, deltaX: -24, deltaY: 0 }),
    { kind: "pan", deltaX: -24, deltaY: -0 }
  );
});

test("trackpad pinch remains zoom-only", () => {
  assert.deepEqual(
    getPolingWheelIntent({ ctrlKey: true, deltaX: 7, deltaY: -12 }),
    { kind: "zoom", factor: 0.84 }
  );
  assert.deepEqual(
    getPolingWheelIntent({ ctrlKey: true, deltaX: 7, deltaY: 12 }),
    { kind: "zoom", factor: 1.2 }
  );
});
