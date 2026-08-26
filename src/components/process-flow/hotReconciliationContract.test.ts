import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("V2 applies the returned movement delta and leaves ordinary recovery to ordered revisions", async () => {
  const source = await readFile(new URL("../ProcessFlowDiagram.tsx", import.meta.url), "utf8");

  assert.match(source, /if \(directDeltaReconciliation\) \{[\s\S]{0,120}applyProcessWorkspaceDelta\(batchResult\.data\.delta\)/);
  assert.equal(source.match(/if \(!directDeltaReconciliation\) router\.refresh\(\);/g)?.length, 3);
});
