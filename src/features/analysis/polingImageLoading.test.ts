import assert from "node:assert/strict";
import test from "node:test";
import catalog from "./polingCatalog.json";
import type { PolingRecord } from "./polingData";
import {
  POLING_IMAGE_PRELOAD_LIMIT,
  getPolingImagePreloadOrder
} from "./polingImageLoading";

const POLING_RECORDS = catalog.records as readonly PolingRecord[];

test("poling preload stays bounded and prioritizes the current image", () => {
  const selected = POLING_RECORDS.find((record) => record.imagePath);
  assert.ok(selected?.imagePath);

  const paths = getPolingImagePreloadOrder(POLING_RECORDS, selected.id);

  assert.equal(paths[0], selected.imagePath);
  assert.equal(paths.length, POLING_IMAGE_PRELOAD_LIMIT);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.length < POLING_RECORDS.filter((record) => record.imagePath).length);
});

test("a data-only selection warms nearby images but skips null paths", () => {
  const selected = POLING_RECORDS.find((record) => !record.imagePath);
  assert.ok(selected);

  const paths = getPolingImagePreloadOrder(POLING_RECORDS, selected.id, 5);

  assert.ok(paths.length > 0);
  assert.ok(paths.length <= 5);
  assert.ok(paths.every((path) => typeof path === "string" && path.length > 0));
});

test("unknown selection falls back to a bounded source-order window", () => {
  const paths = getPolingImagePreloadOrder(POLING_RECORDS, "missing", 3);
  const expected = POLING_RECORDS.filter((record) => record.imagePath)
    .slice(0, 3)
    .map((record) => record.imagePath);

  assert.deepEqual(paths, expected);
});
