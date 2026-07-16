import assert from "node:assert/strict";
import test from "node:test";
import {
  getWaferFamilyDeleteIds,
  isLegacyDeletedWaferFamily,
  keepExistingWaferFamilyDeleteIds,
  readDeletedWaferIds
} from "./waferDeletion";

test("deleting a diced parent includes every recorded and discovered child wafer", () => {
  assert.deepEqual(
    getWaferFamilyDeleteIds(
      "parent-id",
      { diced_child_wafer_ids: ["child-1", "child-2", "child-1", null] },
      ["child-2", "child-3"]
    ),
    ["parent-id", "child-1", "child-2", "child-3"]
  );
});

test("deleting one diced child does not delete its parent or sibling dies", () => {
  assert.deepEqual(
    getWaferFamilyDeleteIds(
      "child-1",
      { parent_wafer_id: "parent-id", diced_child_wafer_ids: ["child-2"] },
      ["unexpected-child"]
    ),
    ["child-1"]
  );
});

test("deleting the final diced child also deletes the hidden completed parent", () => {
  assert.deepEqual(
    getWaferFamilyDeleteIds(
      "child-1",
      { parent_wafer_id: "parent-id" },
      ["child-1"]
    ),
    ["child-1", "parent-id"]
  );
});

test("drops stale recorded children before calling the strict family delete transaction", () => {
  const candidates = getWaferFamilyDeleteIds(
    "parent-id",
    { diced_child_wafer_ids: ["missing-child"] },
    []
  );

  assert.deepEqual(keepExistingWaferFamilyDeleteIds(candidates, ["parent-id"]), ["parent-id"]);
});

test("reads every server-confirmed family member for immediate client reconciliation", () => {
  assert.deepEqual(readDeletedWaferIds({
    deletedWaferIds: ["child-id", "parent-id", "child-id", null]
  }), ["child-id", "parent-id"]);
  assert.deepEqual(readDeletedWaferIds(null), []);
});

test("recognizes only completed legacy parents whose diced children are all gone", () => {
  const metadata = {
    created_from: "process_flow_add_wafer",
    dicing_completed_at: "2026-07-15T13:00:34.662Z",
    diced_child_wafer_ids: ["child-1", "child-2"]
  };

  assert.equal(isLegacyDeletedWaferFamily({
    assignmentStatuses: ["completed"],
    discoveredChildIds: [],
    metadata,
    waferStatus: "completed"
  }), true);
  assert.equal(isLegacyDeletedWaferFamily({
    assignmentStatuses: ["completed"],
    discoveredChildIds: ["child-1"],
    metadata,
    waferStatus: "completed"
  }), false);
  assert.equal(isLegacyDeletedWaferFamily({
    assignmentStatuses: ["in_progress"],
    discoveredChildIds: [],
    metadata,
    waferStatus: "in_progress"
  }), false);
});
