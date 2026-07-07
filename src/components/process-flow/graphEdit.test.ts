import assert from "node:assert/strict";
import test from "node:test";
import { findEdgeSplitCandidate, splitEdgeWithNode } from "./graphEdit";
import { getVisibleNodeSubtitle } from "./labels";
import type { FlowEdge, FlowNode } from "./types";

test("finds an existing edge when a new node is created near the connection", () => {
  const nodes = [
    makeNode("clean", 100, 100, 1, "Clean"),
    makeNode("poling", 460, 100, 2, "Poling"),
    makeNode("inspect", 460, 360, 3, "Inspect")
  ];
  const edges: FlowEdge[] = [
    { id: "clean-poling", from: "clean", to: "poling", kind: "flow" },
    { id: "poling-inspect", from: "poling", to: "inspect", kind: "flow" }
  ];

  const candidate = findEdgeSplitCandidate({ x: 340, y: 167 }, edges, nodes, 28);

  assert.equal(candidate?.edge.id, "clean-poling");
});

test("splits one transition into source-to-new and new-to-target transitions", () => {
  const [first, second] = splitEdgeWithNode(
    { id: "clean-poling", from: "clean", to: "poling", kind: "flow" },
    "new-step"
  );

  assert.equal(first.from, "clean");
  assert.equal(first.to, "new-step");
  assert.equal(first.kind, "flow");
  assert.equal(second.from, "new-step");
  assert.equal(second.to, "poling");
  assert.equal(second.kind, "flow");
});

test("suppresses duplicated node subtitle text", () => {
  assert.equal(getVisibleNodeSubtitle("Poling", "poling"), null);
  assert.equal(getVisibleNodeSubtitle("Fixture poling", "Poling"), "Poling");
});

function makeNode(id: string, x: number, y: number, order: number, label: string): FlowNode {
  return {
    id,
    x,
    y,
    order,
    label,
    subLabel: "Step",
    role: "normal",
    width: 276,
    height: 134,
    wafers: []
  };
}
