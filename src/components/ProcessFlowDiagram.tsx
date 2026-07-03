"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import type { StepStatus } from "@/types/database";

type WaferPin = {
  assignmentId: string;
  waferCode: string;
  dieLabel: string | null;
  currentStepStatus: StepStatus | null;
};

type DiagramStep = {
  id: string;
  name: string;
  process_area: string;
  step_order: number;
  wafers: WaferPin[];
};

type FlowNodeRole = "normal" | "start" | "end";

type FlowNode = {
  id: string;
  label: string;
  subLabel: string;
  wafers: WaferPin[];
  x: number;
  y: number;
  width: number;
  height: number;
  role: FlowNodeRole;
  order: number;
};

type FlowEdge = {
  id: string;
  from: string;
  to: string;
  kind: "flow" | "return";
};

type ConnectionDraft = {
  from: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  hasMoved: boolean;
};

type NodeDrag = {
  nodeId: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

type WaferDrag = {
  assignmentId: string;
  sourceStepId: string;
  waferLabel: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  hasMoved: boolean;
};

type SnapGuide = {
  id: string;
  orientation: "horizontal" | "vertical";
  value: number;
  start: number;
  end: number;
};

type RoleMenu = {
  nodeId: string;
  paneX: number;
  paneY: number;
};

type ScenePoint = {
  x: number;
  y: number;
};

type PanePoint = {
  paneX: number;
  paneY: number;
};

type ZoomAnchor = {
  paneX: number;
  paneY: number;
  sceneX: number;
  sceneY: number;
};

const NODE_WIDTH = 276;
const NODE_HEIGHT = 134;
const SCENE_WIDTH = 2200;
const SCENE_HEIGHT = 1600;
const MIN_SCALE = 0.8;
const MAX_SCALE = 2.6;
const BUTTON_ZOOM_STEP = 0.25;
const WHEEL_ZOOM_STEP = 0.18;
const SNAP_THRESHOLD = 16;
const LAYOUT_CENTER_X = 520;
const LAYOUT_TOP_Y = 96;
const LAYOUT_GAP_Y = 250;
const LAYOUT_LANE_GAP_X = 380;
const LAYOUT_LOOP_GAP_X = 180;
const LAYOUT_LOOP_RADIUS_X = 250;
const LAYOUT_LOOP_RADIUS_Y = 170;
const EDGE_CURVE_OFFSET = 48;
const EDGE_NODE_CLEARANCE = 10;
const SEEDED_START_ID = "flow-seed-start";
const SEEDED_END_ID = "flow-seed-end";
const MAX_NODE_CHIPS = 4;

type MoveWaferToProcessStepAction = (input: {
  assignmentId: string;
  targetStepId: string;
  note?: string | null;
}) => Promise<ActionResult<unknown>>;

function clampScale(nextScale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(nextScale.toFixed(2))));
}

function makeNodePath(edge: FlowEdge, from: FlowNode, to: FlowNode, edges: FlowEdge[], nodes: FlowNode[]) {
  const fromCenter = getNodeCenter(from);
  const toCenter = getNodeCenter(to);
  const directPath = makeStraightEdgePath(from, to);

  if (hasReciprocalEdge(edge, edges)) {
    return makeOffsetEdgePath(from, to, from.order <= to.order ? -EDGE_CURVE_OFFSET : EDGE_CURVE_OFFSET);
  }

  if (!edgeIntersectsAnyNode(from, to, nodes)) {
    return directPath;
  }

  if (toCenter.y < fromCenter.y - 1) {
    return makeReturnEdgePath(from, to, nodes);
  }

  return directPath;
}

function makeStraightEdgePath(from: FlowNode, to: FlowNode) {
  const fromPoint = getNodeBoundaryPoint(from, getNodeCenter(to));
  const toPoint = getNodeBoundaryPoint(to, getNodeCenter(from));

  return `M ${fromPoint.x} ${fromPoint.y} L ${toPoint.x} ${toPoint.y}`;
}

function hasReciprocalEdge(edge: FlowEdge, edges: FlowEdge[]) {
  return edges.some((candidate) => candidate.from === edge.to && candidate.to === edge.from);
}

function isReturnEdge(edge: FlowEdge, from: FlowNode, to: FlowNode, edges: FlowEdge[]) {
  if (hasReciprocalEdge(edge, edges)) {
    return from.order > to.order;
  }

  return getNodeCenter(to).y < getNodeCenter(from).y - 1;
}

function getNodeCenter(node: FlowNode) {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2
  };
}

function getNodeBoundaryPoint(node: FlowNode, target: { x: number; y: number }) {
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

function getClosestBoundaryPoints(from: FlowNode, to: FlowNode) {
  const fromCenter = getNodeCenter(from);
  const toCenter = getNodeCenter(to);

  return {
    fromPoint: getNodeBoundaryPoint(from, toCenter),
    toPoint: getNodeBoundaryPoint(to, fromCenter)
  };
}

function makeDraftPath(from: FlowNode, target: { x: number; y: number }) {
  const fromPoint = getNodeBoundaryPoint(from, target);
  return `M ${fromPoint.x} ${fromPoint.y} L ${target.x} ${target.y}`;
}

function makeOffsetEdgePath(from: FlowNode, to: FlowNode, offset: number) {
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

function makeReturnEdgePath(from: FlowNode, to: FlowNode, nodes: FlowNode[]) {
  const fromCenter = getNodeCenter(from);
  const toCenter = getNodeCenter(to);
  const { fromPoint, toPoint } = getClosestBoundaryPoints(from, to);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const preferredSide = fromCenter.x <= toCenter.x ? -1 : 1;
  const baseOffset = controlLaneDistance(from, to);
  const offsets = [preferredSide * baseOffset, -preferredSide * baseOffset, preferredSide * baseOffset * 1.45];

  for (const offset of offsets) {
    const control1 = {
      x: Math.round(fromPoint.x + normalX * offset + dx * 0.18),
      y: Math.round(fromPoint.y + normalY * offset + dy * 0.18)
    };
    const control2 = {
      x: Math.round(toPoint.x + normalX * offset - dx * 0.18),
      y: Math.round(toPoint.y + normalY * offset - dy * 0.18)
    };

    if (!curveIntersectsAnyNode(from, to, control1, control2, nodes)) {
      return `M ${fromPoint.x} ${fromPoint.y} C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${toPoint.x} ${toPoint.y}`;
    }
  }

  const fallbackOffset = offsets[0];
  const control1 = {
    x: Math.round(fromPoint.x + normalX * fallbackOffset + dx * 0.18),
    y: Math.round(fromPoint.y + normalY * fallbackOffset + dy * 0.18)
  };
  const control2 = {
    x: Math.round(toPoint.x + normalX * fallbackOffset - dx * 0.18),
    y: Math.round(toPoint.y + normalY * fallbackOffset - dy * 0.18)
  };

  return `M ${fromPoint.x} ${fromPoint.y} C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${toPoint.x} ${toPoint.y}`;
}

function controlLaneDistance(from: FlowNode, to: FlowNode) {
  const verticalDistance = Math.abs(getNodeCenter(from).y - getNodeCenter(to).y);
  const horizontalDistance = Math.abs(getNodeCenter(from).x - getNodeCenter(to).x);
  return Math.max(64, Math.min(150, Math.min(verticalDistance, horizontalDistance) * 0.34));
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
  control1: { x: number; y: number },
  control2: { x: number; y: number },
  nodes: FlowNode[]
) {
  const { fromPoint, toPoint } = getClosestBoundaryPoints(from, to);
  let previous = fromPoint;

  for (let step = 1; step <= 12; step += 1) {
    const t = step / 12;
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

function getCubicPoint(
  start: { x: number; y: number },
  control1: { x: number; y: number },
  control2: { x: number; y: number },
  end: { x: number; y: number },
  t: number
) {
  const inverse = 1 - t;

  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * control1.x + 3 * inverse * t ** 2 * control2.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * control1.y + 3 * inverse * t ** 2 * control2.y + t ** 3 * end.y
  };
}

function lineIntersectsNode(
  start: { x: number; y: number },
  end: { x: number; y: number },
  node: FlowNode
) {
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

function pointInRect(point: { x: number; y: number }, left: number, right: number, top: number, bottom: number) {
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

function linesIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number }
) {
  const direction = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);

  const d1 = direction(a, b, c);
  const d2 = direction(a, b, d);
  const d3 = direction(c, d, a);
  const d4 = direction(c, d, b);

  return d1 * d2 < 0 && d3 * d4 < 0;
}

function getSnappedNodePosition(node: FlowNode, proposedX: number, proposedY: number, nodes: FlowNode[]) {
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

function nodeContainsPoint(node: FlowNode, point: { x: number; y: number }) {
  return (
    point.x >= node.x &&
    point.x <= node.x + node.width &&
    point.y >= node.y &&
    point.y <= node.y + node.height
  );
}

function orderNodes(nodes: FlowNode[], edges: FlowEdge[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      continue;
    }

    outgoing.get(edge.from)?.push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  const orderedNodes = [...nodes].sort((a, b) => a.order - b.order);
  const visited = new Set<string>();
  const sortedIds: string[] = [];
  const roots = orderedNodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
  const starts = roots.length ? roots : orderedNodes.slice(0, 1);

  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);
    sortedIds.push(nodeId);

    for (const nextId of outgoing.get(nodeId) ?? []) {
      visit(nextId);
    }
  };

  starts.forEach((node) => visit(node.id));

  const missing = nodes
    .filter((node) => !visited.has(node.id))
    .sort((a, b) => a.order - b.order)
    .map((node) => node.id);

  return [...sortedIds, ...missing];
}

function autoLayoutNodes(
  nodes: FlowNode[],
  edges: FlowEdge[],
  targetCenter: ScenePoint = { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT / 2 }
) {
  if (nodes.length === 0) {
    return nodes;
  }

  const orderedIds = orderNodes(nodes, edges);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const components = buildLayoutComponents(nodes, edges, orderedIds);
  const componentByNodeId = new Map<string, string>();
  const componentById = new Map(components.map((component) => [component.id, component]));
  const componentRank = new Map(components.map((component) => [component.id, 0]));
  const incomingCount = new Map(components.map((component) => [component.id, 0]));
  const outgoing = new Map(components.map((component) => [component.id, [] as string[]]));

  for (const component of components) {
    for (const nodeId of component.nodeIds) {
      componentByNodeId.set(nodeId, component.id);
    }
  }

  for (const edge of edges) {
    const fromComponentId = componentByNodeId.get(edge.from);
    const toComponentId = componentByNodeId.get(edge.to);

    if (!fromComponentId || !toComponentId || fromComponentId === toComponentId) {
      continue;
    }

    const nextComponents = outgoing.get(fromComponentId);
    if (nextComponents && !nextComponents.includes(toComponentId)) {
      nextComponents.push(toComponentId);
      incomingCount.set(toComponentId, (incomingCount.get(toComponentId) ?? 0) + 1);
    }
  }

  const explicitStartComponentIds = components
    .filter((component) => component.nodeIds.some((nodeId) => nodeById.get(nodeId)?.role === "start"))
    .map((component) => component.id);
  const rootComponentIds = components
    .filter((component) => (incomingCount.get(component.id) ?? 0) === 0)
    .map((component) => component.id);
  const seedIds = explicitStartComponentIds.length
    ? explicitStartComponentIds
    : rootComponentIds.length
      ? rootComponentIds
      : components.slice(0, 1).map((component) => component.id);
  const visited = new Set<string>();

  const assignRanks = (componentId: string, rank: number, activePath: Set<string>) => {
    const currentRank = componentRank.get(componentId) ?? 0;
    componentRank.set(componentId, Math.max(currentRank, rank));

    if (activePath.has(componentId)) {
      return;
    }

    const nextPath = new Set(activePath);
    nextPath.add(componentId);
    visited.add(componentId);

    const nextIds = (outgoing.get(componentId) ?? []).sort(
      (a, b) => (componentById.get(a)?.order ?? 0) - (componentById.get(b)?.order ?? 0)
    );

    for (const nextId of nextIds) {
      if (nextPath.has(nextId)) {
        continue;
      }

      assignRanks(nextId, rank + 1, nextPath);
    }
  };

  seedIds.forEach((id) => assignRanks(id, 0, new Set()));

  let disconnectedRank = 0;
  for (const component of components) {
    if (visited.has(component.id)) {
      disconnectedRank = Math.max(disconnectedRank, componentRank.get(component.id) ?? 0);
      continue;
    }

    assignRanks(component.id, disconnectedRank + 1, new Set());
    disconnectedRank = Math.max(disconnectedRank, componentRank.get(component.id) ?? 0);
  }

  normalizeComponentRanks(components, componentRank);

  const lanesByRank = new Map<number, LayoutComponent[]>();
  for (const component of components) {
    const rank = componentRank.get(component.id) ?? 0;
    const current = lanesByRank.get(rank);
    if (current) {
      current.push(component);
    } else {
      lanesByRank.set(rank, [component]);
    }
  }

  const positioned = new Map<string, FlowNode>();
  let rowY = LAYOUT_TOP_Y;

  for (const rank of [...lanesByRank.keys()].sort((a, b) => a - b)) {
    const rowComponents = (lanesByRank.get(rank) ?? []).sort(compareLayoutComponents);
    const rowHeight = Math.max(...rowComponents.map((component) => component.height));
    const rowWidth = rowComponents.reduce((width, component) => width + component.width, 0) +
      Math.max(0, rowComponents.length - 1) * LAYOUT_LANE_GAP_X;
    let componentX = Math.max(96, Math.round(LAYOUT_CENTER_X - rowWidth / 2));

    for (const component of rowComponents) {
      const componentY = Math.round(rowY + (rowHeight - component.height) / 2);
      positionComponentNodes(component, nodeById, edges, componentX, componentY, positioned);
      componentX += component.width + LAYOUT_LANE_GAP_X;
    }

    rowY += rowHeight + LAYOUT_GAP_Y;
  }

  centerPositionedNodes(positioned, targetCenter);

  return nodes.map((node) => positioned.get(node.id) ?? node);
}

function centerPositionedNodes(positioned: Map<string, FlowNode>, targetCenter: ScenePoint) {
  const positionedNodes = [...positioned.values()];
  if (positionedNodes.length === 0) {
    return;
  }

  const minX = Math.min(...positionedNodes.map((node) => node.x));
  const maxX = Math.max(...positionedNodes.map((node) => node.x + node.width));
  const minY = Math.min(...positionedNodes.map((node) => node.y));
  const maxY = Math.max(...positionedNodes.map((node) => node.y + node.height));
  const currentCenterX = (minX + maxX) / 2;
  const currentCenterY = (minY + maxY) / 2;
  let dx = Math.round(targetCenter.x - currentCenterX);
  let dy = Math.round(targetCenter.y - currentCenterY);

  if (minX + dx < 24) {
    dx = 24 - minX;
  }

  if (minY + dy < 24) {
    dy = 24 - minY;
  }

  for (const [id, node] of positioned) {
    positioned.set(id, {
      ...node,
      x: Math.round(node.x + dx),
      y: Math.round(node.y + dy)
    });
  }
}

type LayoutComponent = {
  id: string;
  nodeIds: string[];
  order: number;
  width: number;
  height: number;
  hasStart: boolean;
  hasEnd: boolean;
};

function buildLayoutComponents(nodes: FlowNode[], edges: FlowEdge[], orderedIds: string[]): LayoutComponent[] {
  const orderIndexById = new Map(orderedIds.map((id, index) => [id, index]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const stronglyConnected = getStronglyConnectedComponents(nodes, edges, orderIndexById);

  return stronglyConnected
    .map((nodeIds, index) => {
      const sortedNodeIds = [...nodeIds].sort((a, b) =>
        compareNodeIdsForLayout(a, b, nodeById, orderIndexById)
      );
      const hasStart = sortedNodeIds.some((id) => nodeById.get(id)?.role === "start");
      const hasEnd = sortedNodeIds.some((id) => nodeById.get(id)?.role === "end");
      const dimensions = getComponentDimensions(sortedNodeIds.length, hasStart || hasEnd);

      return {
        id: `component-${index}`,
        nodeIds: sortedNodeIds,
        order: Math.min(...sortedNodeIds.map((id) => orderIndexById.get(id) ?? 0)),
        width: dimensions.width,
        height: dimensions.height,
        hasStart,
        hasEnd
      };
    })
    .sort(compareLayoutComponents);
}

function normalizeComponentRanks(components: LayoutComponent[], componentRank: Map<string, number>) {
  const startComponents = components.filter((component) => component.hasStart);
  const endComponents = components.filter((component) => component.hasEnd);

  for (const component of startComponents) {
    componentRank.set(component.id, 0);
  }

  const maxNonEndRank = components
    .filter((component) => !component.hasEnd)
    .reduce((maxRank, component) => Math.max(maxRank, componentRank.get(component.id) ?? 0), 0);

  for (const component of endComponents) {
    if (component.hasStart) {
      continue;
    }

    componentRank.set(component.id, maxNonEndRank + 1);
  }
}

function compareLayoutComponents(a: LayoutComponent, b: LayoutComponent) {
  const roleDelta = getComponentRoleSortWeight(a) - getComponentRoleSortWeight(b);
  if (roleDelta !== 0) {
    return roleDelta;
  }

  return a.order - b.order;
}

function getComponentRoleSortWeight(component: LayoutComponent) {
  if (component.hasStart) return -1;
  if (component.hasEnd) return 1;
  return 0;
}

function compareNodeIdsForLayout(
  a: string,
  b: string,
  nodeById: Map<string, FlowNode>,
  orderIndexById: Map<string, number>
) {
  const roleDelta = getNodeRoleSortWeight(nodeById.get(a)?.role ?? "normal") -
    getNodeRoleSortWeight(nodeById.get(b)?.role ?? "normal");
  if (roleDelta !== 0) {
    return roleDelta;
  }

  return (orderIndexById.get(a) ?? 0) - (orderIndexById.get(b) ?? 0);
}

function getNodeRoleSortWeight(role: FlowNodeRole) {
  if (role === "start") return -1;
  if (role === "end") return 1;
  return 0;
}

function getStronglyConnectedComponents(
  nodes: FlowNode[],
  edges: FlowEdge[],
  orderIndexById: Map<string, number>
) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      outgoing.get(edge.from)?.push(edge.to);
    }
  }

  for (const nextIds of outgoing.values()) {
    nextIds.sort((a, b) => (orderIndexById.get(a) ?? 0) - (orderIndexById.get(b) ?? 0));
  }

  let index = 0;
  const stack: string[] = [];
  const stackSet = new Set<string>();
  const indexById = new Map<string, number>();
  const lowLinkById = new Map<string, number>();
  const components: string[][] = [];

  const visit = (nodeId: string) => {
    indexById.set(nodeId, index);
    lowLinkById.set(nodeId, index);
    index += 1;
    stack.push(nodeId);
    stackSet.add(nodeId);

    for (const nextId of outgoing.get(nodeId) ?? []) {
      if (!indexById.has(nextId)) {
        visit(nextId);
        lowLinkById.set(nodeId, Math.min(lowLinkById.get(nodeId) ?? 0, lowLinkById.get(nextId) ?? 0));
      } else if (stackSet.has(nextId)) {
        lowLinkById.set(nodeId, Math.min(lowLinkById.get(nodeId) ?? 0, indexById.get(nextId) ?? 0));
      }
    }

    if (lowLinkById.get(nodeId) !== indexById.get(nodeId)) {
      return;
    }

    const component: string[] = [];
    let currentId: string | undefined;
    do {
      currentId = stack.pop();
      if (currentId) {
        stackSet.delete(currentId);
        component.push(currentId);
      }
    } while (currentId && currentId !== nodeId);

    components.push(component);
  };

  for (const node of [...nodes].sort((a, b) => a.order - b.order)) {
    if (!indexById.has(node.id)) {
      visit(node.id);
    }
  }

  return components;
}

function getComponentDimensions(nodeCount: number, hasPinnedRole: boolean) {
  if (nodeCount <= 1) {
    return { width: NODE_WIDTH, height: NODE_HEIGHT };
  }

  if (nodeCount === 2 && !hasPinnedRole) {
    return {
      width: NODE_WIDTH * 2 + LAYOUT_LOOP_GAP_X,
      height: NODE_HEIGHT
    };
  }

  return {
    width: LAYOUT_LOOP_RADIUS_X * 2 + NODE_WIDTH,
    height: LAYOUT_LOOP_RADIUS_Y * 2 + NODE_HEIGHT
  };
}

function positionComponentNodes(
  component: LayoutComponent,
  nodeById: Map<string, FlowNode>,
  edges: FlowEdge[],
  componentX: number,
  componentY: number,
  positioned: Map<string, FlowNode>
) {
  if (component.nodeIds.length === 1) {
    const node = nodeById.get(component.nodeIds[0]);
    if (node) {
      positioned.set(node.id, { ...node, x: Math.round(componentX), y: Math.round(componentY) });
    }
    return;
  }

  if (component.nodeIds.length === 2 && !component.hasStart && !component.hasEnd) {
    component.nodeIds.forEach((id, index) => {
      const node = nodeById.get(id);
      if (!node) {
        return;
      }

      positioned.set(id, {
        ...node,
        x: Math.round(componentX + index * (NODE_WIDTH + LAYOUT_LOOP_GAP_X)),
        y: Math.round(componentY)
      });
    });
    return;
  }

  const pinnedPositions = getPinnedComponentPositions(component, nodeById);
  const centerX = componentX + component.width / 2;
  const centerY = componentY + component.height / 2;
  const placementNodeIds = getComponentPlacementNodeIds(component, nodeById, edges);
  const freeNodeIds = placementNodeIds.filter((id) => !pinnedPositions.has(id));

  for (const [id, point] of pinnedPositions) {
    const node = nodeById.get(id);
    if (!node) {
      continue;
    }

    positioned.set(id, {
      ...node,
      x: Math.round(componentX + point.x - NODE_WIDTH / 2),
      y: Math.round(componentY + point.y - NODE_HEIGHT / 2)
    });
  }

  freeNodeIds.forEach((id, index) => {
    const node = nodeById.get(id);
    if (!node) {
      return;
    }

    if (component.hasStart || component.hasEnd) {
      const point = getPinnedRoleFreeNodePoint(component, index, freeNodeIds.length);
      positioned.set(id, {
        ...node,
        x: Math.round(componentX + point.x - NODE_WIDTH / 2),
        y: Math.round(componentY + point.y - NODE_HEIGHT / 2)
      });
      return;
    }

    const angle = getFreeNodeAngle(index, freeNodeIds.length);
    positioned.set(id, {
      ...node,
      x: Math.round(centerX + Math.cos(angle) * LAYOUT_LOOP_RADIUS_X - NODE_WIDTH / 2),
      y: Math.round(centerY + Math.sin(angle) * LAYOUT_LOOP_RADIUS_Y - NODE_HEIGHT / 2)
    });
  });
}

function getPinnedComponentPositions(component: LayoutComponent, nodeById: Map<string, FlowNode>) {
  const pinned = new Map<string, { x: number; y: number }>();
  const centerX = component.width / 2;

  const startId = component.nodeIds.find((id) => nodeById.get(id)?.role === "start");
  if (startId) {
    pinned.set(startId, { x: centerX, y: NODE_HEIGHT / 2 });
  }

  const endId = component.nodeIds.find((id) => nodeById.get(id)?.role === "end");
  if (endId && endId !== startId) {
    pinned.set(endId, { x: centerX, y: component.height - NODE_HEIGHT / 2 });
  }

  return pinned;
}

function getComponentPlacementNodeIds(component: LayoutComponent, nodeById: Map<string, FlowNode>, edges: FlowEdge[]) {
  const componentNodeIds = new Set(component.nodeIds);
  const startId = component.nodeIds.find((id) => nodeById.get(id)?.role === "start") ?? component.nodeIds[0];

  if (!startId || component.nodeIds.length < 2) {
    return component.nodeIds;
  }

  const componentOrder = new Map(component.nodeIds.map((id, index) => [id, index]));
  const outgoing = new Map(component.nodeIds.map((id) => [id, [] as string[]]));

  for (const edge of edges) {
    if (componentNodeIds.has(edge.from) && componentNodeIds.has(edge.to)) {
      outgoing.get(edge.from)?.push(edge.to);
    }
  }

  for (const nextIds of outgoing.values()) {
    nextIds.sort((a, b) => (componentOrder.get(a) ?? 0) - (componentOrder.get(b) ?? 0));
  }

  const ordered = [startId];
  const visited = new Set(ordered);
  let currentId = startId;

  while (true) {
    const nextId = (outgoing.get(currentId) ?? []).find((id) => !visited.has(id));
    if (!nextId) {
      break;
    }

    ordered.push(nextId);
    visited.add(nextId);
    currentId = nextId;
  }

  for (const id of component.nodeIds) {
    if (!visited.has(id)) {
      ordered.push(id);
    }
  }

  return ordered;
}

function getPinnedRoleFreeNodePoint(component: LayoutComponent, index: number, count: number) {
  const side = index % 2 === 0 ? -1 : 1;
  const sideIndex = Math.floor(index / 2);
  const sideCount = Math.ceil(count / 2);
  const hasBothRoles = component.hasStart && component.hasEnd;
  const topPadding = component.hasStart ? NODE_HEIGHT : NODE_HEIGHT / 2;
  const bottomPadding = component.hasEnd ? NODE_HEIGHT : NODE_HEIGHT / 2;
  const usableHeight = Math.max(NODE_HEIGHT, component.height - topPadding - bottomPadding);
  const yGap = hasBothRoles
    ? usableHeight / Math.max(1, sideCount + 1)
    : usableHeight / Math.max(1, sideCount);

  return {
    x: component.width / 2 + side * LAYOUT_LOOP_RADIUS_X,
    y: topPadding + yGap * (sideIndex + (hasBothRoles ? 1 : 0.5))
  };
}

function getFreeNodeAngle(index: number, count: number) {
  if (count <= 1) {
    return Math.PI;
  }

  return -Math.PI / 2 + (index * Math.PI * 2) / count;
}

function describeRole(role: FlowNodeRole) {
  if (role === "start") return "Start";
  if (role === "end") return "End";
  return "Step";
}

function getInitialGraph(steps: DiagramStep[]) {
  const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);
  const waferByAssignmentId = new Map<string, WaferPin>();

  for (const step of sortedSteps) {
    for (const wafer of step.wafers) {
      waferByAssignmentId.set(wafer.assignmentId, wafer);
    }
  }

  const allWafers = [...waferByAssignmentId.values()];
  const nodes: FlowNode[] = [
    {
      id: SEEDED_START_ID,
      label: "Start",
      subLabel: "Process entry",
      wafers: allWafers,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      role: "start",
      order: 0
    },
    ...sortedSteps.map((step, index): FlowNode => ({
      id: step.id,
      label: step.name,
      subLabel: step.process_area,
      wafers: step.wafers,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      role: "normal",
      order: index + 1
    })),
    {
      id: SEEDED_END_ID,
      label: "End",
      subLabel: "Process complete",
      wafers: [],
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      role: "end",
      order: sortedSteps.length + 1
    }
  ];

  const ids = nodes.map((node) => node.id);
  const edges: FlowEdge[] = ids.slice(0, -1).map((id, index) => ({
    id: `${id}->${ids[index + 1]}`,
    from: id,
    to: ids[index + 1],
    kind: "flow"
  }));

  return {
    nodes: autoLayoutNodes(nodes, edges, { x: LAYOUT_CENTER_X, y: SCENE_HEIGHT / 2 }),
    edges
  };
}

function getStepSignature(steps: DiagramStep[]) {
  return [...steps]
    .sort((a, b) => a.step_order - b.step_order)
    .map((step) => `${step.id}:${step.step_order}:${step.name}:${step.process_area}:${step.wafers.length}`)
    .join("|");
}

function truncateLabel(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function getWaferChipLabel(wafer: WaferPin) {
  return wafer.dieLabel?.trim() || wafer.waferCode;
}

function getNodeIconPath(role: FlowNodeRole) {
  if (role === "start") {
    return "M 18 8 A 10 10 0 1 1 17.9 8 M 15 13 L 22 18 L 15 23 Z";
  }

  if (role === "end") {
    return "M 10 11 H 26 V 25 H 10 Z M 14 15 H 22 M 14 19 H 22";
  }

  return "M 9 24 L 17 10 L 27 24 Z M 14 21 H 22 M 18 16 V 21";
}

function hasActiveWafer(node: FlowNode) {
  return node.role === "normal" && node.wafers.some((wafer) => wafer.currentStepStatus === "running");
}

export function ProcessFlowDiagram({
  steps,
  onMoveWafer
}: {
  steps: DiagramStep[];
  onMoveWafer?: MoveWaferToProcessStepAction;
}) {

  const router = useRouter();
  const [scale, setScale] = useState(1);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [nodeDrag, setNodeDrag] = useState<NodeDrag | null>(null);
  const [waferDrag, setWaferDrag] = useState<WaferDrag | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [roleMenu, setRoleMenu] = useState<RoleMenu | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [moveMessage, setMoveMessage] = useState<string | null>(null);
  const [isMovePending, startMoveTransition] = useTransition();
  const scaleRef = useRef(1);
  const pinchBaseScaleRef = useRef(1);
  const nextNodeNumberRef = useRef(1);
  const pendingZoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const panStateRef = useRef<{
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stepSignature = useMemo(() => getStepSignature(steps), [steps]);
  const seededSignatureRef = useRef<string | null>(null);

  const sceneBounds = useMemo(() => {
    const maxNodeX = nodes.length ? Math.max(...nodes.map((node) => node.x + node.width)) + 160 : SCENE_WIDTH;
    const maxNodeY = nodes.length ? Math.max(...nodes.map((node) => node.y + node.height)) + 160 : SCENE_HEIGHT;
    return {
      width: Math.max(SCENE_WIDTH, maxNodeX),
      height: Math.max(SCENE_HEIGHT, maxNodeY)
    };
  }, [nodes]);

  const s = clampScale(scale);
  const scaledWidth = Math.round(sceneBounds.width * s);
  const scaledHeight = Math.round(sceneBounds.height * s);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const getPanePoint = useCallback((clientX?: number, clientY?: number): PanePoint | null => {
    const frame = frameRef.current;
    if (!frame) {
      return null;
    }

    if (clientX === undefined || clientY === undefined) {
      return {
        paneX: frame.clientWidth / 2,
        paneY: frame.clientHeight / 2
      };
    }

    const frameRect = frame.getBoundingClientRect();
    return {
      paneX: clientX - frameRect.left,
      paneY: clientY - frameRect.top
    };
  }, []);

  const getScenePointFromClient = useCallback((clientX: number, clientY: number): ScenePoint => {
    const svg = svgRef.current;
    if (!svg) {
      return { x: 0, y: 0 };
    }

    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: ((clientX - rect.left) / rect.width) * sceneBounds.width,
      y: ((clientY - rect.top) / rect.height) * sceneBounds.height
    };
  }, [sceneBounds.height, sceneBounds.width]);

  const getScenePoint = useCallback((event: { clientX: number; clientY: number }) => (
    getScenePointFromClient(event.clientX, event.clientY)
  ), [getScenePointFromClient]);

  const applyScaleAtAnchor = useCallback((
    nextScale: number,
    anchor: PanePoint | null = getPanePoint()
  ) => {
    const frame = frameRef.current;
    const currentScale = scaleRef.current;
    const boundedScale = clampScale(nextScale);

    if (!frame || !anchor || boundedScale === currentScale) {
      setScale(boundedScale);
      scaleRef.current = boundedScale;
      return;
    }

    pendingZoomAnchorRef.current = {
      paneX: anchor.paneX,
      paneY: anchor.paneY,
      sceneX: (frame.scrollLeft + anchor.paneX) / currentScale,
      sceneY: (frame.scrollTop + anchor.paneY) / currentScale
    };

    scaleRef.current = boundedScale;
    setScale(boundedScale);
  }, [getPanePoint]);

  const zoomIn = () => applyScaleAtAnchor(scaleRef.current + BUTTON_ZOOM_STEP);
  const zoomOut = () => applyScaleAtAnchor(scaleRef.current - BUTTON_ZOOM_STEP);
  const zoomReset = () => applyScaleAtAnchor(1);
  const getVisibleSceneCenter = () => {
    const frame = frameRef.current;
    if (!frame) {
      return { x: sceneBounds.width / 2, y: sceneBounds.height / 2 };
    }

    return {
      x: (frame.scrollLeft + frame.clientWidth / 2) / scaleRef.current,
      y: (frame.scrollTop + frame.clientHeight / 2) / scaleRef.current
    };
  };
  const organizeCanvas = () => {
    const targetCenter = getVisibleSceneCenter();
    setNodes((currentNodes) => autoLayoutNodes(currentNodes, edges, targetCenter));
  };
  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
    setConnectionDraft(null);
    setNodeDrag(null);
    setWaferDrag(null);
    setSnapGuides([]);
    setRoleMenu(null);
    setMoveMessage(null);
    nextNodeNumberRef.current = 1;
  };

  useEffect(() => {
    if (!steps.length || seededSignatureRef.current === stepSignature) {
      return;
    }

    const graph = getInitialGraph(steps);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setConnectionDraft(null);
    setNodeDrag(null);
    setWaferDrag(null);
    setSnapGuides([]);
    setRoleMenu(null);
    setMoveMessage(null);
    nextNodeNumberRef.current = steps.length + 1;
    seededSignatureRef.current = stepSignature;
  }, [stepSignature, steps]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const anchor = pendingZoomAnchorRef.current;

    if (!frame || !anchor) {
      return;
    }

    frame.scrollLeft = anchor.sceneX * scale - anchor.paneX;
    frame.scrollTop = anchor.sceneY * scale - anchor.paneY;
    pendingZoomAnchorRef.current = null;
  }, [scale]);

  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    const isMiddleMousePan = event.button === 1;
    const isModifiedLeftPan = event.button === 0 && event.altKey;

    if ((!isMiddleMousePan && !isModifiedLeftPan) || connectionDraft || nodeDrag || waferDrag) {
      return;
    }

    setRoleMenu(null);

    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    event.preventDefault();

    panStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: frame.scrollLeft,
      startScrollTop: frame.scrollTop
    };
    setIsPanning(true);
    frame.setPointerCapture(event.pointerId);
  };

  const updatePan = (event: PointerEvent<HTMLDivElement>) => {
    if (!isPanning || !panStateRef.current || connectionDraft || nodeDrag || waferDrag) {
      return;
    }

    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const dx = event.clientX - panStateRef.current.startX;
    const dy = event.clientY - panStateRef.current.startY;
    frame.scrollLeft = panStateRef.current.startScrollLeft - dx;
    frame.scrollTop = panStateRef.current.startScrollTop - dy;
  };

  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (!isPanning) {
      return;
    }

    const frame = frameRef.current;
    if (frame) {
      frame.releasePointerCapture(event.pointerId);
    }

    setIsPanning(false);
    panStateRef.current = null;
  };

  const createNode = (event: MouseEvent<SVGSVGElement>) => {
    if (event.detail !== 2 || event.button !== 0) {
      return;
    }

    const point = getScenePoint(event);
    const nodeNumber = nextNodeNumberRef.current;
    nextNodeNumberRef.current += 1;
    setRoleMenu(null);

    setNodes((currentNodes) => [
      ...currentNodes,
      {
        id: `local-step-${Date.now()}-${nodeNumber}`,
        label: `Step ${nodeNumber}`,
        subLabel: "Process step",
        x: Math.max(24, Math.round(point.x - NODE_WIDTH / 2)),
        y: Math.max(24, Math.round(point.y - NODE_HEIGHT / 2)),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        role: "normal",
        order: currentNodes.length,
        wafers: []
      }
    ]);
  };

  const beginConnection = (event: PointerEvent<SVGGElement>, nodeId: string) => {
    if (event.button !== 0 || !event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setRoleMenu(null);

    const point = getScenePoint(event);
    setConnectionDraft({
      from: nodeId,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      hasMoved: false
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleNodePointerDown = (event: PointerEvent<SVGGElement>, node: FlowNode) => {
    if (event.shiftKey) {
      beginConnection(event, node.id);
      return;
    }

    beginNodeDrag(event, node);
  };

  const beginNodeDrag = (event: PointerEvent<SVGGElement>, node: FlowNode) => {
    if (event.button !== 0 || connectionDraft) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setRoleMenu(null);

    const point = getScenePoint(event);
    setNodeDrag({
      nodeId: node.id,
      pointerId: event.pointerId,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateNodeDrag = (event: PointerEvent<SVGGElement>) => {
    if (!nodeDrag || nodeDrag.pointerId !== event.pointerId) {
      return;
    }

    const point = getScenePoint(event);
    const draggedNode = nodes.find((node) => node.id === nodeDrag.nodeId);
    if (!draggedNode) {
      setSnapGuides([]);
      return;
    }

    const snapped = getSnappedNodePosition(
      draggedNode,
      Math.round(point.x - nodeDrag.offsetX),
      Math.round(point.y - nodeDrag.offsetY),
      nodes
    );

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === nodeDrag.nodeId
          ? {
              ...node,
              x: snapped.x,
              y: snapped.y
            }
          : node
      )
    );
    setSnapGuides(snapped.guides);
  };

  const finishNodeDrag = (event: PointerEvent<SVGGElement>) => {
    if (!nodeDrag || nodeDrag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    setNodeDrag(null);
    setSnapGuides([]);
  };

  const beginWaferDrag = (event: PointerEvent<SVGGElement>, node: FlowNode, wafer: WaferPin) => {
    if (!onMoveWafer || event.button !== 0 || isMovePending) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setRoleMenu(null);
    setMoveMessage(null);

    const point = getScenePoint(event);
    setWaferDrag({
      assignmentId: wafer.assignmentId,
      sourceStepId: node.id,
      waferLabel: getWaferChipLabel(wafer),
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      hasMoved: false
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateWaferDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!waferDrag || waferDrag.pointerId !== event.pointerId) {
      return;
    }

    const point = getScenePoint(event);
    setWaferDrag((drag) =>
      drag
        ? {
            ...drag,
            x: point.x,
            y: point.y,
            hasMoved:
              drag.hasMoved ||
              Math.abs(point.x - drag.startX) > 6 ||
              Math.abs(point.y - drag.startY) > 6
          }
        : drag
    );
  };

  const finishWaferDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!waferDrag || waferDrag.pointerId !== event.pointerId) {
      return;
    }

    const finishedDrag = waferDrag;
    setWaferDrag(null);

    const point = getScenePoint(event);
    const target = nodes.find((node) => (
      node.role === "normal" &&
      node.id !== finishedDrag.sourceStepId &&
      nodeContainsPoint(node, point)
    ));

    if (!target || !onMoveWafer || !finishedDrag.hasMoved) {
      return;
    }

    setMoveMessage(`Moving ${finishedDrag.waferLabel} to ${target.label}...`);
    startMoveTransition(() => {
      void (async () => {
        const result = await onMoveWafer({
          assignmentId: finishedDrag.assignmentId,
          targetStepId: target.id,
          note: `Moved from process flow wireframe to ${target.label}.`
        });

        if (result.ok) {
          setMoveMessage(`Moved ${finishedDrag.waferLabel} to ${target.label}.`);
          router.refresh();
          return;
        }

        setMoveMessage(result.error);
      })();
    });
  };

  const updateConnection = (event: PointerEvent<SVGSVGElement>) => {
    if (waferDrag) {
      updateWaferDrag(event);
      return;
    }

    if (!connectionDraft || connectionDraft.pointerId !== event.pointerId) {
      return;
    }

    const point = getScenePoint(event);
    setConnectionDraft((draft) =>
      draft
        ? {
            ...draft,
            x: point.x,
            y: point.y,
            hasMoved:
              draft.hasMoved ||
              Math.abs(point.x - draft.startX) > 6 ||
              Math.abs(point.y - draft.startY) > 6
          }
        : draft
    );
  };

  const finishConnection = (event: PointerEvent<SVGSVGElement>) => {
    if (waferDrag) {
      finishWaferDrag(event);
      return;
    }

    if (!connectionDraft || connectionDraft.pointerId !== event.pointerId) {
      return;
    }

    const point = getScenePoint(event);
    const target = nodes.find((node) => node.id !== connectionDraft.from && nodeContainsPoint(node, point));

    if (target && connectionDraft.hasMoved) {
      setEdges((currentEdges) => {
        const exists = currentEdges.some((edge) => edge.from === connectionDraft.from && edge.to === target.id);
        if (exists) {
          return currentEdges;
        }

        const nextEdges: FlowEdge[] = [
          ...currentEdges,
          {
            id: `${connectionDraft.from}->${target.id}`,
            from: connectionDraft.from,
            to: target.id,
            kind: "flow"
          }
        ];

        return nextEdges;
      });
    }

    setConnectionDraft(null);
  };

  const openRoleMenu = (event: MouseEvent<SVGGElement>, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();

    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const frameRect = frame.getBoundingClientRect();
    setRoleMenu({
      nodeId,
      paneX: event.clientX - frameRect.left + frame.scrollLeft,
      paneY: event.clientY - frameRect.top + frame.scrollTop
    });
  };

  const setNodeRole = (nodeId: string, role: FlowNodeRole) => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id === nodeId) {
          return { ...node, role };
        }

        if (role !== "normal" && node.role === role) {
          return { ...node, role: "normal" };
        }

        return node;
      })
    );
    setRoleMenu(null);
  };

  const deleteNode = (nodeId: string) => {
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== nodeId));
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId));
    setConnectionDraft((draft) => (draft?.from === nodeId ? null : draft));
    setNodeDrag((drag) => (drag?.nodeId === nodeId ? null : drag));
    setSnapGuides([]);
    setRoleMenu(null);
  };

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const handleWheelFallback = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const isIntent = event.ctrlKey || event.metaKey;
      if (!isIntent) {
        frame.scrollLeft += event.deltaX;
        frame.scrollTop += event.deltaY;
        return;
      }

      const delta = event.deltaY > 0 ? -WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP;
      applyScaleAtAnchor(scaleRef.current + delta, getPanePoint(event.clientX, event.clientY));
    };

    const handleGestureStart = (event: Event) => {
      const gestureEvent = event as Event & { scale?: number };
      if (gestureEvent.scale && typeof gestureEvent.scale === "number") {
        pinchBaseScaleRef.current = scaleRef.current / gestureEvent.scale;
      } else {
        pinchBaseScaleRef.current = scaleRef.current;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as Event & { scale?: number };
      const gestureScale = gestureEvent.scale;
      if (gestureScale === undefined) {
        return;
      }

      const clientPoint =
        "clientX" in event && "clientY" in event
          ? getPanePoint(
              (event as Event & { clientX: number }).clientX,
              (event as Event & { clientY: number }).clientY
            )
          : getPanePoint();
      applyScaleAtAnchor(pinchBaseScaleRef.current * gestureScale, clientPoint);
      event.preventDefault();
      event.stopPropagation();
    };

    const handleGestureEnd = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    frame.addEventListener("wheel", handleWheelFallback, { passive: false });
    frame.addEventListener("gesturestart", handleGestureStart, { passive: false });
    frame.addEventListener("gesturechange", handleGestureChange, { passive: false });
    frame.addEventListener("gestureend", handleGestureEnd, { passive: false });

    return () => {
      frame.removeEventListener("wheel", handleWheelFallback);
      frame.removeEventListener("gesturestart", handleGestureStart);
      frame.removeEventListener("gesturechange", handleGestureChange);
      frame.removeEventListener("gestureend", handleGestureEnd);
    };
  }, [applyScaleAtAnchor, getPanePoint]);

  const draftSourceNode = connectionDraft ? nodeById.get(connectionDraft.from) : null;
  const draftPath = draftSourceNode
    ? makeDraftPath(draftSourceNode, { x: connectionDraft?.x ?? 0, y: connectionDraft?.y ?? 0 })
    : null;
  const roleMenuNode = roleMenu ? nodeById.get(roleMenu.nodeId) : null;

  return (
    <section className="flow-map-shell">
      <div className="flow-map-toolbar" aria-label="Flow map controls">
        <div className="flow-map-summary" aria-live="polite">
          <strong>Process flow</strong>
          <em>Track wafer movement through each fabrication step.</em>
          <span>
            {nodes.length} step{nodes.length === 1 ? "" : "s"} · {edges.length} path
            {edges.length === 1 ? "" : "s"}
          </span>
          {moveMessage ? <span>{moveMessage}</span> : null}
        </div>
        <div className="flow-map-actions" role="group" aria-label="Canvas controls">
          <button className="button button-secondary flow-icon-button" type="button" onClick={zoomOut} aria-label="Zoom out">
            −
          </button>
          <span className="flow-map-zoom">{Math.round(s * 100)}%</span>
          <button className="button button-secondary flow-icon-button" type="button" onClick={zoomIn} aria-label="Zoom in">
            +
          </button>
          <button className="button button-secondary flow-fit-button" type="button" onClick={zoomReset}>
            Fit view
          </button>
          <button className="button button-secondary flow-fit-button" type="button" onClick={organizeCanvas} disabled={nodes.length < 2}>
            Auto layout
          </button>
          <button className="button button-secondary" type="button" onClick={clearCanvas} disabled={nodes.length === 0}>
            Clear
          </button>
        </div>
      </div>

      <div
        ref={frameRef}
        className={`flow-map-frame ${isPanning ? "flow-map-frame--dragging" : ""}`}
        onPointerDown={beginPan}
        onPointerMove={updatePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onPointerLeave={endPan}
      >
        <svg
          ref={svgRef}
          className="flow-map-canvas flow-map-canvas--editable"
          width={scaledWidth}
          height={scaledHeight}
          viewBox={`0 0 ${sceneBounds.width} ${sceneBounds.height}`}
          style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}
          onPointerMove={updateConnection}
          onPointerUp={finishConnection}
          onPointerCancel={() => {
            setConnectionDraft(null);
            setWaferDrag(null);
          }}
          onDoubleClick={createNode}
          onContextMenu={(event) => {
            event.preventDefault();
            setRoleMenu(null);
          }}
        >
          <defs>
            <marker
              id="flowMapArrow"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink-blue)" />
            </marker>
          </defs>

          <rect className="flow-map-hit-area" x="0" y="0" width={sceneBounds.width} height={sceneBounds.height} />

          {snapGuides.map((guide) =>
            guide.orientation === "vertical" ? (
              <line
                key={guide.id}
                className="flow-snap-guide"
                x1={guide.value}
                y1={guide.start}
                x2={guide.value}
                y2={guide.end}
              />
            ) : (
              <line
                key={guide.id}
                className="flow-snap-guide"
                x1={guide.start}
                y1={guide.value}
                x2={guide.end}
                y2={guide.value}
              />
            )
          )}

          {edges.map((edge) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) {
              return null;
            }

            const isReturn = isReturnEdge(edge, from, to, edges);
            const path = makeNodePath(edge, from, to, edges, nodes);

            return (
              <path
                key={edge.id}
                d={path}
                className={`flow-edge ${isReturn ? "flow-edge--return" : ""}`}
                markerEnd="url(#flowMapArrow)"
              />
            );
          })}

          {draftPath ? (
            <path
              d={draftPath}
              className="flow-edge flow-edge--draft"
              markerEnd="url(#flowMapArrow)"
            />
          ) : null}

          {nodes.length === 0 ? (
            <g className="flow-empty-state" transform={`translate(${sceneBounds.width / 2} ${sceneBounds.height / 2})`}>
              <circle cx="0" cy="-8" r="28" />
              <path d="M -10 -8 H 10 M 0 -18 V 2" />
              <text x="0" y="46">
                Blank process canvas
              </text>
            </g>
          ) : null}

          {nodes.map((node) => {
            const visibleWafers = node.wafers.slice(0, MAX_NODE_CHIPS);
            const hiddenWaferCount = Math.max(0, node.wafers.length - visibleWafers.length);
            const active = hasActiveWafer(node);

            return (
            <g
              key={node.id}
              className={`flow-node flow-node--${node.role} ${active ? "flow-node--active" : ""} ${connectionDraft?.from === node.id ? "flow-node--connecting" : ""} ${
                nodeDrag?.nodeId === node.id ? "flow-node--dragging" : ""
              }`}
              transform={`translate(${node.x} ${node.y})`}
              onPointerDown={(event) => handleNodePointerDown(event, node)}
              onPointerMove={updateNodeDrag}
              onPointerUp={finishNodeDrag}
              onPointerCancel={finishNodeDrag}
              onContextMenu={(event) => openRoleMenu(event, node.id)}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <title>{`${node.label} · ${node.subLabel}`}</title>
              <rect x="0" y="0" width={node.width} height={node.height} rx="10" className="flow-node-card" />
              <path className="flow-node-icon" d={getNodeIconPath(node.role)} />
              <g
                className="flow-node-port-hit"
              >
                <circle cx={node.width - 24} cy="24" r="14" className="flow-node-port-target" />
                <circle cx={node.width - 24} cy="24" r="8" className="flow-node-port" />
              </g>
              <text x="64" y="34" className="flow-node-title">
                {truncateLabel(node.label, 20)}
              </text>
              <text x="64" y="56" className="flow-node-subtitle">
                {truncateLabel(node.subLabel, 28)}
              </text>
              {active ? (
                <g className="flow-node-active-pill" transform={`translate(${node.width - 78} 22)`}>
                  <rect x="0" y="0" width="56" height="22" rx="11" />
                  <text x="28" y="15">Active</text>
                </g>
              ) : null}
              <text x="64" y="82" className="flow-node-meta">
                {describeRole(node.role)}
              </text>
              <g transform="translate(64 96)">
                {visibleWafers.map((wafer, index) => (
                  <g
                    key={wafer.assignmentId}
                    className="flow-wafer-chip"
                    transform={`translate(${index * 42} 0)`}
                    onPointerDown={(event) => beginWaferDrag(event, node, wafer)}
                  >
                    <rect x="0" y="0" width="36" height="24" rx="6" />
                    <text x="18" y="16">{truncateLabel(getWaferChipLabel(wafer), 3)}</text>
                  </g>
                ))}
                {hiddenWaferCount > 0 ? (
                  <g className="flow-wafer-chip flow-wafer-chip--overflow" transform={`translate(${visibleWafers.length * 42} 0)`}>
                    <rect x="0" y="0" width="40" height="24" rx="6" />
                    <text x="20" y="16">+{hiddenWaferCount}</text>
                  </g>
                ) : null}
              </g>
            </g>
          );
          })}

          {waferDrag ? (
            <g
              className="flow-wafer-chip"
              pointerEvents="none"
              transform={`translate(${waferDrag.x + 12} ${waferDrag.y + 12})`}
              opacity="0.86"
            >
              <rect x="0" y="0" width="42" height="26" rx="6" />
              <text x="21" y="17">{truncateLabel(waferDrag.waferLabel, 4)}</text>
            </g>
          ) : null}
        </svg>

        {roleMenu && roleMenuNode ? (
          <div
            className="flow-role-menu"
            style={{
              left: `${roleMenu.paneX}px`,
              top: `${roleMenu.paneY}px`
            }}
            role="menu"
            aria-label={`${roleMenuNode.label} role`}
          >
            <button type="button" role="menuitem" onClick={() => setNodeRole(roleMenu.nodeId, "start")}>
              Beginning step
            </button>
            <button type="button" role="menuitem" onClick={() => setNodeRole(roleMenu.nodeId, "end")}>
              End step
            </button>
            <button type="button" role="menuitem" onClick={() => setNodeRole(roleMenu.nodeId, "normal")}>
              Normal step
            </button>
            <button
              type="button"
              role="menuitem"
              className="flow-role-menu-danger"
              onClick={() => deleteNode(roleMenu.nodeId)}
            >
              Delete step
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
