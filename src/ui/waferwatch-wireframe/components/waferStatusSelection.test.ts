import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { WaferStatusTileModel } from "../types";
import {
  findDeepLinkedWaferStatusTile,
  findInitialWaferStatusTile
} from "./waferStatusSelection";

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

test("explicit query targets remount the Status view without a fragment transition", async () => {
  const [pageSource, viewSource] = await Promise.all([
    readFile(new URL("../../../app/(app)/wafer-status/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("./WaferStatusView.tsx", import.meta.url), "utf8")
  ]);

  assert.match(pageSource, /requestedWaferId \?\? "overview"/);
  assert.match(pageSource, /initialWaferId=\{requestedWaferId\}/);
  assert.match(pageSource, /processId=\{requestedProcessId\}/);
  assert.match(pageSource, /initialDetailTab=\{requestedTab\}/);
  assert.match(pageSource, /value === "history" \? "history" : "overview"/);
  assert.match(viewSource, /readWaferStatusResumeState/);
  assert.match(viewSource, /if \(initialWaferId\)/);
  assert.doesNotMatch(viewSource, /window\.location\.hash|parseWaferStatusSelectionHash/);
});
