"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const NODE_WIDTH = 232;
const NODE_HEIGHT = 112;
const SCENE_WIDTH = 2200;
const SCENE_HEIGHT = 1600;
const MIN_SCALE = 0.8;
const MAX_SCALE = 2.6;
const BUTTON_ZOOM_STEP = 0.25;
const WHEEL_ZOOM_STEP = 0.18;
const LAYOUT_CENTER_X = 520;
const LAYOUT_TOP_Y = 96;
const LAYOUT_GAP_Y = 168;
const LAYOUT_LANE_GAP_X = 292;

function clampScale(nextScale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(nextScale.toFixed(2))));
}

function makeNodePath(from: FlowNode, to: FlowNode) {
  const fromCenterX = from.x + from.width / 2;
  const toCenterX = to.x + to.width / 2;
  const fromBottom = from.y + from.height;
  const fromTop = from.y;
  const toTop = to.y;
  const toBottom = to.y + to.height;
  const downDirection = toTop >= fromBottom;
  const startY = downDirection ? fromBottom : fromTop;
  const endY = downDirection ? toTop : toBottom;
  const midY = (startY + endY) / 2;

  if (Math.abs(fromCenterX - toCenterX) < 1) {
    return `M ${fromCenterX} ${startY} C ${fromCenterX} ${midY} ${toCenterX} ${midY} ${toCenterX} ${endY}`;
  }

  const cornerX = fromCenterX + (toCenterX > fromCenterX ? 72 : -72);
  return `M ${fromCenterX} ${startY} C ${cornerX} ${startY} ${cornerX} ${endY} ${toCenterX} ${endY}`;
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

  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const queue = nodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .sort((a, b) => a.order - b.order)
    .map((node) => node.id);
  const sortedIds: string[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      break;
    }

    sortedIds.push(currentId);

    for (const nextId of outgoing.get(currentId) ?? []) {
      const nextIncoming = (incoming.get(nextId) ?? 0) - 1;
      incoming.set(nextId, nextIncoming);
      if (nextIncoming === 0) {
        queue.push(nextId);
        queue.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
      }
    }
  }

  const missing = nodes
    .filter((node) => !sortedIds.includes(node.id))
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
  const sortedEdges = [...edges].sort(
    (a, b) => (orderIndexById.get(a.from) ?? 0) - (orderIndexById.get(b.from) ?? 0)
  );

  for (const id of orderedIds) {
    for (const edge of sortedEdges.filter((candidate) => candidate.from === id)) {
      const fromRank = rankById.get(edge.from) ?? 0;
      const toRank = rankById.get(edge.to) ?? 0;
      const isForward = (orderIndexById.get(edge.from) ?? 0) < (orderIndexById.get(edge.to) ?? 0);

      if (isForward) {
        rankById.set(edge.to, Math.max(toRank, fromRank + 1));
      }
    }
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
  const [isPanning, setIsPanning] = useState(false);
  const scaleRef = useRef(1);
  const pinchBaseScaleRef = useRef(1);
  const nextNodeNumberRef = useRef(1);
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

  const applyCenteredScale = (nextScale: number) => {
    const frame = frameRef.current;
    const currentScale = scaleRef.current;
    const boundedScale = clampScale(nextScale);

    if (!frame || boundedScale === currentScale) {
      setScale(boundedScale);
      return;
    }

    const centerX = (frame.scrollLeft + frame.clientWidth / 2) / currentScale;
    const centerY = (frame.scrollTop + frame.clientHeight / 2) / currentScale;

    setScale(boundedScale);
    scaleRef.current = boundedScale;

    requestAnimationFrame(() => {
      frame.scrollLeft = centerX * boundedScale - frame.clientWidth / 2;
      frame.scrollTop = centerY * boundedScale - frame.clientHeight / 2;
    });
  };

  const zoomIn = () => applyCenteredScale(scaleRef.current + BUTTON_ZOOM_STEP);
  const zoomOut = () => applyCenteredScale(scaleRef.current - BUTTON_ZOOM_STEP);
  const zoomReset = () => applyCenteredScale(1);
  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
    setConnectionDraft(null);
    nextNodeNumberRef.current = 1;
  };

  useEffect(() => {
    scaleRef.current = scale;
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
    if (event.button !== 0 || connectionDraft) {
      return;
    }

    const frame = frameRef.current;
    if (!frame) {
      return;
    }

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
    if (!isPanning || !panStateRef.current || connectionDraft) {
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
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

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

        setNodes((currentNodes) => autoLayoutNodes(currentNodes, nextEdges));
        return nextEdges;
      });
    }

    setConnectionDraft(null);
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
      applyCenteredScale(scaleRef.current + delta);
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

      applyCenteredScale(pinchBaseScaleRef.current * gestureScale);
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
  }, []);

  const draftSourceNode = connectionDraft ? nodeById.get(connectionDraft.from) : null;
  const draftPath = draftSourceNode
    ? `M ${draftSourceNode.x + draftSourceNode.width / 2} ${draftSourceNode.y + draftSourceNode.height / 2} L ${connectionDraft?.x ?? 0} ${connectionDraft?.y ?? 0}`
    : null;

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
              className={`flow-node flow-node--${node.role} ${connectionDraft?.from === node.id ? "flow-node--connecting" : ""}`}
              transform={`translate(${node.x} ${node.y})`}
              onPointerDown={(event) => beginConnection(event, node.id)}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <rect x="0" y="0" width={node.width} height={node.height} rx="10" className="flow-node-card" />
              <circle cx={node.width - 24} cy="24" r="8" className="flow-node-port" />
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
      </div>
    </section>
  );
}
