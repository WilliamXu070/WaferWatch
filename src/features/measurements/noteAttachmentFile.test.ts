import assert from "node:assert/strict";
import test from "node:test";
import {
  isHeicNoteAttachment,
  normalizeNoteAttachmentFile
} from "./noteAttachmentFile";

test("recognizes HEIC and HEIF by canonical MIME type or extension", () => {
  assert.equal(isHeicNoteAttachment("capture.bin", "image/heic"), true);
  assert.equal(isHeicNoteAttachment("capture.bin", "image/heif-sequence"), true);
  assert.equal(isHeicNoteAttachment("capture.HEIC", "application/octet-stream"), true);
  assert.equal(isHeicNoteAttachment("capture.png", "image/png"), false);
});

test("normalizes the actual upload File MIME instead of only its metadata", async () => {
  const octetStreamPng = new File(["png"], "capture.png", {
    type: "application/octet-stream",
    lastModified: 123
  });

  const normalized = await normalizeNoteAttachmentFile(octetStreamPng, async () => {
    throw new Error("HEIC conversion should not run for PNG files.");
  });

  assert.equal(normalized.name, "capture.png");
  assert.equal(normalized.type, "image/png");
  assert.equal(normalized.lastModified, 123);
  assert.equal(await normalized.text(), "png");
});

test("converts octet-stream HEIC files to browser-renderable JPEG files", async () => {
  const heic = new File(["heic"], "IMG_1234.HEIC", {
    type: "application/octet-stream",
    lastModified: 456
  });
  const conversionInputs: Array<{ blob: Blob; toType: string; quality: number }> = [];

  const normalized = await normalizeNoteAttachmentFile(heic, async (input) => {
    conversionInputs.push(input);
    return new Blob(["jpeg"], { type: "image/jpeg" });
  });

  assert.equal(conversionInputs[0]?.blob, heic);
  assert.equal(conversionInputs[0]?.toType, "image/jpeg");
  assert.equal(conversionInputs[0]?.quality, 0.92);
  assert.equal(normalized.name, "IMG_1234.jpg");
  assert.equal(normalized.type, "image/jpeg");
  assert.equal(normalized.lastModified, 456);
  assert.equal(await normalized.text(), "jpeg");
});
