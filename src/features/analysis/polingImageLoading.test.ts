import assert from "node:assert/strict";
import test from "node:test";
import { POLING_RECORDS } from "./polingData";
import { getPolingImagePreloadOrder } from "./polingImageLoading";

test("poling preload order prioritizes the current image and removes duplicates", () => {
  const selectedImagePath = "/analysis/poling/image47.JPG";
  const paths = getPolingImagePreloadOrder(POLING_RECORDS, selectedImagePath);

  assert.equal(paths[0], selectedImagePath);
  assert.equal(paths.length, 71);
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(paths.filter((path) => path === selectedImagePath).length, 1);
});

test("poling preload order preserves source order when selection is not in the dataset", () => {
  const paths = getPolingImagePreloadOrder(POLING_RECORDS, "/missing.JPG");

  assert.deepEqual(paths.slice(0, 3), [
    "/analysis/poling/image1.JPG",
    "/analysis/poling/image2.JPG",
    "/analysis/poling/image3.JPG"
  ]);
});
