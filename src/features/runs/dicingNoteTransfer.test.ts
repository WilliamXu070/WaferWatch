import assert from "node:assert/strict";
import test from "node:test";
import {
  appendDicingMoveNoteToClones,
  buildDicingNoteSurfaceClones,
  getWaferDieNotesScopeKey,
  isGeneratedDicedPieceNote
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

test("adds the parent dicing move note to each child dicing step scope", () => {
  const clones = appendDicingMoveNoteToClones({
    childWafers: [
      { id: "child-i1", dieLabel: "I1" },
      { id: "child-i2", dieLabel: "I2" }
    ],
    clones: [
      {
        scopeKey: "child-i1:I1:step:dicing-step",
        value: "[{\"id\":\"existing\",\"body\":\"before dicing\"}]"
      }
    ],
    dicingStepId: "dicing-step",
    dicingStepName: "Dicing",
    noteBody: "Dicing complete, split into die.",
    timestamp: "2026-07-08T12:00:00.000Z"
  });

  const firstChildNotes = JSON.parse(
    clones.find((clone) => clone.scopeKey === "child-i1:I1:step:dicing-step")?.value ?? "[]"
  ) as Array<{ body: string; processStepName?: string }>;
  const secondChildNotes = JSON.parse(
    clones.find((clone) => clone.scopeKey === "child-i2:I2:step:dicing-step")?.value ?? "[]"
  ) as Array<{ body: string; processStepName?: string }>;

  assert.equal(firstChildNotes.length, 2);
  assert.equal(firstChildNotes[1].body, "Dicing complete, split into die.");
  assert.equal(firstChildNotes[1].processStepName, "Dicing");
  assert.equal(secondChildNotes.length, 1);
  assert.equal(secondChildNotes[0].body, "Dicing complete, split into die.");
});

test("detects generated diced-piece wafer notes that should not render as user notes", () => {
  assert.equal(isGeneratedDicedPieceNote("Diced piece I1 from IOTA."), true);
  assert.equal(isGeneratedDicedPieceNote("Diced piece A8 from ALPHA-01."), true);
  assert.equal(isGeneratedDicedPieceNote("User observed rough dicing edge."), false);
});
