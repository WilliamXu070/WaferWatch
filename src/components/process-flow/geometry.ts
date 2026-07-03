import { EDGE_NODE_CLEARANCE, SNAP_THRESHOLD } from "./constants";
import type { FlowNode, ScenePoint, SnapGuide } from "./types";

export function getGraphBounds(nodes: FlowNode[]) {
  if (nodes.length === 0) {
    return null;
  }

  const minX = Math.min(...nodes.map((node) => node.x));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

export function getNodeCenter(node: FlowNode): ScenePoint {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2
  };
}

export function getNodeBoundaryPoint(node: FlowNode, target: ScenePoint): ScenePoint {
  const center = getNodeCenter(node);
  const dx = target.x - center.x;
  const dy = target.y - center.y;

  if (dx === 0 && dy === 0) {
    return { x: center.x, y: center.y };
  }

  const halfWidth = node.width / 2;
  const halfHeight = node.height / 2;
  const xScale = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
  const yScale = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
  const scale = Math.min(xScale, yScale);

  return {
    x: Math.round(center.x + dx * scale),
    y: Math.round(center.y + dy * scale)
  };
}

export function getClosestBoundaryPoints(from: FlowNode, to: FlowNode) {
  const fromCenter = getNodeCenter(from);
  const toCenter = getNodeCenter(to);

  return {
    fromPoint: getNodeBoundaryPoint(from, toCenter),
    toPoint: getNodeBoundaryPoint(to, fromCenter)
  };
}

export function getSnappedNodePosition(node: FlowNode, proposedX: number, proposedY: number, nodes: FlowNode[]) {
  let x = proposedX;
  let y = proposedY;
  let bestXDelta = SNAP_THRESHOLD + 1;
  let bestYDelta = SNAP_THRESHOLD + 1;
  let verticalGuide: SnapGuide | null = null;
  let horizontalGuide: SnapGuide | null = null;

  const proposedCenterX = proposedX + node.width / 2;
  const proposedCenterY = proposedY + node.height / 2;
  const proposedRight = proposedX + node.width;
  const proposedBottom = proposedY + node.height;

  for (const other of nodes) {
    if (other.id === node.id) {
      continue;
    }

    const otherCenter = getNodeCenter(other);
    const xCandidates = [
      { value: otherCenter.x, delta: otherCenter.x - proposedCenterX, alignment: "center" },
      { value: other.x, delta: other.x - proposedX, alignment: "left" },
      { value: other.x + other.width, delta: other.x + other.width - proposedRight, alignment: "right" }
    ];
    const yCandidates = [
      { value: otherCenter.y, delta: otherCenter.y - proposedCenterY, alignment: "center" },
      { value: other.y, delta: other.y - proposedY, alignment: "top" },
      { value: other.y + other.height, delta: other.y + other.height - proposedBottom, alignment: "bottom" }
    ];

    for (const candidate of xCandidates) {
      const distance = Math.abs(candidate.delta);
      if (distance < bestXDelta) {
        bestXDelta = distance;
        x = Math.round(proposedX + candidate.delta);
        const draggedCenterY = proposedY + node.height / 2;
        verticalGuide = {
          id: `v-${other.id}-${candidate.alignment}`,
          orientation: "vertical",
          value: Math.round(candidate.value),
          start: Math.round(Math.min(draggedCenterY, otherCenter.y) - 80),
          end: Math.round(Math.max(draggedCenterY, otherCenter.y) + 80)
        };
      }
    }

    for (const candidate of yCandidates) {
      const distance = Math.abs(candidate.delta);
      if (distance < bestYDelta) {
        bestYDelta = distance;
        y = Math.round(proposedY + candidate.delta);
        const draggedCenterX = proposedX + node.width / 2;
        horizontalGuide = {
          id: `h-${other.id}-${candidate.alignment}`,
          orientation: "horizontal",
          value: Math.round(candidate.value),
          start: Math.round(Math.min(draggedCenterX, otherCenter.x) - 100),
          end: Math.round(Math.max(draggedCenterX, otherCenter.x) + 100)
        };
      }
    }
  }

  return {
    x: Math.max(24, x),
    y: Math.max(24, y),
    guides: [verticalGuide, horizontalGuide].filter((guide): guide is SnapGuide => Boolean(guide))
  };
}

export function nodeContainsPoint(node: FlowNode, point: ScenePoint) {
  return (
    point.x >= node.x &&
    point.x <= node.x + node.width &&
    point.y >= node.y &&
    point.y <= node.y + node.height
  );
}

export function lineIntersectsNode(start: ScenePoint, end: ScenePoint, node: FlowNode) {
  const left = node.x - EDGE_NODE_CLEARANCE;
  const right = node.x + node.width + EDGE_NODE_CLEARANCE;
  const top = node.y - EDGE_NODE_CLEARANCE;
  const bottom = node.y + node.height + EDGE_NODE_CLEARANCE;

  if (pointInRect(start, left, right, top, bottom) || pointInRect(end, left, right, top, bottom)) {
    return true;
  }

  return (
    linesIntersect(start, end, { x: left, y: top }, { x: right, y: top }) ||
    linesIntersect(start, end, { x: right, y: top }, { x: right, y: bottom }) ||
    linesIntersect(start, end, { x: right, y: bottom }, { x: left, y: bottom }) ||
    linesIntersect(start, end, { x: left, y: bottom }, { x: left, y: top })
  );
}

function pointInRect(point: ScenePoint, left: number, right: number, top: number, bottom: number) {
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

function linesIntersect(a: ScenePoint, b: ScenePoint, c: ScenePoint, d: ScenePoint) {
  const direction = (p: ScenePoint, q: ScenePoint, r: ScenePoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);

  const d1 = direction(a, b, c);
  const d2 = direction(a, b, d);
  const d3 = direction(c, d, a);
  const d4 = direction(c, d, b);

  return d1 * d2 < 0 && d3 * d4 < 0;
}

