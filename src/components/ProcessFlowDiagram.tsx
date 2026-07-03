"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import type { ProcessStepNodeType, ProcessStepTransitionType, StepStatus } from "@/types/database";

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
  node_type?: ProcessStepNodeType;
  canvas_x?: number | null;
  canvas_y?: number | null;
  wafers: WaferPin[];
};

type DiagramTransition = {
  id: string;
  from_step_id: string;
  to_step_id: string;
  edge_type: ProcessStepTransitionType;
  label: string | null;
  priority: number;
};

type PersistedStepPayload = {
  id: string;
  name: string;
  process_area: string;
  step_order: number;
  node_type: ProcessStepNodeType;
  canvas_x: number | null;
  canvas_y: number | null;
};

type PersistedTransitionPayload = {
  id: string;
  from_step_id: string;
  to_step_id: string;
  edge_type: ProcessStepTransitionType;
  label: string | null;
  priority: number;
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
  isOptimistic?: boolean;
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
  startX: number;
  startY: number;
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

type GraphViewportFit = {
  centerX: number;
  centerY: number;
  scale: number;
};

const NODE_WIDTH = 276;
const NODE_HEIGHT = 134;
const SCENE_WIDTH = 4400;
const SCENE_HEIGHT = 3200;
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.6;
const BUTTON_ZOOM_STEP = 0.12;
const WHEEL_ZOOM_STEP = 0.08;
const PERSISTENCE_DEBOUNCE_MS = 420;
const POSITION_DEBOUNCE_MS = 250;
const NAME_DEBOUNCE_MS = 680;
const TRANSITION_RETRY_DELAY_MS = 520;
const TRANSITION_RETRY_LIMIT = 12;
const NODE_ID_PREFIX = "temp-step-";
const EDGE_ID_PREFIX = "temp-edge-";
const SNAP_THRESHOLD = 16;
const LAYOUT_CENTER_X = 520;
const LAYOUT_TOP_Y = 72;
const LAYOUT_GAP_Y = 96;
const LAYOUT_LANE_GAP_X = 380;
const LAYOUT_LOOP_GAP_X = 180;
const LAYOUT_LOOP_RADIUS_X = 250;
const LAYOUT_LOOP_RADIUS_Y = 110;
const EDGE_CURVE_OFFSET = 48;
const EDGE_NODE_CLEARANCE = 10;
const MAX_NODE_CHIPS = 4;
const WAFER_CHIP_WIDTH = 46;
const WAFER_CHIP_HEIGHT = 26;
const WAFER_CHIP_GAP = 52;
const FIT_VIEW_PADDING = 96;

type MoveWaferToProcessStepAction = (input: {
  assignmentId: string;
  targetStepId: string;
  note?: string | null;
  completeSourceStep?: boolean;
}) => Promise<ActionResult<unknown>>;

type CreateProcessFlowStepAction = (input: {
  templateId: string;
  name: string;
  processArea: string;
  nodeType: ProcessStepNodeType;
  canvasX: number;
  canvasY: number;
}) => Promise<ActionResult<PersistedStepPayload>>;

type UpdateProcessStepPositionsAction = (input: {
  positions: Array<{
    stepId: string;
    canvasX: number;
    canvasY: number;
  }>;
}) => Promise<ActionResult<unknown>>;

type UpdateProcessStepNameAction = (input: {
  stepId: string;
  name: string;
}) => Promise<ActionResult<PersistedStepPayload>>;

type UpdateProcessStepNodeTypeAction = (input: {
  stepId: string;
  nodeType: ProcessStepNodeType;
}) => Promise<ActionResult<PersistedStepPayload>>;

type CreateProcessStepTransitionAction = (input: {
  templateId: string;
  fromStepId: string;
  toStepId: string;
  edgeType: ProcessStepTransitionType;
  label?: string | null;
  priority?: number;
}) => Promise<ActionResult<PersistedTransitionPayload>>;

type DeleteProcessStepsAction = (input: {
  stepIds: string[];
}) => Promise<ActionResult<unknown>>;

function clampScale(nextScale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(nextScale.toFixed(2))));
}

function toFlowNodeRole(nodeType: ProcessStepNodeType | undefined): FlowNodeRole {
  if (nodeType === "start" || nodeType === "end") {
    return nodeType;
  }

  return "normal";
}

function toProcessStepNodeType(role: FlowNodeRole): ProcessStepNodeType {
  return role === "normal" ? "procedure" : role;
}

function getGraphBounds(nodes: FlowNode[]) {
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

function getInitialGraph(steps: DiagramStep[], transitions: DiagramTransition[]) {
  const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);
  const nodes: FlowNode[] = sortedSteps.map((step, index): FlowNode => ({
      id: step.id,
      label: step.name,
      subLabel: step.process_area,
      wafers: step.wafers,
      x: step.canvas_x ?? 0,
      y: step.canvas_y ?? 0,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      role: toFlowNodeRole(step.node_type),
      order: index + 1
    }));

  const nodeIds = new Set(nodes.map((node) => node.id));
  const persistedEdges: FlowEdge[] = transitions
    .filter((transition) => nodeIds.has(transition.from_step_id) && nodeIds.has(transition.to_step_id))
    .map((transition) => ({
      id: transition.id,
      from: transition.from_step_id,
      to: transition.to_step_id,
      kind: transition.edge_type
    }));
  const fallbackEdges: FlowEdge[] = persistedEdges.length
    ? []
    : nodes.slice(0, -1).map((node, index) => ({
        id: `fallback-${node.id}->${nodes[index + 1].id}`,
        from: node.id,
        to: nodes[index + 1].id,
        kind: "flow"
      }));
  const edges = persistedEdges.length ? persistedEdges : fallbackEdges;
  const hasMissingPositions = sortedSteps.some((step) => step.canvas_x === null || step.canvas_x === undefined || step.canvas_y === null || step.canvas_y === undefined);

  return {
    nodes: hasMissingPositions ? autoLayoutNodes(nodes, edges, { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT / 2 }) : nodes,
    edges
  };
}

function getGraphSignature(steps: DiagramStep[], transitions: DiagramTransition[]) {
  const stepSignature = [...steps]
    .sort((a, b) => a.step_order - b.step_order)
    .map((step) => `${step.id}:${step.step_order}:${step.name}:${step.process_area}:${step.node_type ?? "procedure"}:${step.canvas_x ?? "auto"}:${step.canvas_y ?? "auto"}:${step.wafers.length}`)
    .join("|");
  const transitionSignature = [...transitions]
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .map((transition) => `${transition.id}:${transition.from_step_id}:${transition.to_step_id}:${transition.edge_type}`)
    .join("|");

  return `${stepSignature}::${transitionSignature}`;
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

function isTextInputTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
}

type QueuedTransition = {
  id: string;
  fromStepId: string;
  toStepId: string;
  edgeType: ProcessStepTransitionType;
  priority: number;
  attempts?: number;
};

type QueuedStepCreate = {
  canvasX: number;
  canvasY: number;
  fallbackNode: FlowNode;
  stepArea: string;
  nodeType: ProcessStepNodeType;
};

export function ProcessFlowDiagram({
  steps,
  transitions = [],
  processTemplateId,
  onCreateStep,
  onUpdateStepPositions,
  onUpdateStepName,
  onUpdateStepNodeType,
  onCreateTransition,
  onDeleteSteps,
  onMoveWafer
}: {
  steps: DiagramStep[];
  transitions?: DiagramTransition[];
  processTemplateId?: string;
  onCreateStep?: CreateProcessFlowStepAction;
  onUpdateStepPositions?: UpdateProcessStepPositionsAction;
  onUpdateStepName?: UpdateProcessStepNameAction;
  onUpdateStepNodeType?: UpdateProcessStepNodeTypeAction;
  onCreateTransition?: CreateProcessStepTransitionAction;
  onDeleteSteps?: DeleteProcessStepsAction;
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
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [moveMessage, setMoveMessage] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeLabel, setEditingNodeLabel] = useState("");
  const editingInputRef = useRef<HTMLInputElement | null>(null);
  const [isMovePending, startMoveTransition] = useTransition();
  const [isGraphPending, startGraphTransition] = useTransition();
  const scaleRef = useRef(1);
  const pinchBaseScaleRef = useRef(1);
  const pendingZoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const pendingGraphFitRef = useRef<GraphViewportFit | null>(null);
  const pendingStepCreateRef = useRef<Map<string, QueuedStepCreate>>(new Map());
  const pendingTransitionCreateRef = useRef<Map<string, QueuedTransition>>(new Map());
  const pendingPositionUpdateRef = useRef<Map<string, { canvasX: number; canvasY: number }>>(new Map());
  const pendingNameUpdateRef = useRef<Map<string, string>>(new Map());
  type TimerHandle = NodeJS.Timeout | number | null;
  const pendingStepCreateTimerRef = useRef<TimerHandle>(null);
  const pendingTransitionCreateTimerRef = useRef<TimerHandle>(null);
  const pendingPositionTimerRef = useRef<TimerHandle>(null);
  const pendingNameTimerRef = useRef<TimerHandle>(null);
  const flushPendingTransitionCreatesRef = useRef<(() => Promise<void>) | null>(null);
  const panStateRef = useRef<{
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const graphSignature = useMemo(() => getGraphSignature(steps, transitions), [steps, transitions]);
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
  const selectedNodeCount = selectedNodeIds.size;
  const nodesRef = useRef<FlowNode[]>([]);
  const edgesRef = useRef<FlowEdge[]>([]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const getLatestNode = useCallback((nodeId: string) => (
    nodesRef.current.find((node) => node.id === nodeId) ?? null
  ), []);

  const isOptimisticStep = useCallback(
    (stepId: string) => stepId.startsWith(NODE_ID_PREFIX),
    []
  );

  const clearTimers = useCallback(() => {
    if (pendingStepCreateTimerRef.current) {
      window.clearTimeout(pendingStepCreateTimerRef.current);
    }

    if (pendingTransitionCreateTimerRef.current) {
      window.clearTimeout(pendingTransitionCreateTimerRef.current);
    }

    if (pendingPositionTimerRef.current) {
      window.clearTimeout(pendingPositionTimerRef.current);
    }

    if (pendingNameTimerRef.current) {
      window.clearTimeout(pendingNameTimerRef.current);
    }
  }, []);

  const setEditingNode = (nodeId: string | null) => {
    setEditingNodeId(nodeId);
    if (!nodeId) {
      setEditingNodeLabel("");
    }
  };

  const moveQueuedValues = <T,>(fromStepId: string, toStepId: string, map: Map<string, T>) => {
    if (!map.has(fromStepId)) {
      return;
    }

    const value = map.get(fromStepId);
    if (value === undefined) {
      return;
    }

    map.delete(fromStepId);
    if (!map.has(toStepId)) {
      map.set(toStepId, value);
    }
  };

  const remapQueuedTransitions = (fromStepId: string, toStepId: string) => {
    for (const transition of pendingTransitionCreateRef.current.values()) {
      if (transition.fromStepId === fromStepId) {
        transition.fromStepId = toStepId;
      }

      if (transition.toStepId === fromStepId) {
        transition.toStepId = toStepId;
      }
    }
  };

  const replaceOptimisticStepId = useCallback((temporaryStepId: string, persistedStep: PersistedStepPayload) => {
    const localLabel = getLatestNode(temporaryStepId)?.label.trim();
    const finalLabel = localLabel && localLabel.length >= 2 ? localLabel : persistedStep.name;

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === temporaryStepId
          ? {
              ...node,
              id: persistedStep.id,
              label: finalLabel,
              subLabel: persistedStep.process_area,
              order: persistedStep.step_order,
              isOptimistic: false
            }
          : node
      )
    );

    setEdges((currentEdges) =>
      currentEdges.map((edge) => ({
        ...edge,
        from: edge.from === temporaryStepId ? persistedStep.id : edge.from,
        to: edge.to === temporaryStepId ? persistedStep.id : edge.to
      }))
    );

    setSelectedNodeIds((current) => {
      if (!current.has(temporaryStepId)) {
        return current;
      }

      const next = new Set(current);
      next.delete(temporaryStepId);
      next.add(persistedStep.id);
      return next;
    });

    if (editingNodeId === temporaryStepId) {
      setEditingNodeId(persistedStep.id);
    }

    setConnectionDraft((draft) =>
      draft && draft.from === temporaryStepId ? { ...draft, from: persistedStep.id } : draft
    );

    setNodeDrag((drag) =>
      drag && drag.nodeId === temporaryStepId ? { ...drag, nodeId: persistedStep.id } : drag
    );

    setWaferDrag((drag) =>
      drag && drag.sourceStepId === temporaryStepId
        ? { ...drag, sourceStepId: persistedStep.id }
        : drag
    );

    remapQueuedTransitions(temporaryStepId, persistedStep.id);
    moveQueuedValues(temporaryStepId, persistedStep.id, pendingPositionUpdateRef.current);
    moveQueuedValues(temporaryStepId, persistedStep.id, pendingNameUpdateRef.current);

    if (finalLabel !== persistedStep.name) {
      pendingNameUpdateRef.current.set(persistedStep.id, finalLabel);
    }
  }, [editingNodeId, getLatestNode]);

  const clearQueuedStep = (stepId: string) => {
    pendingStepCreateRef.current.delete(stepId);
    pendingTransitionCreateRef.current.forEach((transition, localId) => {
      if (transition.fromStepId === stepId || transition.toStepId === stepId) {
        pendingTransitionCreateRef.current.delete(localId);
      }
    });
    pendingPositionUpdateRef.current.delete(stepId);
    pendingNameUpdateRef.current.delete(stepId);
  };

  const clearQueuedStepMaps = useCallback(() => {
    pendingStepCreateRef.current.clear();
    pendingTransitionCreateRef.current.clear();
    pendingPositionUpdateRef.current.clear();
    pendingNameUpdateRef.current.clear();
  }, []);

  const schedulePending = useCallback(
    (ref: { current: TimerHandle }, callback: () => Promise<void>, delay: number) => {
      if (ref.current) {
        window.clearTimeout(ref.current);
      }

      ref.current = window.setTimeout(() => {
        ref.current = null;
        void callback();
      }, delay);
    },
    []
  );

  const scheduleTransitionFlush = useCallback((delay: number) => {
    schedulePending(
      pendingTransitionCreateTimerRef,
      async () => {
        await flushPendingTransitionCreatesRef.current?.();
      },
      delay
    );
  }, [schedulePending]);

  const flushPendingNameUpdates = useCallback(async () => {
    if (!onUpdateStepName) {
      pendingNameUpdateRef.current.clear();
      return;
    }

    const entries = [...pendingNameUpdateRef.current.entries()].filter(([stepId]) => !isOptimisticStep(stepId));
    if (entries.length === 0) {
      return;
    }

    for (const [stepId] of entries) {
      pendingNameUpdateRef.current.delete(stepId);
    }

    for (const [stepId, name] of entries) {
      const trimmed = name.trim();
      if (trimmed.length < 2) {
        continue;
      }

      const result = await onUpdateStepName({
        stepId,
        name: trimmed
      });

      if (result.ok) {
        setNodes((current) =>
          current.map((node) =>
            node.id === stepId
              ? {
                  ...node,
                  label: result.data.name
                }
              : node
          )
        );
      } else {
        setMoveMessage(result.error);
      }
    }
  }, [isOptimisticStep, onUpdateStepName]);

  const flushPendingPositionUpdates = useCallback(async () => {
    if (!onUpdateStepPositions) {
      pendingPositionUpdateRef.current.clear();
      return;
    }

    const entries = [...pendingPositionUpdateRef.current.entries()].filter(([stepId]) => !isOptimisticStep(stepId));
    if (entries.length === 0) {
      return;
    }

    for (const [stepId] of entries) {
      pendingPositionUpdateRef.current.delete(stepId);
    }

    const result = await onUpdateStepPositions({
      positions: entries.map(([stepId, position]) => ({
        stepId,
        canvasX: position.canvasX,
        canvasY: position.canvasY
      }))
    });

    if (!result.ok) {
      setMoveMessage(result.error);
    }
  }, [isOptimisticStep, onUpdateStepPositions]);

  const flushPendingTransitionCreates = useCallback(async () => {
    if (!onCreateTransition || !processTemplateId) {
      return;
    }

    const queue = new Map(pendingTransitionCreateRef.current);
    pendingTransitionCreateRef.current.clear();

    for (const [localId, transition] of queue) {
      const draftEdgeExists = edgesRef.current.some((edge) => edge.id === localId);

      if (!draftEdgeExists) {
        continue;
      }

      if (isOptimisticStep(transition.fromStepId) || isOptimisticStep(transition.toStepId)) {
        const attempts = (transition.attempts ?? 0) + 1;
        if (attempts <= TRANSITION_RETRY_LIMIT) {
          pendingTransitionCreateRef.current.set(localId, { ...transition, attempts });
        } else {
          setMoveMessage("Transition save timed out before both steps were persisted.");
          setEdges((current) => current.filter((edge) => edge.id !== localId));
        }
        continue;
      }

      const result = await onCreateTransition({
        templateId: processTemplateId,
        fromStepId: transition.fromStepId,
        toStepId: transition.toStepId,
        edgeType: transition.edgeType,
        priority: transition.priority
      });

      if (!result.ok) {
        const attempts = (transition.attempts ?? 0) + 1;
        if (attempts <= TRANSITION_RETRY_LIMIT) {
          pendingTransitionCreateRef.current.set(localId, { ...transition, attempts });
          setMoveMessage("Retrying transition save...");
          continue;
        }

        setMoveMessage(result.error);
        setEdges((current) => current.filter((edge) => edge.id !== localId));
        continue;
      }

      const persisted = result.data;
      setEdges((currentEdges) =>
        currentEdges.map((edge) =>
          edge.id === localId
            ? {
                ...edge,
                id: persisted.id,
                from: persisted.from_step_id,
                to: persisted.to_step_id
              }
            : edge
        )
      );
    }

    if (pendingTransitionCreateRef.current.size > 0) {
      scheduleTransitionFlush(TRANSITION_RETRY_DELAY_MS);
    }
  }, [isOptimisticStep, onCreateTransition, processTemplateId, scheduleTransitionFlush]);

  useEffect(() => {
    flushPendingTransitionCreatesRef.current = flushPendingTransitionCreates;
  }, [flushPendingTransitionCreates]);

  const flushPendingStepCreates = useCallback(async () => {
    if (!onCreateStep || !processTemplateId) {
      return;
    }

    const queue = new Map(pendingStepCreateRef.current);
    pendingStepCreateRef.current.clear();

    for (const [temporaryStepId, payload] of queue) {
      const queuedPosition = pendingPositionUpdateRef.current.get(temporaryStepId);
      const canvasX = queuedPosition?.canvasX ?? payload.canvasX;
      const canvasY = queuedPosition?.canvasY ?? payload.canvasY;

      const result = await onCreateStep({
        templateId: processTemplateId,
        name: getLatestNode(temporaryStepId)?.label ?? payload.fallbackNode.label,
        processArea: payload.stepArea,
        nodeType: payload.nodeType,
        canvasX,
        canvasY
      });

      if (!result.ok) {
        setMoveMessage(result.error);
        setNodes((currentNodes) => currentNodes.filter((node) => node.id !== temporaryStepId));
        setEdges((currentEdges) => currentEdges.filter((edge) => edge.from !== temporaryStepId && edge.to !== temporaryStepId));
        clearQueuedStep(temporaryStepId);
        if (editingNodeId === temporaryStepId) {
          setEditingNode(null);
        }
        continue;
      }

      replaceOptimisticStepId(temporaryStepId, result.data);
    }

    if (pendingTransitionCreateRef.current.size > 0) {
      scheduleTransitionFlush(0);
    }

    if (pendingPositionUpdateRef.current.size > 0) {
      schedulePending(pendingPositionTimerRef, flushPendingPositionUpdates, 0);
    }

    if (pendingNameUpdateRef.current.size > 0) {
      schedulePending(pendingNameTimerRef, flushPendingNameUpdates, 0);
    }
  }, [
    editingNodeId,
    flushPendingNameUpdates,
    flushPendingPositionUpdates,
    getLatestNode,
    onCreateStep,
    processTemplateId,
    replaceOptimisticStepId,
    schedulePending,
    scheduleTransitionFlush
  ]);

  const queueNodeNamePersist = useCallback((stepId: string, name: string) => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      return;
    }

    if (isOptimisticStep(stepId)) {
      return;
    }

    pendingNameUpdateRef.current.set(stepId, trimmed);
    schedulePending(pendingNameTimerRef, flushPendingNameUpdates, NAME_DEBOUNCE_MS);
  }, [flushPendingNameUpdates, isOptimisticStep, schedulePending]);

  const queueNodePositionPersist = useCallback((stepId: string, canvasX: number, canvasY: number) => {
    pendingPositionUpdateRef.current.set(stepId, { canvasX, canvasY });
    if (isOptimisticStep(stepId)) {
      return;
    }

    schedulePending(pendingPositionTimerRef, flushPendingPositionUpdates, POSITION_DEBOUNCE_MS);
  }, [flushPendingPositionUpdates, isOptimisticStep, schedulePending]);

  const queueTransitionPersist = useCallback((transitionId: string, payload: QueuedTransition) => {
    pendingTransitionCreateRef.current.set(transitionId, payload);
    scheduleTransitionFlush(PERSISTENCE_DEBOUNCE_MS);
  }, [scheduleTransitionFlush]);

  const queueStepPersist = useCallback((stepId: string, payload: QueuedStepCreate) => {
    pendingStepCreateRef.current.set(stepId, payload);
    schedulePending(pendingStepCreateTimerRef, flushPendingStepCreates, PERSISTENCE_DEBOUNCE_MS);
  }, [flushPendingStepCreates, schedulePending]);

  useEffect(() => {
    if (!editingNodeId) {
      return;
    }

    const input = editingInputRef.current;
    if (!input) {
      return;
    }

    input.focus();
    input.select();
  }, [editingNodeId]);

  const clearEditingNode = useCallback(() => {
    setEditingNode(null);
    setEditingNodeLabel("");
  }, []);

  const beginNodeLabelEdit = useCallback((nodeId: string) => {
    const node = nodeById.get(nodeId);
    if (!node) {
      return;
    }

    setEditingNode(nodeId);
    setEditingNodeLabel(node.label);
  }, [nodeById]);

  const commitNodeLabel = useCallback((nodeId: string, raw: string) => {
    const nextLabel = raw.trim();
    const node = nodeById.get(nodeId);

    if (!node) {
      clearEditingNode();
      return;
    }

    if (nextLabel.length < 2) {
      setEditingNodeLabel(node.label);
      setMoveMessage("Node names must be at least 2 characters.");
      clearEditingNode();
      return;
    }

    if (nextLabel !== node.label) {
      setNodes((currentNodes) =>
        currentNodes.map((item) =>
          item.id === nodeId
            ? {
                ...item,
                label: nextLabel
              }
            : item
        )
      );
      queueNodeNamePersist(nodeId, nextLabel);
      setMoveMessage(`Saved ${nextLabel} name.`);
    }

    clearEditingNode();
  }, [clearEditingNode, nodeById, queueNodeNamePersist]);

  const cancelNodeLabelEdit = (nodeId: string) => {
    const currentNode = nodeById.get(nodeId);
    if (currentNode) {
      setNodes((currentNodes) =>
        currentNodes.map((item) =>
          item.id === nodeId
            ? {
                ...item,
                label: currentNode.label
              }
            : item
        )
      );
      setEditingNodeLabel(currentNode.label);
    }

    pendingNameUpdateRef.current.delete(nodeId);
    clearEditingNode();
  };

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

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

  const applyGraphFit = useCallback((fit: GraphViewportFit) => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    frame.scrollLeft = Math.max(0, Math.round(fit.centerX * fit.scale - frame.clientWidth / 2));
    frame.scrollTop = Math.max(0, Math.round(fit.centerY * fit.scale - frame.clientHeight / 2));
  }, []);

  const centerView = useCallback((targetNodes: FlowNode[] = nodes) => {
    const frame = frameRef.current;
    const bounds = getGraphBounds(targetNodes);
    if (!frame || !bounds) {
      return;
    }

    const availableWidth = Math.max(1, frame.clientWidth - FIT_VIEW_PADDING);
    const availableHeight = Math.max(1, frame.clientHeight - FIT_VIEW_PADDING);
    const nextScale = clampScale(Math.min(MAX_SCALE, availableWidth / bounds.width, availableHeight / bounds.height));
    const fit = {
      centerX: bounds.centerX,
      centerY: bounds.centerY,
      scale: nextScale
    };

    pendingGraphFitRef.current = fit;
    scaleRef.current = nextScale;
    setScale(nextScale);

    window.requestAnimationFrame(() => {
      if (pendingGraphFitRef.current === fit) {
        applyGraphFit(fit);
        pendingGraphFitRef.current = null;
      }
    });
  }, [applyGraphFit, nodes]);

  const organizeCanvas = () => {
    if (nodes.length < 2) {
      return;
    }

    if (!onUpdateStepPositions) {
      setMoveMessage("Graph position persistence is not available for this process view.");
      return;
    }

    const targetCenter = getVisibleSceneCenter();
    const nextNodes = autoLayoutNodes(nodes, edges, targetCenter);
    setNodes(nextNodes);
    setSelectedNodeIds(new Set());
    setRoleMenu(null);
    setMoveMessage("Organized process flow.");
    centerView(nextNodes);
    nextNodes.forEach((node) => {
      queueNodePositionPersist(node.id, node.x, node.y);
    });
  };

  useEffect(() => {
    if (seededSignatureRef.current === graphSignature) {
      return;
    }

    const graph = getInitialGraph(steps, transitions);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setConnectionDraft(null);
    setNodeDrag(null);
    setWaferDrag(null);
    setSnapGuides([]);
    setRoleMenu(null);
    setSelectedNodeIds(new Set());
    setMoveMessage(null);
    setEditingNode(null);
    clearQueuedStepMaps();
    clearTimers();
    seededSignatureRef.current = graphSignature;
    centerView(graph.nodes);
  }, [clearQueuedStepMaps, centerView, clearTimers, graphSignature, steps, transitions]);

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

  useLayoutEffect(() => {
    const fit = pendingGraphFitRef.current;
    if (!fit) {
      return;
    }

    applyGraphFit(fit);
    pendingGraphFitRef.current = null;
  }, [applyGraphFit, scale, scaledHeight, scaledWidth]);

  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    const isMiddleMousePan = event.button === 1;
    const isModifiedLeftPan = event.button === 0 && event.altKey;

    if ((!isMiddleMousePan && !isModifiedLeftPan) || connectionDraft || nodeDrag || waferDrag) {
      return;
    }

    setRoleMenu(null);
    setSelectedNodeIds(new Set());

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

  const clearSelectionIfOffNode = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as EventTarget | null;
    const hasNodeTarget = target instanceof Element && target.closest(".flow-node") !== null;
    if (hasNodeTarget) {
      return;
    }

    setRoleMenu(null);
    setSelectedNodeIds(new Set());
  };

  const createNode = (event: MouseEvent<SVGSVGElement>) => {
    if (event.detail !== 2 || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!processTemplateId || !onCreateStep) {
      setMoveMessage("Load an authenticated process template before editing the graph.");
      return;
    }

    const point = getScenePoint(event);
    const canvasX = Math.max(24, Math.round(point.x - NODE_WIDTH / 2));
    const canvasY = Math.max(24, Math.round(point.y - NODE_HEIGHT / 2));
    const temporaryStepId = `${NODE_ID_PREFIX}${Math.random().toString(36).slice(2, 10)}`;
    const fallbackNode: FlowNode = {
      id: temporaryStepId,
      label: "Untitled",
      subLabel: "Process step",
      wafers: [],
      x: canvasX,
      y: canvasY,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      role: "normal",
      order: nodes.length + 1,
      isOptimistic: true
    };

    setRoleMenu(null);
    setNodes((currentNodes) => [...currentNodes, fallbackNode]);
    setSelectedNodeIds(new Set([temporaryStepId]));
    setMoveMessage("Added step locally.");
    queueStepPersist(temporaryStepId, {
      canvasX,
      canvasY,
      fallbackNode,
      stepArea: "Process step",
      nodeType: "procedure"
    });
  };

  const beginConnection = (event: PointerEvent<SVGGElement>, nodeId: string) => {
    if (event.button !== 0 || !event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setRoleMenu(null);
    setSelectedNodeIds(new Set([nodeId]));

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
    event.stopPropagation();
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      setRoleMenu(null);
      setSelectedNodeIds((current) => {
        const next = new Set(current);
        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }
        return next;
      });
      return;
    }

    if (event.shiftKey) {
      beginConnection(event, node.id);
      return;
    }

    setSelectedNodeIds(new Set([node.id]));
    beginNodeDrag(event, node);
  };

  const beginNodeDrag = (event: PointerEvent<SVGGElement>, node: FlowNode) => {
    if (event.button !== 0 || connectionDraft) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setRoleMenu(null);
    setSelectedNodeIds((current) => current.has(node.id) ? current : new Set([node.id]));

    const point = getScenePoint(event);
    setNodeDrag({
      nodeId: node.id,
      pointerId: event.pointerId,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
      startX: node.x,
      startY: node.y
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
    const finishedDrag = nodeDrag;
    setNodeDrag(null);
    setSnapGuides([]);

    const draggedNode = nodes.find((node) => node.id === finishedDrag.nodeId);
    if (!draggedNode || (draggedNode.x === finishedDrag.startX && draggedNode.y === finishedDrag.startY)) {
      return;
    }

    queueNodePositionPersist(draggedNode.id, draggedNode.x, draggedNode.y);
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

    const sourceNode = nodeById.get(finishedDrag.sourceStepId);
    const completeSourceStep = Boolean(sourceNode && target.order > sourceNode.order);

    setMoveMessage(
      completeSourceStep
        ? `Completing ${sourceNode?.label ?? "source step"} and moving ${finishedDrag.waferLabel} to ${target.label}...`
        : `Moving ${finishedDrag.waferLabel} to ${target.label}...`
    );
    startMoveTransition(() => {
      void (async () => {
        const result = await onMoveWafer({
          assignmentId: finishedDrag.assignmentId,
          targetStepId: target.id,
          note: `Moved from process flow wireframe to ${target.label}.`,
          completeSourceStep
        });

        if (result.ok) {
          setMoveMessage(
            completeSourceStep
              ? `Completed source step and moved ${finishedDrag.waferLabel} to ${target.label}.`
              : `Moved ${finishedDrag.waferLabel} to ${target.label}.`
          );
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
    const finishedDraft = connectionDraft;
    const sourceNode = nodeById.get(finishedDraft.from);
    const target = nodes.find((node) => node.id !== finishedDraft.from && nodeContainsPoint(node, point));
    setConnectionDraft(null);

    if (!target || !sourceNode || !finishedDraft.hasMoved) {
      return;
    }

    const exists = edges.some((edge) => edge.from === finishedDraft.from && edge.to === target.id);
    if (exists) {
      setMoveMessage("That transition already exists.");
      return;
    }

    if (!processTemplateId || !onCreateTransition) {
      setMoveMessage("Graph transition persistence is not available for this process view.");
      return;
    }

    const edgeType: ProcessStepTransitionType = target.order < sourceNode.order ? "return" : "flow";
    const temporaryTransitionId = `${EDGE_ID_PREFIX}${Math.random().toString(36).slice(2, 10)}`;
    const transitionExists = edges.some((edge) => edge.from === finishedDraft.from && edge.to === target.id);
    if (transitionExists) {
      setMoveMessage("That transition already exists.");
      return;
    }

    setEdges((currentEdges) => [
      ...currentEdges,
      {
        id: temporaryTransitionId,
        from: finishedDraft.from,
        to: target.id,
        kind: edgeType
      }
    ]);
    setMoveMessage("Transition queued for save.");

    queueTransitionPersist(temporaryTransitionId, {
      id: temporaryTransitionId,
      fromStepId: finishedDraft.from,
      toStepId: target.id,
      edgeType,
      priority: edges.length * 10
    });
  };

  const openRoleMenu = (event: MouseEvent<SVGGElement>, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedNodeIds((current) => current.has(nodeId) ? current : new Set([nodeId]));

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
    setRoleMenu(null);
    if (!onUpdateStepNodeType) {
      setMoveMessage("Graph node type persistence is not available for this process view.");
      return;
    }

    const node = nodeById.get(nodeId);
    setMoveMessage(`Saving ${node?.label ?? "step"} role...`);

    startGraphTransition(() => {
      void (async () => {
        const result = await onUpdateStepNodeType({
          stepId: nodeId,
          nodeType: toProcessStepNodeType(role)
        });

        if (!result.ok) {
          setMoveMessage(result.error);
          return;
        }

        setNodes((currentNodes) =>
          currentNodes.map((currentNode) => {
            if (currentNode.id === nodeId) {
              return { ...currentNode, role };
            }

            if (role !== "normal" && currentNode.role === role) {
              return { ...currentNode, role: "normal" };
            }

            return currentNode;
          })
        );
        setMoveMessage(`Saved ${node?.label ?? "step"} role.`);
        router.refresh();
      })();
    });
  };

  const deleteNodes = useCallback((nodeIds: string[]) => {
    const uniqueNodeIds = Array.from(new Set(nodeIds)).filter((nodeId) => nodeById.has(nodeId));
    if (uniqueNodeIds.length === 0) {
      return;
    }

    if (!onDeleteSteps) {
      setMoveMessage("Graph deletion persistence is not available for this process view.");
      return;
    }

    const label = uniqueNodeIds.length === 1
      ? nodeById.get(uniqueNodeIds[0])?.label ?? "selected step"
      : `${uniqueNodeIds.length} selected steps`;
    setMoveMessage(`Deleting ${label}...`);

    startGraphTransition(() => {
      void (async () => {
        const result = await onDeleteSteps({ stepIds: uniqueNodeIds });

        if (!result.ok) {
          setMoveMessage(result.error);
          return;
        }

        const deletedIds = new Set(uniqueNodeIds);
        setNodes((currentNodes) => currentNodes.filter((node) => !deletedIds.has(node.id)));
        setEdges((currentEdges) => currentEdges.filter((edge) => !deletedIds.has(edge.from) && !deletedIds.has(edge.to)));
        setConnectionDraft((draft) => (draft && deletedIds.has(draft.from) ? null : draft));
        setNodeDrag((drag) => (drag && deletedIds.has(drag.nodeId) ? null : drag));
        setWaferDrag((drag) => (drag && deletedIds.has(drag.sourceStepId) ? null : drag));
        setSelectedNodeIds(new Set());
        setSnapGuides([]);
        setRoleMenu(null);
        setMoveMessage(`Deleted ${label}.`);
        router.refresh();
      })();
    });
  }, [nodeById, onDeleteSteps, router]);

  const deleteSelectedNodes = useCallback(() => {
    deleteNodes([...selectedNodeIds]);
  }, [deleteNodes, selectedNodeIds]);

  useEffect(() => {
    const onGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isTextInputTarget(event.target)) {
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedNodeIds.size > 0) {
        event.preventDefault();
        deleteSelectedNodes();
      }
    };

    window.addEventListener("keydown", onGlobalKeyDown);

    return () => {
      window.removeEventListener("keydown", onGlobalKeyDown);
    };
  }, [deleteSelectedNodes, selectedNodeIds]);

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
          {selectedNodeCount > 0 ? (
            <span>
              {selectedNodeCount} selected
            </span>
          ) : null}
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
          <button className="button button-secondary flow-fit-button" type="button" onClick={() => centerView()} disabled={nodes.length === 0}>
            Center view
          </button>
          <button className="button button-secondary flow-fit-button flow-auto-layout-button" type="button" onClick={organizeCanvas} disabled={nodes.length < 2 || isGraphPending}>
            Organize
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
          onPointerDown={clearSelectionIfOffNode}
          onDoubleClick={createNode}
          onContextMenu={(event) => {
            event.preventDefault();
            setRoleMenu(null);
            setSelectedNodeIds(new Set());
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
              } ${selectedNodeIds.has(node.id) ? "flow-node--selected" : ""}`}
              transform={`translate(${node.x} ${node.y})`}
              onPointerDown={(event) => handleNodePointerDown(event, node)}
              onPointerMove={updateNodeDrag}
              onPointerUp={finishNodeDrag}
              onPointerCancel={finishNodeDrag}
              onContextMenu={(event) => openRoleMenu(event, node.id)}
              onDoubleClick={(event) => {
                event.stopPropagation();
                beginNodeLabelEdit(node.id);
              }}
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
              {editingNodeId === node.id ? (
                <foreignObject x="58" y="20" width="190" height="34">
                  <div style={{ width: "190px", height: "34px" }}>
                    <input
                      ref={editingInputRef}
                      type="text"
                      className="flow-node-title-input"
                      value={editingNodeLabel}
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        setEditingNodeLabel(event.currentTarget.value);
                      }}
                      onBlur={(event) => commitNodeLabel(node.id, event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitNodeLabel(node.id, event.currentTarget.value);
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelNodeLabelEdit(node.id);
                        }
                      }}
                    />
                  </div>
                </foreignObject>
              ) : (
                <text x="64" y="34" className="flow-node-title">
                  {truncateLabel(node.label, 20)}
                </text>
              )}
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
                    transform={`translate(${index * WAFER_CHIP_GAP} 0)`}
                    onPointerDown={(event) => beginWaferDrag(event, node, wafer)}
                  >
                    <rect x="0" y="0" width={WAFER_CHIP_WIDTH} height={WAFER_CHIP_HEIGHT} rx="7" />
                    <text x={WAFER_CHIP_WIDTH / 2} y={WAFER_CHIP_HEIGHT / 2}>{truncateLabel(getWaferChipLabel(wafer), 4)}</text>
                  </g>
                ))}
                {hiddenWaferCount > 0 ? (
                  <g className="flow-wafer-chip flow-wafer-chip--overflow" transform={`translate(${visibleWafers.length * WAFER_CHIP_GAP} 0)`}>
                    <rect x="0" y="0" width={WAFER_CHIP_WIDTH} height={WAFER_CHIP_HEIGHT} rx="7" />
                    <text x={WAFER_CHIP_WIDTH / 2} y={WAFER_CHIP_HEIGHT / 2}>+{hiddenWaferCount}</text>
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
              <rect x="0" y="0" width={WAFER_CHIP_WIDTH} height={WAFER_CHIP_HEIGHT} rx="7" />
              <text x={WAFER_CHIP_WIDTH / 2} y={WAFER_CHIP_HEIGHT / 2}>{truncateLabel(waferDrag.waferLabel, 4)}</text>
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
              onClick={() => deleteNodes(selectedNodeIds.has(roleMenu.nodeId) ? [...selectedNodeIds] : [roleMenu.nodeId])}
            >
              {selectedNodeIds.size > 1 && selectedNodeIds.has(roleMenu.nodeId) ? "Delete selected steps" : "Delete step"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
