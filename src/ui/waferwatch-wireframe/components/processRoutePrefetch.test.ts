import assert from "node:assert/strict";
import test from "node:test";
import {
  getProcessRoutesToPrefetch,
  shouldFullyPrefetchProcessRoute
} from "./processRoutePrefetch";

test("warms every other authenticated process section after the current page", () => {
  assert.deepEqual(
    getProcessRoutesToPrefetch("/dashboard"),
    [
      "/calendar",
      "/process-flow",
      "/wafer-status"
    ]
  );
});

test("warms Status first from Process Flow so die detail navigation reuses it", () => {
  assert.deepEqual(
    getProcessRoutesToPrefetch("/process-flow"),
    [
      "/wafer-status",
      "/dashboard",
      "/calendar"
    ]
  );
});

test("fully prefetches the two data-heavy routes used for rapid status switching", () => {
  assert.equal(shouldFullyPrefetchProcessRoute("process-flow"), true);
  assert.equal(shouldFullyPrefetchProcessRoute("wafer-status"), true);
  assert.equal(shouldFullyPrefetchProcessRoute("dashboard"), false);
  assert.equal(shouldFullyPrefetchProcessRoute("calendar"), false);
});
