import assert from "node:assert/strict";
import test from "node:test";
import {
  getProcessFlowFallbackHref,
  isPersistedProcessStepId
} from "./stepParameterRoute";

test("redirects temporary or stale parameter targets back to the selected process", () => {
  assert.equal(isPersistedProcessStepId("temp-step-playwright-loop"), false);
  assert.equal(
    getProcessFlowFallbackHref("9fb7de9e-31b8-4b5a-aea7-8ee64eedb699"),
    "/process-flow?processId=9fb7de9e-31b8-4b5a-aea7-8ee64eedb699"
  );
});

test("keeps persisted UUID step targets eligible for the parameter editor", () => {
  assert.equal(isPersistedProcessStepId("53d4d014-9275-4ec3-b714-a612eb14aaee"), true);
});
