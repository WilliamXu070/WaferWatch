import assert from "node:assert/strict";
import test from "node:test";
import { resolveGestureAxis } from "./gesture";

test("keeps small calendar gestures pending", () => {
  assert.equal(resolveGestureAxis(3, 4), "pending");
});

test("locks calendar movement to the dominant horizontal axis", () => {
  assert.equal(resolveGestureAxis(9, 5), "horizontal");
  assert.equal(resolveGestureAxis(-12, 3), "horizontal");
});

test("releases vertical calendar gestures to page scrolling", () => {
  assert.equal(resolveGestureAxis(4, 10), "vertical");
  assert.equal(resolveGestureAxis(6, 6), "vertical");
});
