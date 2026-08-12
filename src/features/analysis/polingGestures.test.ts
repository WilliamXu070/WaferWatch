import assert from "node:assert/strict";
import test from "node:test";
import {
  POLING_WHEEL_BURST_IDLE_MS,
  PolingWheelGestureClassifier,
  classifyPolingWheelSample,
  getPolingPanDelta,
  getPolingZoomFactor,
  normalizePolingWheelDelta,
  type PolingWheelSample
} from "./polingGestures";

function sample(overrides: Partial<PolingWheelSample> = {}): PolingWheelSample {
  return {
    ctrlKey: false,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 42,
    clientX: 200,
    clientY: 150,
    ...overrides
  };
}

test("classifies deterministic pinch, mouse-wheel, and trackpad signals", () => {
  assert.equal(classifyPolingWheelSample(sample({ ctrlKey: true }), "auto"), "zoom");
  assert.equal(classifyPolingWheelSample(sample({ deltaMode: 1 }), "auto"), "zoom");
  assert.equal(
    classifyPolingWheelSample(sample({ deltaX: 18, deltaY: 42 }), "auto"),
    "pan"
  );
  assert.equal(classifyPolingWheelSample(sample({ deltaY: 2.5 }), "auto"), "pan");
  assert.equal(classifyPolingWheelSample(sample(), "auto"), "ambiguous");
  assert.equal(classifyPolingWheelSample(sample(), "mouse"), "zoom");
  assert.equal(classifyPolingWheelSample(sample(), "trackpad"), "pan");
  assert.equal(
    classifyPolingWheelSample(sample({ deltaX: 0, deltaY: 0 }), "auto"),
    "none"
  );
});

test("pans a rapid continuous vertical trackpad burst without losing the first event", () => {
  const classifier = new PolingWheelGestureClassifier();
  const first = classifier.ingest(sample({ deltaY: 42 }), 1_000, "auto");
  const second = classifier.ingest(sample({ deltaY: 38 }), 1_012, "auto");

  assert.deepEqual(first, { actions: [], pending: true });
  assert.equal(second.pending, false);
  assert.deepEqual(
    second.actions.map(({ modality, sample: actionSample }) => [
      modality,
      actionSample.deltaY
    ]),
    [
      ["pan", 42],
      ["pan", 38]
    ]
  );
});

test("turns an isolated ambiguous notch into one mouse zoom", () => {
  const classifier = new PolingWheelGestureClassifier();
  assert.equal(classifier.ingest(sample({ deltaY: 100 }), 1_000, "auto").pending, true);
  assert.deepEqual(classifier.flushPendingAsMouse(), {
    actions: [{ modality: "zoom", sample: sample({ deltaY: 100 }) }],
    pending: false
  });
  assert.deepEqual(classifier.flushPendingAsMouse(), { actions: [], pending: false });
});

test("classifies a wheel-like repeating burst as zoom and locks it until idle", () => {
  const classifier = new PolingWheelGestureClassifier();
  classifier.ingest(sample({ deltaY: 100 }), 1_000, "auto");
  const resolved = classifier.ingest(sample({ deltaY: 100 }), 1_025, "auto");
  const momentum = classifier.ingest(sample({ deltaY: 2 }), 1_040, "auto");
  const afterIdle = classifier.ingest(
    sample({ deltaX: 8, deltaY: 10 }),
    1_040 + POLING_WHEEL_BURST_IDLE_MS + 1,
    "auto"
  );

  assert.deepEqual(resolved.actions.map((action) => action.modality), ["zoom", "zoom"]);
  assert.deepEqual(momentum.actions.map((action) => action.modality), ["zoom"]);
  assert.deepEqual(afterIdle.actions.map((action) => action.modality), ["pan"]);
});

test("pinch cancels a pending ambiguous sample and zooms immediately", () => {
  const classifier = new PolingWheelGestureClassifier();
  classifier.ingest(sample({ deltaY: 48 }), 1_000, "auto");
  const pinch = classifier.ingest(
    sample({ ctrlKey: true, deltaX: 3, deltaY: -8 }),
    1_010,
    "auto"
  );

  assert.deepEqual(pinch.actions.map((action) => action.modality), ["zoom"]);
  assert.deepEqual(classifier.flushPendingAsMouse(), { actions: [], pending: false });
});

test("normalizes wheel units and keeps pan and zoom proportional", () => {
  assert.equal(normalizePolingWheelDelta(3, 1), 48);
  assert.equal(normalizePolingWheelDelta(1, 2), 240);
  assert.deepEqual(getPolingPanDelta(sample({ deltaX: 18, deltaY: 42 })), {
    deltaX: 18,
    deltaY: -42
  });

  const zoomIn = getPolingZoomFactor(-8);
  const zoomOut = getPolingZoomFactor(8);
  assert.ok(zoomIn < 1);
  assert.ok(zoomOut > 1);
  assert.ok(Math.abs(zoomIn * zoomOut - 1) < 0.000001);
  assert.equal(getPolingZoomFactor(-10_000), getPolingZoomFactor(-32));
  assert.equal(getPolingZoomFactor(10_000), getPolingZoomFactor(32));
});
