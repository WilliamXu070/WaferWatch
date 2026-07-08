import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDicingNoteSurfaceClones,
  getWaferDieNotesScopeKey
} from "./dicingNoteTransfer.ts";

test("copies parent wafer general and step notes to every diced child wafer scope", () => {
  const parentScopeKey = getWaferDieNotesScopeKey("parent-wafer", "ALPHA-01");
  const clones = buildDicingNoteSurfaceClones({
    parentScopeKey,
    childWafers: [
      { id: "child-a1", dieLabel: "A1" },
      { id: "child-a2", dieLabel: "A2" }
    ],
    surfaces: [
      { scope_key: parentScopeKey, value: "[{\"body\":\"parent note\"}]" },
      { scope_key: `${parentScopeKey}:step:step-clean`, value: "[{\"body\":\"clean note\"}]" },
      { scope_key: "unrelated-wafer:A1", value: "[]" }
    ]
  });

  assert.deepEqual(
    clones.map((clone) => clone.scopeKey).sort(),
    [
      "child-a1:A1",
      "child-a1:A1:step:step-clean",
      "child-a2:A2",
      "child-a2:A2:step:step-clean"
    ].sort()
  );
  assert.equal(clones.find((clone) => clone.scopeKey === "child-a1:A1")?.value, "[{\"body\":\"parent note\"}]");
});
