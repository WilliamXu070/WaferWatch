import assert from "node:assert/strict";
import test from "node:test";
import { createLatestFrameQueue } from "./latestFrameQueue";

test("flushes only the latest drag position once per animation frame", () => {
  let scheduled: (() => void) | null = null;
  const flushed: number[] = [];
  const queue = createLatestFrameQueue<number>({
    cancel: () => {
      scheduled = null;
    },
    flush: (value) => flushed.push(value),
    schedule: (callback) => {
      scheduled = callback;
      return 1;
    }
  });

  for (let value = 1; value <= 20; value += 1) {
    queue.push(value);
  }

  assert.equal(flushed.length, 0);
  assert.ok(scheduled);
  (scheduled as () => void)();
  assert.deepEqual(flushed, [20]);
});

test("cancels a queued drag render during gesture cleanup", () => {
  let scheduled: (() => void) | null = null;
  let cancelledFrameId: number | null = null;
  const flushed: number[] = [];
  const queue = createLatestFrameQueue<number>({
    cancel: (frameId) => {
      cancelledFrameId = frameId;
      scheduled = null;
    },
    flush: (value) => flushed.push(value),
    schedule: (callback) => {
      scheduled = callback;
      return 7;
    }
  });

  queue.push(42);
  queue.clear();

  assert.equal(cancelledFrameId, 7);
  assert.equal(scheduled, null);
  assert.deepEqual(flushed, []);
});
