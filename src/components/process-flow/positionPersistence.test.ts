import assert from "node:assert/strict";
import test from "node:test";
import {
  getExpectedCanvasPosition,
  getStableLayoutCenter,
  hasCanvasPositionChanged,
  resolveCanvasPosition,
  targetsSameCanvasPosition
} from "./positionPersistence";

test("chains a newer drag behind the position batch already in flight", () => {
  assert.deepEqual(getExpectedCanvasPosition({
    inFlight: {
      canvasX: 200,
      canvasY: 300,
      expectedCanvasX: 20,
      expectedCanvasY: 30
    },
    server: { x: 20, y: 30 }
  }), { x: 200, y: 300 });

  assert.deepEqual(getExpectedCanvasPosition({
    queued: {
      canvasX: 250,
      canvasY: 350,
      expectedCanvasX: 20,
      expectedCanvasY: 30
    },
    inFlight: {
      canvasX: 200,
      canvasY: 300,
      expectedCanvasX: 20,
      expectedCanvasY: 30
    },
    server: { x: 20, y: 30 }
  }), { x: 20, y: 30 });
});

test("uses the graph center so repeated Organize clicks cannot drift with viewport changes", () => {
  assert.deepEqual(getStableLayoutCenter([
    { x: 100, y: 200, width: 480, height: 150 },
    { x: 100, y: 500, width: 480, height: 150 }
  ], { x: 2_000, y: 2_000 }), { x: 340, y: 425 });
  assert.deepEqual(getStableLayoutCenter([], { x: 2_000, y: 2_000 }), { x: 2_000, y: 2_000 });
});

test("detects only canvas positions that Organize actually changed", () => {
  assert.equal(hasCanvasPositionChanged({ x: 20, y: 40 }, { x: 20, y: 40 }), false);
  assert.equal(hasCanvasPositionChanged({ x: 20, y: 40 }, { x: 21, y: 40 }), true);
});

test("keeps an organized position while a stale server graph is replayed", () => {
  assert.deepEqual(resolveCanvasPosition({
    local: { x: 200, y: 300 },
    server: { x: 20, y: 30 },
    protectedTarget: { x: 200, y: 300 }
  }), {
    position: { x: 200, y: 300 },
    settled: false
  });
});

test("releases the local position after the server reaches its protected target", () => {
  assert.deepEqual(resolveCanvasPosition({
    local: { x: 200, y: 300 },
    server: { x: 200, y: 300 },
    protectedTarget: { x: 200, y: 300 }
  }), {
    position: { x: 200, y: 300 },
    settled: true
  });
});

test("does not let an older failed save clear a newer protected target", () => {
  assert.equal(
    targetsSameCanvasPosition({ x: 300, y: 400 }, { x: 200, y: 300 }),
    false
  );
  assert.equal(
    targetsSameCanvasPosition({ x: 200, y: 300 }, { x: 200, y: 300 }),
    true
  );
});
