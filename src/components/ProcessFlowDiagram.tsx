"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
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

type ZoomAnchor = {
  paneX: number;
  paneY: number;
  sceneX: number;
  sceneY: number;
};

const NODE_WIDTH = 232;
const NODE_HEIGHT = 112;
const SCENE_WIDTH = 2200;
const SCENE_HEIGHT = 1600;
const MIN_SCALE = 0.8;
const MAX_SCALE = 2.6;
const BUTTON_ZOOM_STEP = 0.25;
const WHEEL_ZOOM_STEP = 0.18;
const SNAP_THRESHOLD = 16;
const LAYOUT_CENTER_X = 520;
const LAYOUT_TOP_Y = 96;
const LAYOUT_GAP_Y = 168;
const LAYOUT_LANE_GAP_X = 292;

function clampScale(nextScale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(nextScale.toFixed(2))));
}

function makeNodePath(from: FlowNode, to: FlowNode) {
  const fromPoint = getNodeBoundaryPoint(from, getNodeCenter(to));
  const toPoint = getNodeBoundaryPoint(to, getNodeCenter(from));

  return `M ${fromPoint.x} ${fromPoint.y} L ${toPoint.x} ${toPoint.y}`;
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

function makeDraftPath(from: FlowNode, target: { x: number; y: number }) {
  const fromPoint = getNodeBoundaryPoint(from, target);
  return `M ${fromPoint.x} ${fromPoint.y} L ${target.x} ${target.y}`;
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

function autoLayoutNodes(nodes: FlowNode[], edges: FlowEdge[]) {
  if (nodes.length === 0) {
    return nodes;
  }

  const orderedIds = orderNodes(nodes, edges);
  const rankById = new Map(nodes.map((node) => [node.id, 0]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const orderIndexById = new Map(orderedIds.map((id, index) => [id, index]));
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) {
      continue;
    }

    outgoing.get(edge.from)?.push(edge.to);
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
  }

  const starts = orderedIds.filter((id) => (incomingCount.get(id) ?? 0) === 0);
  const seedIds = starts.length ? starts : orderedIds.slice(0, 1);
  const visited = new Set<string>();

  const assignRanks = (nodeId: string, rank: number, activePath: Set<string>) => {
    const currentRank = rankById.get(nodeId) ?? 0;
    rankById.set(nodeId, Math.max(currentRank, rank));

    if (activePath.has(nodeId)) {
      return;
    }

    const nextPath = new Set(activePath);
    nextPath.add(nodeId);
    visited.add(nodeId);

    const nextIds = (outgoing.get(nodeId) ?? []).sort(
      (a, b) => (orderIndexById.get(a) ?? 0) - (orderIndexById.get(b) ?? 0)
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
  for (const id of orderedIds) {
    if (visited.has(id)) {
      disconnectedRank = Math.max(disconnectedRank, rankById.get(id) ?? 0);
      continue;
    }

    assignRanks(id, disconnectedRank + 1, new Set());
    disconnectedRank = Math.max(disconnectedRank, rankById.get(id) ?? 0);
  }

  const lanesByRank = new Map<number, string[]>();
  for (const id of orderedIds) {
    const rank = rankById.get(id) ?? 0;
    const current = lanesByRank.get(rank);
    if (current) {
      current.push(id);
    } else {
      lanesByRank.set(rank, [id]);
    }
  }

  const positioned = new Map<string, FlowNode>();
  for (const [rank, ids] of lanesByRank) {
    const startX = LAYOUT_CENTER_X - ((ids.length - 1) * LAYOUT_LANE_GAP_X) / 2;

    ids.forEach((id, laneIndex) => {
      const node = nodeById.get(id);
      if (!node) {
        return;
      }

      positioned.set(id, {
        ...node,
        x: Math.round(startX + laneIndex * LAYOUT_LANE_GAP_X),
        y: LAYOUT_TOP_Y + rank * LAYOUT_GAP_Y
      });
    });
  }

  return nodes.map((node) => positioned.get(node.id) ?? node);
}

function describeRole(role: FlowNodeRole) {
  if (role === "start") return "Start";
  if (role === "end") return "End";
  return "Step";
}

export function ProcessFlowDiagram({ steps: _steps }: { steps: DiagramStep[] }) {
  void _steps;

  const [scale, setScale] = useState(1);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [nodeDrag, setNodeDrag] = useState<NodeDrag | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [roleMenu, setRoleMenu] = useState<RoleMenu | null>(null);
  const [isPanning, setIsPanning] = useState(false);
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

  const getPaneAnchor = useCallback((clientX?: number, clientY?: number) => {
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

  const applyScaleAtAnchor = useCallback((
    nextScale: number,
    anchor: { paneX: number; paneY: number } | null = getPaneAnchor()
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
  }, [getPaneAnchor]);

  const zoomIn = () => applyScaleAtAnchor(scaleRef.current + BUTTON_ZOOM_STEP);
  const zoomOut = () => applyScaleAtAnchor(scaleRef.current - BUTTON_ZOOM_STEP);
  const zoomReset = () => applyScaleAtAnchor(1);
  const organizeCanvas = () => {
    setNodes((currentNodes) => autoLayoutNodes(currentNodes, edges));
  };
  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
    setConnectionDraft(null);
    setNodeDrag(null);
    setSnapGuides([]);
    setRoleMenu(null);
    nextNodeNumberRef.current = 1;
  };

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

  const getScenePoint = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) {
      return { x: 0, y: 0 };
    }

    const rect = svg.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / scaleRef.current,
      y: (event.clientY - rect.top) / scaleRef.current
    };
  };

  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    const isMiddleMousePan = event.button === 1;
    const isModifiedLeftPan = event.button === 0 && event.altKey;

    if ((!isMiddleMousePan && !isModifiedLeftPan) || connectionDraft || nodeDrag) {
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
    if (!isPanning || !panStateRef.current || connectionDraft || nodeDrag) {
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
        order: currentNodes.length
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

  const updateConnection = (event: PointerEvent<SVGSVGElement>) => {
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
      applyScaleAtAnchor(scaleRef.current + delta, getPaneAnchor(event.clientX, event.clientY));
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
          ? getPaneAnchor(
              (event as Event & { clientX: number }).clientX,
              (event as Event & { clientY: number }).clientY
            )
          : getPaneAnchor();
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
  }, [applyScaleAtAnchor, getPaneAnchor]);

  const draftSourceNode = connectionDraft ? nodeById.get(connectionDraft.from) : null;
  const draftPath = draftSourceNode
    ? makeDraftPath(draftSourceNode, { x: connectionDraft?.x ?? 0, y: connectionDraft?.y ?? 0 })
    : null;
  const roleMenuNode = roleMenu ? nodeById.get(roleMenu.nodeId) : null;

  return (
    <section className="flow-map-shell">
      <div className="flow-map-toolbar" aria-label="Flow map controls">
        <div className="flow-map-summary" aria-live="polite">
          <strong>Process graph</strong>
          <span>
            {nodes.length} step{nodes.length === 1 ? "" : "s"} · {edges.length} path
            {edges.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flow-map-actions" role="group" aria-label="Canvas controls">
          <button className="button button-secondary flow-icon-button" type="button" onClick={zoomOut} aria-label="Zoom out">
            −
          </button>
          <span className="flow-map-zoom">{Math.round(s * 100)}%</span>
          <button className="button button-secondary flow-icon-button" type="button" onClick={zoomIn} aria-label="Zoom in">
            +
          </button>
          <button className="button button-secondary" type="button" onClick={zoomReset}>
            Reset
          </button>
          <button className="button button-secondary" type="button" onClick={organizeCanvas} disabled={nodes.length < 2}>
            Organize
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
          onPointerCancel={() => setConnectionDraft(null)}
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

            const isReturn = to.y <= from.y;
            const path = makeNodePath(from, to);

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

          {nodes.map((node) => (
            <g
              key={node.id}
              className={`flow-node flow-node--${node.role} ${connectionDraft?.from === node.id ? "flow-node--connecting" : ""} ${
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
              <rect x="0" y="0" width={node.width} height={node.height} rx="10" className="flow-node-card" />
              <g
                className="flow-node-port-hit"
              >
                <circle cx={node.width - 24} cy="24" r="14" className="flow-node-port-target" />
                <circle cx={node.width - 24} cy="24" r="8" className="flow-node-port" />
              </g>
              <text x="14" y="30" className="flow-node-title">
                {node.label}
              </text>
              <text x="14" y="52" className="flow-node-subtitle">
                {node.subLabel}
              </text>
              <text x="14" y="78" className="flow-node-meta">
                {describeRole(node.role)}
              </text>
            </g>
          ))}
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
          </div>
        ) : null}
      </div>
    </section>
  );
}
