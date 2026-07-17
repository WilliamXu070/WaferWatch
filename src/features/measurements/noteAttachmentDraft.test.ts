import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_NOTE_ATTACHMENTS,
  mergeNoteAttachmentFiles,
  NOTE_ATTACHMENT_MAX_BYTES,
  prepareNoteAttachmentFiles
} from "./noteAttachmentDraft";

function makeFile(name: string, size = 12, lastModified = 123) {
  return new File([new Uint8Array(size)], name, {
    type: "image/png",
    lastModified
  });
}

test("does not add the same pending attachment more than once", () => {
  const image = makeFile("screenshot.png");
  const repeatedPaste = makeFile("screenshot.png", image.size, image.lastModified + 1000);
  const merged = mergeNoteAttachmentFiles([image], [repeatedPaste]);

  assert.equal(merged.files.length, 1);
  assert.equal(merged.duplicateCount, 1);
});

test("deduplicates the same image content across paste and file picker names", async () => {
  const pasted = new File(["same image"], "clipboard.png", { type: "image/png" });
  const picked = new File(["same image"], "original-screenshot.png", { type: "image/png" });
  const different = new File(["other image"], "another-screenshot.png", { type: "image/png" });

  await prepareNoteAttachmentFiles([pasted, picked, different]);
  const merged = mergeNoteAttachmentFiles([pasted], [picked, different]);

  assert.deepEqual(merged.files, [pasted, different]);
  assert.equal(merged.duplicateCount, 1);
});

test("enforces attachment size and count limits in one shared queue", () => {
  const files = Array.from({ length: MAX_NOTE_ATTACHMENTS + 2 }, (_, index) => (
    makeFile(`screenshot-${index}.png`, 12, index)
  ));
  const oversized = makeFile("oversized.png", NOTE_ATTACHMENT_MAX_BYTES + 1);
  const merged = mergeNoteAttachmentFiles([], [...files, oversized]);

  assert.equal(merged.files.length, MAX_NOTE_ATTACHMENTS);
  assert.equal(merged.overflowCount, 2);
  assert.equal(merged.oversizedCount, 1);
});
