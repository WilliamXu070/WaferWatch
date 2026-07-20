import assert from "node:assert/strict";
import test from "node:test";
import { getVisualViewportBottomInset } from "./visualViewportInset";

test("returns the keyboard-covered space below the visual viewport", () => {
  assert.equal(getVisualViewportBottomInset({
    layoutViewportHeight: 844,
    visualViewportHeight: 844,
    visualViewportOffsetTop: 0
  }), 0);
  assert.equal(getVisualViewportBottomInset({
    layoutViewportHeight: 844,
    visualViewportHeight: 510,
    visualViewportOffsetTop: 0
  }), 334);
  assert.equal(getVisualViewportBottomInset({
    layoutViewportHeight: 844,
    visualViewportHeight: 510,
    visualViewportOffsetTop: 20
  }), 314);
});
