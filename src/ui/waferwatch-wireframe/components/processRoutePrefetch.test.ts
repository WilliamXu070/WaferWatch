import assert from "node:assert/strict";
import test from "node:test";
import { getProcessRoutesToPrefetch } from "./processRoutePrefetch";

const processId = "process-1";

test("warms every other authenticated process section after the current page", () => {
  assert.deepEqual(
    getProcessRoutesToPrefetch(processId, "", "/dashboard"),
    [
      "/calendar?processId=process-1",
      "/process-flow?processId=process-1",
      "/wafer-status?processId=process-1"
    ]
  );
});

test("keeps wireframe routes scoped to the current app shell", () => {
  assert.deepEqual(
    getProcessRoutesToPrefetch(processId, "/wireframe", "/wireframe/calendar"),
    [
      "/wireframe/dashboard?processId=process-1",
      "/wireframe/process-flow?processId=process-1",
      "/wireframe/wafer-status?processId=process-1"
    ]
  );
});
