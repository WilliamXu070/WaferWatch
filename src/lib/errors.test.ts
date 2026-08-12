import assert from "node:assert/strict";
import test from "node:test";

import { toErrorMessage } from "./errors";

test("preserves structured PostgREST errors for Process Flow actions", () => {
  assert.equal(
    toErrorMessage({
      code: "55000",
      message: "The canonical operation-run transition is invalid.",
      details: "The execution is missing its current run identity.",
      hint: "Refresh the Process Flow and retry."
    }),
    "The canonical operation-run transition is invalid. | The execution is missing its current run identity. | Refresh the Process Flow and retry."
  );
});

test("keeps the generic fallback for values without a usable message", () => {
  assert.equal(toErrorMessage({ code: "55000" }), "An unexpected error occurred.");
  assert.equal(toErrorMessage({ message: "   " }), "An unexpected error occurred.");
});
