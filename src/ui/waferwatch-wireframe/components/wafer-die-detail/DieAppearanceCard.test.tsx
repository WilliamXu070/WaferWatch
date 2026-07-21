import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps clipboard paste available for the complete Die Appearance editor", async () => {
  const source = await readFile(new URL("./DieAppearanceCard.tsx", import.meta.url), "utf8");

  assert.match(source, /window\.addEventListener\("paste", handlePaste\)/);
  assert.match(source, /getClipboardImageFiles\(clipboardData\)/);
  assert.match(source, /Choose, drop, or paste a PNG, JPEG, or WebP image/);
  assert.match(source, /useDropzone\(\{/);
  assert.match(source, /data-die-appearance-dropzone/);
  assert.match(source, /Drop to \{attachmentId \? "replace image" : "add image"\}/);
});

test("does not mount the native appearance picker in read-only status", async () => {
  const source = await readFile(new URL("./DieAppearanceCard.tsx", import.meta.url), "utf8");

  assert.match(source, /\{canEdit \? \(\s*<input[\s\S]*?name="dieAppearanceImage"/);
});
