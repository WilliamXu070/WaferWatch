import assert from "node:assert/strict";
import test from "node:test";
import type { WaferStatusTileModel } from "../types";
import {
  findDeepLinkedWaferStatusTile,
  findInitialWaferStatusTile,
  parseWaferStatusSelectionHash
} from "./waferStatusSelection";

test("reads a die selection from a fragment without changing the server route key", () => {
  assert.deepEqual(
    parseWaferStatusSelectionHash("#waferId=wafer-b&dieLabel=B2"),
    { waferId: "wafer-b", dieLabel: "B2" }
  );
  assert.deepEqual(
    parseWaferStatusSelectionHash("waferId=wafer-a"),
    { waferId: "wafer-a", dieLabel: undefined }
  );
  assert.equal(parseWaferStatusSelectionHash("#dieLabel=B2"), null);
});

const tiles: WaferStatusTileModel[] = [
  {
    id: "die-a1",
    projectId: "project-1",
    waferId: "wafer-a",
    code: "A1",
    family: "ALPHA",
    dieLabel: "A1",
    stepLabel: "Cleaning",
    status: "queued",
    waferStateName: "post-dice",
    mode: "diced",
    isSelected: true
  },
  {
    id: "die-b2",
    projectId: "project-1",
    waferId: "wafer-b",
    code: "B2",
    family: "BETA",
    dieLabel: "B2",
    stepLabel: "EBL",
    status: "litho",
    waferStateName: "post-dice",
    mode: "diced"
  }
];

test("normal Status navigation selects the overview tile without a deep-link target", () => {
  const deepLinkedTile = findDeepLinkedWaferStatusTile(tiles);

  assert.equal(deepLinkedTile, null);
  assert.equal(findInitialWaferStatusTile(tiles, deepLinkedTile)?.id, "die-a1");
});

test("explicit wafer and die identifiers select only that die for detail navigation", () => {
  const deepLinkedTile = findDeepLinkedWaferStatusTile(tiles, "wafer-b", "B2");

  assert.equal(deepLinkedTile?.id, "die-b2");
  assert.equal(findInitialWaferStatusTile(tiles, deepLinkedTile)?.id, "die-b2");
  assert.equal(findDeepLinkedWaferStatusTile(tiles, "missing-wafer"), null);
});
