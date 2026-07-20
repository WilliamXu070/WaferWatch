import assert from "node:assert/strict";
import test from "node:test";
import { lineIntersectsNode } from "./geometry";
import { makeNodePath } from "./edges";
import type { FlowEdge, FlowNode, ScenePoint } from "./types";

test("return edges route around stacked process cards", () => {
  const nodes: FlowNode[] = [
    makeNode("intake", 400, 80, 1, "Fixture intake"),
    makeNode("poling", 400, 300, 2, "Fixture poling"),
    makeNode("inspection", 400, 520, 3, "Fixture inspection"),
    makeNode("complete", 220, 750, 4, "Fixture complete"),
    makeNode("branch", 590, 750, 5, "Untitled")
  ];
  const edge: FlowEdge = {
    id: "return-complete-poling",
    from: "complete",
    to: "poling",
    kind: "return"
  };

  const path = makeNodePath(edge, nodes[3], nodes[1], [edge], nodes);

  assert.equal(pathIntersectsNodes(path, nodes[3], nodes[1], nodes), false);
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
    executionMode: "main",
    width: 276,
    height: 134,
    wafers: [],
    parametersSchema: {},
    revision: 1
  };
}

function pathIntersectsNodes(path: string, from: FlowNode, to: FlowNode, nodes: FlowNode[]) {
  const points = samplePath(path);

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const intersects = nodes.some((node) => {
      if (node.id === from.id || node.id === to.id) {
        return false;
      }

      return lineIntersectsNode(start, end, node);
    });

    if (intersects) {
      return true;
    }
  }

  return false;
}

function samplePath(path: string) {
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  assert.equal(numbers.length, 8);

  const start = { x: numbers[0], y: numbers[1] };
  const control1 = { x: numbers[2], y: numbers[3] };
  const control2 = { x: numbers[4], y: numbers[5] };
  const end = { x: numbers[6], y: numbers[7] };
  const points: ScenePoint[] = [start];

  for (let step = 1; step <= 48; step += 1) {
    points.push(getCubicPoint(start, control1, control2, end, step / 48));
  }

  return points;
}

function getCubicPoint(start: ScenePoint, control1: ScenePoint, control2: ScenePoint, end: ScenePoint, t: number) {
  const inverse = 1 - t;

  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * control1.x + 3 * inverse * t ** 2 * control2.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * control1.y + 3 * inverse * t ** 2 * control2.y + t ** 3 * end.y
  };
}
