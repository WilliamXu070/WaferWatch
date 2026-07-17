import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps clipboard paste available for the complete Die Appearance editor", async () => {
  const source = await readFile(new URL("./DieAppearanceCard.tsx", import.meta.url), "utf8");

  assert.match(source, /window\.addEventListener\("paste", handlePaste\)/);
  assert.match(source, /getClipboardImageFiles\(clipboardData\)/);
  assert.match(source, /paste a copied PNG, JPEG, or WebP with ⌘V/);
});
