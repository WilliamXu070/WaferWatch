import assert from "node:assert/strict";
import test from "node:test";
import { safeAuthRedirectPath } from "./password-recovery";

test("allows internal authentication redirect paths", () => {
  assert.equal(safeAuthRedirectPath("/reset-password"), "/reset-password");
  assert.equal(safeAuthRedirectPath("/dashboard?view=compact"), "/dashboard?view=compact");
});

test("rejects external and protocol-relative authentication redirects", () => {
  assert.equal(safeAuthRedirectPath("https://example.com"), "/dashboard");
  assert.equal(safeAuthRedirectPath("//example.com"), "/dashboard");
  assert.equal(safeAuthRedirectPath(undefined), "/dashboard");
});
