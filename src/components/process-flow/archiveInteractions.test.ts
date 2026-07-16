import test from "node:test";
import assert from "node:assert/strict";
import {
  areWafersArchivable,
  getBeginningLaneRestoreTarget,
  isClientPointInsideRect
} from "./archiveInteractions";
import type { FlowNode } from "./types";

const node: FlowNode = {
  id: "step-1",
  label: "Clean",
  subLabel: "Cleaning",
  wafers: [],
  x: 100,
  y: 200,
  width: 400,
  height: 180,
  role: "normal",
  executionMode: "main",
  order: 1,
  parametersSchema: {}
};

test("archives only when every dragged wafer has a completed assignment", () => {
  assert.equal(areWafersArchivable([{ isArchivable: true }, { isArchivable: true }]), true);
  assert.equal(areWafersArchivable([{ isArchivable: true }, { isArchivable: false }]), false);
  assert.equal(areWafersArchivable([]), false);
});

test("detects the archive dock in client coordinates", () => {
  const rect = { left: 20, right: 100, top: 300, bottom: 360 };
  assert.equal(isClientPointInsideRect({ x: 60, y: 330 }, rect), true);
  assert.equal(isClientPointInsideRect({ x: 120, y: 330 }, rect), false);
});

test("restores only onto the Beginning half of a node", () => {
  assert.equal(getBeginningLaneRestoreTarget([node], { x: 160, y: 260 })?.id, node.id);
  assert.equal(getBeginningLaneRestoreTarget([node], { x: 360, y: 260 }), null);
  assert.equal(getBeginningLaneRestoreTarget([node], { x: 160, y: 420 }), null);
});
