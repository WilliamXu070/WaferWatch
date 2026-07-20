import assert from "node:assert/strict";
import test from "node:test";
import { getProcessRoutesToPrefetch } from "./processRoutePrefetch";

const processId = "process-1";

test("warms every other authenticated process section after the current page", () => {
  assert.deepEqual(
    getProcessRoutesToPrefetch(processId, "/dashboard"),
    [
      "/calendar?processId=process-1",
      "/process-flow?processId=process-1",
      "/wafer-status?processId=process-1"
    ]
  );
});

test("warms Status first from Process Flow so die detail navigation reuses it", () => {
  assert.deepEqual(
    getProcessRoutesToPrefetch(processId, "/process-flow"),
    [
      "/wafer-status?processId=process-1",
      "/dashboard?processId=process-1",
      "/calendar?processId=process-1"
    ]
  );
});
