import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Process Flow acknowledges a committed transition instead of leaving it queued", async () => {
  const source = await readFile(new URL("../ProcessFlowDiagram.tsx", import.meta.url), "utf8");
  const persistedIndex = source.indexOf("const persisted = result.data;");
  const savedFeedbackIndex = source.indexOf('setMoveMessage(savedTransitionCount === 1 ? "Transition saved."');

  assert.ok(persistedIndex >= 0, "the transition response should be read after a successful command");
  assert.ok(savedFeedbackIndex > persistedIndex, "a committed transition must replace queued save feedback");
  assert.match(
    source,
    /await onCreateTransition\([\s\S]*?\)\.catch\(\(error\): \{ ok: false; error: string \} =>/,
    "a transport failure should enter the existing retry path instead of leaving a transition queued"
  );
});
