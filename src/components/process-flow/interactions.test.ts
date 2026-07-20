import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canMoveSelectedProcessStep,
  canMoveSelectedWafer,
  getProcessMoveActionNote,
  getStepParametersNavigation,
  getStepDoubleClickAction,
  getWaferDetailsHref,
  getWaferDetailsPrefetchHref,
  getNearestWaferGridIndex,
  getWaferDragCaptureTarget,
  hasCrossedWaferDragThreshold,
  shouldEndWaferDragFromFrameEvent,
  shouldCommitWaferDrop
} from "./interactions";

test("uses the same canonical query URL for die navigation and prefetch", () => {
  assert.equal(getWaferDetailsHref({
    processTemplateId: "process-123",
    waferId: "wafer-456",
    dieLabel: " BETA_2 "
  }), "/wafer-status?processId=process-123&waferId=wafer-456&dieLabel=BETA_2");
  assert.equal(getWaferDetailsHref({
    processTemplateId: "process-123",
    waferId: "wafer-456"
  }), "/wafer-status?processId=process-123&waferId=wafer-456");
  assert.equal(getWaferDetailsHref({
    processTemplateId: "process-123",
    waferId: "wafer-456",
    dieLabel: "BETA_2",
    detailTab: "history"
  }), "/wafer-status?processId=process-123&waferId=wafer-456&dieLabel=BETA_2&tab=history");
  assert.equal(getWaferDetailsHref({ waferId: "wafer-456" }), null);
  assert.equal(getWaferDetailsPrefetchHref({
    processTemplateId: "process-123",
    waferId: "wafer-456",
    dieLabel: "BETA_2",
    detailTab: "history"
  }), "/wafer-status?processId=process-123&waferId=wafer-456&dieLabel=BETA_2&tab=history");
});

test("mounts a full-route prefetch link for the exact hovered die destination", async () => {
  const source = await readFile(new URL("../ProcessFlowDiagram.tsx", import.meta.url), "utf8");

  assert.match(source, /href=\{waferDetailsFullPrefetchHref\}/);
  assert.match(source, /prefetch=\{true\}/);
});

test("defers parameter navigation until a newly added step has a persisted id", () => {
  assert.deepEqual(getStepParametersNavigation({
    stepId: "temp-step-new-cleaning",
    processTemplateId: "process-123"
  }), { kind: "defer" });

  assert.deepEqual(getStepParametersNavigation({
    stepId: "53d4d014-9275-4ec3-b714-a612eb14aaee",
    processTemplateId: "process-123"
  }), {
    kind: "navigate",
    href: "/process-flow/steps/53d4d014-9275-4ec3-b714-a612eb14aaee/parameters?processId=process-123"
  });
});

test("keeps title double-clicks for rename and routes the rest of a step to parameters", () => {
  assert.equal(getStepDoubleClickAction({ x: 80, y: 32, nodeWidth: 392 }), "rename");
  assert.equal(getStepDoubleClickAction({ x: 20, y: 32, nodeWidth: 392 }), "parameters");
  assert.equal(getStepDoubleClickAction({ x: 180, y: 74, nodeWidth: 392 }), "parameters");
  assert.equal(getStepDoubleClickAction({ x: 360, y: 32, nodeWidth: 392 }), "parameters");
});

test("allows destination moves without an operator note while keeping checkpoint notes explicit", () => {
  assert.equal(getProcessMoveActionNote("move", "", "Cleaning"), "Moved to Cleaning.");
  assert.equal(getProcessMoveActionNote("move", "  custom context  ", "Cleaning"), "custom context");
  assert.equal(getProcessMoveActionNote("submit", "", "Cleaning · Complete"), "");
});

test("keeps stationary and jittering wafer presses as clicks", () => {
  assert.equal(hasCrossedWaferDragThreshold({
    startClientX: 100,
    startClientY: 100,
    clientX: 100,
    clientY: 100
  }), false);
  assert.equal(hasCrossedWaferDragThreshold({
    startClientX: 100,
    startClientY: 100,
    clientX: 106,
    clientY: 106
  }), false);
});

test("starts a wafer drag after intentional physical movement", () => {
  assert.equal(hasCrossedWaferDragThreshold({
    startClientX: 100,
    startClientY: 100,
    clientX: 110,
    clientY: 100
  }), true);
});

test("requires a prior die selection before a gesture can move it", () => {
  assert.equal(canMoveSelectedWafer(false), false);
  assert.equal(canMoveSelectedWafer(true), true);
});

test("requires a prior step selection before a layout drag can begin", () => {
  assert.equal(canMoveSelectedProcessStep(false), false);
  assert.equal(canMoveSelectedProcessStep(true), true);
});

test("routes an iPhone wafer drag through the stable canvas frame from touch-down", () => {
  assert.equal(getWaferDragCaptureTarget("touch"), "frame");
  assert.equal(getWaferDragCaptureTarget("mouse"), "source");
  assert.equal(getWaferDragCaptureTarget("pen"), "source");
});

test("does not let the SVG-to-frame capture hand-off cancel an iPhone wafer gesture", () => {
  assert.equal(shouldEndWaferDragFromFrameEvent("pointerleave"), false);
  assert.equal(shouldEndWaferDragFromFrameEvent("pointerup"), true);
  assert.equal(shouldEndWaferDragFromFrameEvent("pointercancel"), true);
});

test("maps either phone lane to the nearest existing wafer chip", () => {
  assert.equal(getNearestWaferGridIndex({ x: 20, y: 12, waferCount: 4 }), 0);
  assert.equal(getNearestWaferGridIndex({ x: 88, y: 12, waferCount: 4 }), 1);
  assert.equal(getNearestWaferGridIndex({ x: 20, y: 52, waferCount: 4 }), 2);
  assert.equal(getNearestWaferGridIndex({ x: 88, y: 52, waferCount: 4 }), 3);
  assert.equal(getNearestWaferGridIndex({ x: 20, y: 90, waferCount: 3 }), 2);
  assert.equal(getNearestWaferGridIndex({ x: 20, y: 12, waferCount: 0 }), null);
});

test("commits a wafer drop only from a completed pointer-up gesture", () => {
  assert.equal(shouldCommitWaferDrop("pointerup", true), true);
  assert.equal(shouldCommitWaferDrop("pointerup", false), false);
  assert.equal(shouldCommitWaferDrop("pointercancel", true), false);
});
