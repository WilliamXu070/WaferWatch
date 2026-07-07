import { EDGE_ID_PREFIX } from "./constants";
import { makeNodePath } from "./edges";
import type { FlowEdge, FlowNode, ScenePoint } from "./types";

const DEFAULT_EDGE_HIT_THRESHOLD = 18;
const PATH_SAMPLE_STEPS = 36;

export type EdgeSplitCandidate = {
  edge: FlowEdge;
  distance: number;
};

export function findEdgeSplitCandidate(
  point: ScenePoint,
  edges: FlowEdge[],
  nodes: FlowNode[],
  threshold = DEFAULT_EDGE_HIT_THRESHOLD
): EdgeSplitCandidate | null {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let best: EdgeSplitCandidate | null = null;

  for (const edge of edges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) {
      continue;
    }

    const path = makeNodePath(edge, from, to, edges, nodes);
    const distance = distanceToPath(point, path);
    if (distance > threshold) {
      continue;
    }

    if (!best || distance < best.distance) {
      best = { edge, distance };
    }
  }

  return best;
}

export function splitEdgeWithNode(edge: FlowEdge, nodeId: string) {
  return [
    {
      id: `${EDGE_ID_PREFIX}${Math.random().toString(36).slice(2, 10)}`,
      from: edge.from,
      to: nodeId,
      kind: edge.kind
    },
    {
      id: `${EDGE_ID_PREFIX}${Math.random().toString(36).slice(2, 10)}`,
      from: nodeId,
      to: edge.to,
      kind: edge.kind
    }
  ] satisfies FlowEdge[];
}

function distanceToPath(point: ScenePoint, path: string) {
  const points = samplePath(path);
  if (points.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    best = Math.min(best, distanceToSegment(point, points[index - 1], points[index]));
  }

  return best;
}

function samplePath(path: string) {
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];

  if (numbers.length === 4) {
    return [
      { x: numbers[0], y: numbers[1] },
      { x: numbers[2], y: numbers[3] }
    ];
  }

  if (numbers.length === 8) {
    const start = { x: numbers[0], y: numbers[1] };
    const control1 = { x: numbers[2], y: numbers[3] };
    const control2 = { x: numbers[4], y: numbers[5] };
    const end = { x: numbers[6], y: numbers[7] };
    const points: ScenePoint[] = [start];

    for (let step = 1; step <= PATH_SAMPLE_STEPS; step += 1) {
      points.push(getCubicPoint(start, control1, control2, end, step / PATH_SAMPLE_STEPS));
    }

    return points;
  }

  return [];
}

function distanceToSegment(point: ScenePoint, start: ScenePoint, end: ScenePoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy
  };

  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function getCubicPoint(start: ScenePoint, control1: ScenePoint, control2: ScenePoint, end: ScenePoint, t: number) {
  const inverse = 1 - t;

  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * control1.x + 3 * inverse * t ** 2 * control2.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * control1.y + 3 * inverse * t ** 2 * control2.y + t ** 3 * end.y
  };
}
