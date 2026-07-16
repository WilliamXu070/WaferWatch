import assert from "node:assert/strict";
import test from "node:test";
import {
  getProcessMoveActionNote,
  getStepDoubleClickAction,
  getNearestWaferGridIndex,
  hasCrossedWaferDragThreshold,
  shouldCommitWaferDrop
} from "./interactions";

test("keeps title double-clicks for rename and routes the rest of a step to parameters", () => {
  assert.equal(getStepDoubleClickAction({ x: 80, y: 32, nodeWidth: 392 }), "rename");
  assert.equal(getStepDoubleClickAction({ x: 20, y: 32, nodeWidth: 392 }), "parameters");
  assert.equal(getStepDoubleClickAction({ x: 180, y: 74, nodeWidth: 392 }), "parameters");
  assert.equal(getStepDoubleClickAction({ x: 360, y: 32, nodeWidth: 392 }), "parameters");
});

test("allows destination moves without an operator note while keeping checkpoint notes explicit", () => {
  assert.equal(getProcessMoveActionNote("move", "", "Cleaning"), "Moved to Cleaning.");
  assert.equal(getProcessMoveActionNote("move", "  custom context  ", "Cleaning"), "custom context");
  assert.equal(getProcessMoveActionNote("submit", "", "Cleaning · Complete"), "");
});

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

test("maps either phone lane to the nearest existing wafer chip", () => {
  assert.equal(getNearestWaferGridIndex({ x: 20, y: 12, waferCount: 4 }), 0);
  assert.equal(getNearestWaferGridIndex({ x: 88, y: 12, waferCount: 4 }), 1);
  assert.equal(getNearestWaferGridIndex({ x: 20, y: 52, waferCount: 4 }), 2);
  assert.equal(getNearestWaferGridIndex({ x: 88, y: 52, waferCount: 4 }), 3);
  assert.equal(getNearestWaferGridIndex({ x: 20, y: 90, waferCount: 3 }), 2);
  assert.equal(getNearestWaferGridIndex({ x: 20, y: 12, waferCount: 0 }), null);
});

test("commits a wafer drop only from a completed pointer-up gesture", () => {
  assert.equal(shouldCommitWaferDrop("pointerup", true), true);
  assert.equal(shouldCommitWaferDrop("pointerup", false), false);
  assert.equal(shouldCommitWaferDrop("pointercancel", true), false);
});
