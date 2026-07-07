import { EDGE_CURVE_OFFSET, EDGE_NODE_CLEARANCE } from "./constants";
import { getClosestBoundaryPoints, getNodeBoundaryPoint, getNodeCenter, lineIntersectsNode } from "./geometry";
import type { FlowEdge, FlowNode, ScenePoint } from "./types";

const RETURN_EDGE_LANE_PADDING = 96;
const RETURN_EDGE_SAMPLE_COUNT = 24;

export function makeNodePath(edge: FlowEdge, from: FlowNode, to: FlowNode, edges: FlowEdge[], nodes: FlowNode[]) {
  const fromCenter = getNodeCenter(from);
  const toCenter = getNodeCenter(to);
  const directPath = makeStraightEdgePath(from, to);

  if (isReturnEdge(edge, from, to, edges)) {
    return makeReturnEdgePath(from, to, nodes);
  }

  if (hasReciprocalEdge(edge, edges)) {
    return makeAvoidingCurveEdgePath(
      from,
      to,
      nodes,
      from.order <= to.order ? -1 : 1,
      controlLaneDistance(from, to)
    );
  }

  if (!edgeIntersectsAnyNode(from, to, nodes)) {
    return directPath;
  }

  const preferredSide = getPreferredCurveSide(fromCenter, toCenter);
  return makeAvoidingCurveEdgePath(from, to, nodes, preferredSide, controlLaneDistance(from, to));
}

export function makeDraftPath(from: FlowNode, target: ScenePoint) {
  const fromPoint = getNodeBoundaryPoint(from, target);
  return `M ${fromPoint.x} ${fromPoint.y} L ${target.x} ${target.y}`;
}

export function isReturnEdge(edge: FlowEdge, from: FlowNode, to: FlowNode, edges: FlowEdge[]) {
  if (hasReciprocalEdge(edge, edges)) {
    return from.order > to.order;
  }

  return getNodeCenter(to).y < getNodeCenter(from).y - 1;
}

function makeStraightEdgePath(from: FlowNode, to: FlowNode) {
  const fromPoint = getNodeBoundaryPoint(from, getNodeCenter(to));
  const toPoint = getNodeBoundaryPoint(to, getNodeCenter(from));

  return `M ${fromPoint.x} ${fromPoint.y} L ${toPoint.x} ${toPoint.y}`;
}

function hasReciprocalEdge(edge: FlowEdge, edges: FlowEdge[]) {
  return edges.some((candidate) => candidate.from === edge.to && candidate.to === edge.from);
}

function getPreferredCurveSide(fromCenter: ScenePoint, toCenter: ScenePoint): 1 | -1 {
  const targetIsAbove = toCenter.y < fromCenter.y - 1;
  const targetIsRight = fromCenter.x <= toCenter.x;

  if (targetIsAbove) {
    return targetIsRight ? -1 : 1;
  }

  return targetIsRight ? 1 : -1;
}

function makeCurveEdgePath(from: FlowNode, to: FlowNode, offset: number) {
  const fromCenter = getNodeCenter(from);
  const toCenter = getNodeCenter(to);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const { fromPoint, toPoint } = getClosestBoundaryPoints(from, to);
  const control1 = {
    x: Math.round(fromPoint.x + normalX * offset + dx * 0.18),
    y: Math.round(fromPoint.y + normalY * offset + dy * 0.18)
  };
  const control2 = {
    x: Math.round(toPoint.x + normalX * offset - dx * 0.18),
    y: Math.round(toPoint.y + normalY * offset - dy * 0.18)
  };

  return `M ${fromPoint.x} ${fromPoint.y} C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${toPoint.x} ${toPoint.y}`;
}

function makeAvoidingCurveEdgePath(
  from: FlowNode,
  to: FlowNode,
  nodes: FlowNode[],
  preferredSide: 1 | -1,
  baseOffset: number
) {
  const fromCenter = getNodeCenter(from);
  const toCenter = getNodeCenter(to);
  const { fromPoint, toPoint } = getClosestBoundaryPoints(from, to);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const offsets = [
    preferredSide * baseOffset,
    -preferredSide * baseOffset,
    preferredSide * baseOffset * 1.45,
    -preferredSide * baseOffset * 1.45,
    preferredSide * baseOffset * 2.1,
    -preferredSide * baseOffset * 2.1,
    preferredSide * baseOffset * 2.9
  ];

  for (const offset of offsets) {
    const control1 = {
      x: Math.round(fromPoint.x + normalX * offset + dx * 0.18),
      y: Math.round(fromPoint.y + normalY * offset + dy * 0.18)
    };
    const control2 = {
      x: Math.round(toPoint.x + normalX * offset - dx * 0.18),
      y: Math.round(toPoint.y + normalY * offset - dy * 0.18)
    };

    if (!curveIntersectsAnyNode(from, to, fromPoint, control1, control2, toPoint, nodes)) {
      return `M ${fromPoint.x} ${fromPoint.y} C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${toPoint.x} ${toPoint.y}`;
    }
  }

  return makeCurveEdgePath(from, to, offsets[offsets.length - 1]);
}

function makeReturnEdgePath(from: FlowNode, to: FlowNode, nodes: FlowNode[]) {
  const sideLanePath = makeSideLaneReturnPath(from, to, nodes);
  if (sideLanePath) {
    return sideLanePath;
  }

  const fromCenter = getNodeCenter(from);
  const toCenter = getNodeCenter(to);
  const preferredSide = fromCenter.x <= toCenter.x ? -1 : 1;
  return makeAvoidingCurveEdgePath(from, to, nodes, preferredSide, controlLaneDistance(from, to));
}

function makeSideLaneReturnPath(from: FlowNode, to: FlowNode, nodes: FlowNode[]) {
  const fromCenter = getNodeCenter(from);
  const toCenter = getNodeCenter(to);
  const routeTop = Math.min(from.y, to.y) - RETURN_EDGE_LANE_PADDING;
  const routeBottom = Math.max(from.y + from.height, to.y + to.height) + RETURN_EDGE_LANE_PADDING;
  const routeNodes = nodes.filter((node) => node.y + node.height >= routeTop && node.y <= routeBottom);
  const minLeft = Math.min(...routeNodes.map((node) => node.x));
  const maxRight = Math.max(...routeNodes.map((node) => node.x + node.width));
  const preferredSide = fromCenter.x <= toCenter.x ? -1 : 1;
  const lanePadding = RETURN_EDGE_LANE_PADDING + EDGE_NODE_CLEARANCE;
  const candidateLaneXs = [
    preferredSide < 0 ? minLeft - lanePadding : maxRight + lanePadding,
    preferredSide < 0 ? maxRight + lanePadding : minLeft - lanePadding,
    minLeft - lanePadding * 1.75,
    maxRight + lanePadding * 1.75
  ];

  for (const laneX of candidateLaneXs) {
    const path = makeLanePath(from, to, laneX);
    if (!curveIntersectsAnyNode(from, to, path.fromPoint, path.control1, path.control2, path.toPoint, nodes)) {
      return formatCubicPath(path.fromPoint, path.control1, path.control2, path.toPoint);
    }
  }

  return null;
}

function makeLanePath(from: FlowNode, to: FlowNode, laneX: number) {
  const fromCenter = getNodeCenter(from);
  const toCenter = getNodeCenter(to);
  const fromPoint = getNodeBoundaryPoint(from, { x: laneX, y: fromCenter.y });
  const toPoint = getNodeBoundaryPoint(to, { x: laneX, y: toCenter.y });
  const control1 = {
    x: Math.round(laneX),
    y: Math.round(fromPoint.y)
  };
  const control2 = {
    x: Math.round(laneX),
    y: Math.round(toPoint.y)
  };

  return { fromPoint, control1, control2, toPoint };
}

function controlLaneDistance(from: FlowNode, to: FlowNode) {
  const verticalDistance = Math.abs(getNodeCenter(from).y - getNodeCenter(to).y);
  const horizontalDistance = Math.abs(getNodeCenter(from).x - getNodeCenter(to).x);
  const compactDistance = Math.min(verticalDistance, horizontalDistance);
  const broadDistance = Math.max(verticalDistance, horizontalDistance);
  return Math.max(
    EDGE_CURVE_OFFSET * 3,
    Math.min(220, Math.max(compactDistance * 0.42, broadDistance * 0.22))
  );
}

function edgeIntersectsAnyNode(from: FlowNode, to: FlowNode, nodes: FlowNode[]) {
  const { fromPoint, toPoint } = getClosestBoundaryPoints(from, to);

  return nodes.some((node) => {
    if (node.id === from.id || node.id === to.id) {
      return false;
    }

    return lineIntersectsNode(fromPoint, toPoint, node);
  });
}

function curveIntersectsAnyNode(
  from: FlowNode,
  to: FlowNode,
  fromPoint: ScenePoint,
  control1: ScenePoint,
  control2: ScenePoint,
  toPoint: ScenePoint,
  nodes: FlowNode[]
) {
  let previous = fromPoint;

  const steps = Math.max(RETURN_EDGE_SAMPLE_COUNT, 28);

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const point = getCubicPoint(fromPoint, control1, control2, toPoint, t);
    const intersects = nodes.some((node) => {
      if (node.id === from.id || node.id === to.id) {
        return false;
      }

      return lineIntersectsNode(previous, point, node);
    });

    if (intersects) {
      return true;
    }

    previous = point;
  }

  return false;
}

function formatCubicPath(fromPoint: ScenePoint, control1: ScenePoint, control2: ScenePoint, toPoint: ScenePoint) {
  return `M ${fromPoint.x} ${fromPoint.y} C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${toPoint.x} ${toPoint.y}`;
}

function getCubicPoint(start: ScenePoint, control1: ScenePoint, control2: ScenePoint, end: ScenePoint, t: number) {
  const inverse = 1 - t;

  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * control1.x + 3 * inverse * t ** 2 * control2.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * control1.y + 3 * inverse * t ** 2 * control2.y + t ** 3 * end.y
  };
}
