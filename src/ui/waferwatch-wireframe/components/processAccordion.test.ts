import assert from "node:assert/strict";
import test from "node:test";
import { toggleExpandedProcessId } from "./processAccordion";

test("opening another process replaces the currently expanded process", () => {
  assert.equal(toggleExpandedProcessId("process-a", "process-b"), "process-b");
});

test("clicking the expanded process collapses it", () => {
  assert.equal(toggleExpandedProcessId("process-a", "process-a"), null);
});
