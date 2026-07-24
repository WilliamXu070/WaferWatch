import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the checkpoint-note submission action above an iPhone keyboard", async () => {
  const [diagramSource, cssSource] = await Promise.all([
    readFile(new URL("../ProcessFlowDiagram.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/globals.css", import.meta.url), "utf8")
  ]);

  assert.match(diagramSource, /useVisualViewportBottomInset\(\)/);
  assert.match(diagramSource, /<WaferWatchPortal>/);
  assert.match(diagramSource, /flow-wafer-move-dialog-backdrop--keyboard-aware/);
  assert.match(diagramSource, /flow-wafer-move-dialog__content/);
  assert.match(diagramSource, /Submit for review/);
  assert.match(cssSource, /flow-wafer-move-dialog-backdrop--keyboard-aware \{\s*z-index: 220;/);
  assert.match(cssSource, /padding-bottom: var\(--flow-wafer-move-dialog-keyboard-inset, 0px\);/);
  assert.match(cssSource, /max-height: min\(86svh, 760px, calc\(100svh - var\(--flow-wafer-move-dialog-keyboard-inset, 0px\)\)\);/);
  assert.match(cssSource, /grid-template-rows: minmax\(0, 1fr\) auto;/);
  assert.match(cssSource, /flow-wafer-move-dialog--keyboard-aware \.flow-wafer-move-dialog__actions/);
});
