import assert from "node:assert/strict";
import test from "node:test";
import { isDicedParentWafer } from "./waferVisibility";

test("hides parent wafers replaced by persisted dicing children", () => {
  assert.equal(isDicedParentWafer({ diced_child_wafer_ids: ["child-1"] }), true);
  assert.equal(isDicedParentWafer({ diced_child_die_labels: ["A1", "A2"] }), true);
});

test("keeps ordinary wafers and incomplete dicing metadata visible", () => {
  assert.equal(isDicedParentWafer({}), false);
  assert.equal(isDicedParentWafer({ diced_child_wafer_ids: [] }), false);
  assert.equal(isDicedParentWafer({ diced_child_die_labels: [null, " "] }), false);
  assert.equal(isDicedParentWafer(null), false);
});
