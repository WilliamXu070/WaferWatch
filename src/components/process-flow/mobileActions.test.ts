import assert from "node:assert/strict";
import test from "node:test";
import { getAvailableWaferMoveTargets, getSelectedLinkedStepEdge } from "./mobileActions";
import type { FlowEdge, FlowNode } from "./types";

const nodes: FlowNode[] = [
  { id: "start", label: "Start", subLabel: "", wafers: [], x: 0, y: 0, width: 10, height: 10, role: "start", executionMode: "main", order: 1, parametersSchema: {}, revision: 1 },
  { id: "dicing", label: "Dicing", subLabel: "", wafers: [], x: 0, y: 20, width: 10, height: 10, role: "normal", executionMode: "main", order: 2, parametersSchema: {}, revision: 1 },
  { id: "piranha", label: "Piranha", subLabel: "", wafers: [], x: 20, y: 20, width: 10, height: 10, role: "normal", executionMode: "anytime", order: 3, parametersSchema: {}, revision: 1 },
  { id: "complete", label: "Complete", subLabel: "", wafers: [], x: 0, y: 40, width: 10, height: 10, role: "end", executionMode: "main", order: 4, parametersSchema: {}, revision: 1 }
];

const edges: FlowEdge[] = [
  { id: "start-dicing", from: "start", to: "dicing", kind: "flow" },
  { id: "dicing-complete", from: "dicing", to: "complete", kind: "flow" }
];

test("offers every other step because graph edges are visual only", () => {
  assert.deepEqual(
    getAvailableWaferMoveTargets(nodes, edges, "dicing").map((node) => node.id),
    ["piranha", "start", "complete"]
  );
});

test("prioritizes the recorded main-flow return step from an anytime procedure", () => {
  assert.deepEqual(
    getAvailableWaferMoveTargets(nodes, edges, "piranha", "dicing").map((node) => node.id),
    ["dicing", "start", "complete"]
  );
});

test("finds the outgoing flow edge for one selected step", () => {
  assert.equal(getSelectedLinkedStepEdge(edges, new Set(["dicing"]))?.id, "dicing-complete");
  assert.equal(getSelectedLinkedStepEdge(edges, new Set(["start", "dicing"])), null);
});
