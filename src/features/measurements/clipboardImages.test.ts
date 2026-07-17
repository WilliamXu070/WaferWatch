import assert from "node:assert/strict";
import test from "node:test";
import { getClipboardImageFiles } from "./clipboardImages";

test("returns one image when clipboard items and files expose the same paste", () => {
  const image = new File(["same image"], "screenshot.png", {
    type: "image/png",
    lastModified: 123
  });

  const pasted = getClipboardImageFiles({
    files: [image],
    items: [{ kind: "file", type: "image/png", getAsFile: () => image }]
  });

  assert.equal(pasted.length, 1);
  assert.equal(pasted[0], image);
});

test("uses clipboard items when the direct file list is empty", () => {
  const image = new File(["fallback image"], "", {
    type: "image/jpeg",
    lastModified: 456
  });

  const pasted = getClipboardImageFiles({
    files: [],
    items: [{ kind: "file", type: "image/jpeg", getAsFile: () => image }]
  });

  assert.equal(pasted.length, 1);
  assert.equal(pasted[0].name, "clipboard-image-1.jpg");
});
