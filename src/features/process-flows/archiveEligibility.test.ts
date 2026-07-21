import test from "node:test";
import assert from "node:assert/strict";
import { isArchiveEligibleAfterCurrentStep } from "./archiveEligibility";

test("allows archive only after the current process step is completed", () => {
  assert.equal(isArchiveEligibleAfterCurrentStep("completed"), true);
  assert.equal(isArchiveEligibleAfterCurrentStep("ready_to_move"), false);
  assert.equal(isArchiveEligibleAfterCurrentStep("running"), false);
  assert.equal(isArchiveEligibleAfterCurrentStep(null), false);
});
