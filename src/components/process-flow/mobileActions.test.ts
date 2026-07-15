import assert from "node:assert/strict";
import test from "node:test";
import { getAvailableWaferMoveTargets, getSelectedLinkedStepEdge } from "./mobileActions";
import type { FlowEdge, FlowNode } from "./types";

const nodes: FlowNode[] = [
  { id: "start", label: "Start", subLabel: "", wafers: [], x: 0, y: 0, width: 10, height: 10, role: "start", order: 1 },
  { id: "dicing", label: "Dicing", subLabel: "", wafers: [], x: 0, y: 20, width: 10, height: 10, role: "normal", order: 2 },
  { id: "complete", label: "Complete", subLabel: "", wafers: [], x: 0, y: 40, width: 10, height: 10, role: "end", order: 3 }
];

const edges: FlowEdge[] = [
  { id: "start-dicing", from: "start", to: "dicing", kind: "flow" },
  { id: "dicing-complete", from: "dicing", to: "complete", kind: "flow" }
];

test("offers every other step because graph edges are visual only", () => {
  assert.deepEqual(
    getAvailableWaferMoveTargets(nodes, edges, "dicing").map((node) => node.id),
    ["start", "complete"]
  );
});

test("finds the outgoing flow edge for one selected step", () => {
  assert.equal(getSelectedLinkedStepEdge(edges, new Set(["dicing"]))?.id, "dicing-complete");
  assert.equal(getSelectedLinkedStepEdge(edges, new Set(["start", "dicing"])), null);
});
