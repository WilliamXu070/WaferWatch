import assert from "node:assert/strict";
import test from "node:test";
import UTIF from "utif";
import { decodeTiffFirstPage, isTiffImage } from "./tiffPreview.ts";

test("recognizes TIFF attachments by MIME type or extension", () => {
  assert.equal(isTiffImage("capture.bin", "image/tiff"), true);
  assert.equal(isTiffImage("capture.TIF", "application/octet-stream"), true);
  assert.equal(isTiffImage("capture.tiff", null), true);
  assert.equal(isTiffImage("capture.png", "image/png"), false);
});

test("decodes the first TIFF page into displayable RGBA pixels", () => {
  const pixels = new Uint8Array([
    255, 0, 0, 255,
    0, 128, 255, 255
  ]);
  const tiff = UTIF.encodeImage(pixels.buffer, 2, 1);
  const decoded = decodeTiffFirstPage(tiff);

  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 1);
  assert.equal(decoded.rgba.length, 8);
  assert.deepEqual(Array.from(decoded.rgba.slice(0, 4)), [255, 0, 0, 255]);
});

test("rejects invalid TIFF data with a useful error", () => {
  assert.throws(() => decodeTiffFirstPage(new ArrayBuffer(0)), /TIFF image/);
});
