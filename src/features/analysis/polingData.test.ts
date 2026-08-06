import assert from "node:assert/strict";
import test from "node:test";
import { POLING_RECORDS } from "./polingData";

test("poling dataset preserves every source condition and embedded image reference", () => {
  assert.equal(POLING_RECORDS.length, 74);
  assert.equal(new Set(POLING_RECORDS.map((record) => record.imagePath)).size, 71);
  assert.deepEqual(
    POLING_RECORDS.map((record) => record.imagePath).slice(0, 3),
    [
      "/analysis/poling/image1.JPG",
      "/analysis/poling/image2.JPG",
      "/analysis/poling/image3.JPG"
    ]
  );
});

test("slide 18 is explicitly marked as reusing slide 12 microscopy images", () => {
  const slide18 = POLING_RECORDS.filter((record) => record.slide === 18);

  assert.equal(slide18.length, 3);
  assert.deepEqual(
    slide18.map((record) => record.imagePath),
    [
      "/analysis/poling/image45.JPG",
      "/analysis/poling/image46.JPG",
      "/analysis/poling/image47.JPG"
    ]
  );
  assert.ok(slide18.every((record) => record.flag?.includes("slide 12")));
});
