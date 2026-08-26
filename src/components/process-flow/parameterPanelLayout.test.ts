import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the mobile parameter panel clears the bottom navigation and visible keyboard", async () => {
  const [componentSource, cssSource] = await Promise.all([
    readFile(new URL("StepParameterEntryDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/globals.css", import.meta.url), "utf8")
  ]);

  assert.match(componentSource, /useVisualViewportBottomInset\(\)/);
  assert.match(componentSource, /--process-flow-parameter-keyboard-inset/);
  assert.match(
    cssSource,
    /bottom: calc\(76px \+ env\(safe-area-inset-bottom\) \+ var\(--process-flow-parameter-keyboard-inset, 0px\)\);/
  );
  assert.match(
    cssSource,
    /max-height: min\(92svh, 820px, calc\(100svh - 76px - env\(safe-area-inset-bottom\) - var\(--process-flow-parameter-keyboard-inset, 0px\)\)\);/
  );
});
