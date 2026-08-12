import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPolingDomain,
  createPolingFullDomain,
  panPolingDomainByClientDelta,
  type PolingDomain
} from "./polingViewport";

test("always gives nonempty datasets a zero pulse floor", () => {
  assert.deepEqual(createPolingFullDomain([400, 500], [50, 200]), {
    xmin: 395,
    xmax: 505,
    ymin: 0,
    ymax: 208
  });
  assert.deepEqual(createPolingFullDomain([400], [100]), {
    xmin: 395,
    xmax: 405,
    ymin: 0,
    ymax: 105
  });
});

test("clamps a translated viewport at zero without changing its span", () => {
  const fullDomain = { xmin: 300, xmax: 550, ymin: 0, ymax: 2_100 };
  assert.deepEqual(
    clampPolingDomain({ xmin: 350, xmax: 450, ymin: -120, ymax: 380 }, fullDomain),
    { xmin: 350, xmax: 450, ymin: 0, ymax: 500 }
  );
});

test("converts a diagonal mouse drag against the rendered plot area", () => {
  const domain: PolingDomain = { xmin: 350, xmax: 450, ymin: 250, ymax: 750 };
  const fullDomain: PolingDomain = { xmin: 250, xmax: 550, ymin: 0, ymax: 1_000 };
  assert.deepEqual(
    panPolingDomainByClientDelta({
      domain,
      fullDomain,
      deltaX: -40,
      deltaY: 25,
      renderedPlotWidth: 400,
      renderedPlotHeight: 200
    }),
    { xmin: 340, xmax: 440, ymin: 312.5, ymax: 812.5 }
  );
});

test("keeps each axis independent when a diagonal drag reaches the pulse floor", () => {
  const domain: PolingDomain = { xmin: 350, xmax: 450, ymin: 0, ymax: 500 };
  const fullDomain: PolingDomain = { xmin: 250, xmax: 550, ymin: 0, ymax: 1_000 };
  assert.deepEqual(
    panPolingDomainByClientDelta({
      domain,
      fullDomain,
      deltaX: 40,
      deltaY: -25,
      renderedPlotWidth: 400,
      renderedPlotHeight: 200
    }),
    { xmin: 360, xmax: 460, ymin: 0, ymax: 500 }
  );
});
