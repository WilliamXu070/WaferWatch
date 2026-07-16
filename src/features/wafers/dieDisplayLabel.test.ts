import assert from "node:assert/strict";
import test from "node:test";
import { formatDieDisplayLabel } from "./dieDisplayLabel";

test("abbreviates generated post-dicing labels", () => {
  assert.equal(formatDieDisplayLabel("ALPHA_1"), "A1");
  assert.equal(formatDieDisplayLabel("ALPHA_2"), "A2");
  assert.equal(formatDieDisplayLabel("BETA_3"), "B3");
  assert.equal(formatDieDisplayLabel("custom wafer_12"), "C12");
});

test("preserves labels that are already compact or are not generated die labels", () => {
  assert.equal(formatDieDisplayLabel("A1"), "A1");
  assert.equal(formatDieDisplayLabel("DIE-A1"), "DIE-A1");
  assert.equal(formatDieDisplayLabel(" ALPHA "), "ALPHA");
});
