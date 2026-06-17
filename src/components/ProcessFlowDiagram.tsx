"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
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

type DiagramNode = {
  id: string;
  label: string;
  subLabel: string;
  x: number;
  y: number;
  width: number;
  height: number;
  wafers: WaferPin[];
  type: "normal" | "start" | "end";
  lane: number;
};

type DiagramEdge = {
  from: string;
  to: string;
  label?: string;
  kind: "flow" | "loop" | "return";
};

function formatWaferLabel(waferCode: string, dieLabel: string | null) {
  return dieLabel ? `${waferCode} • ${dieLabel}` : waferCode;
}

function statusTokenClass(status: StepStatus | null) {
  if (status === "running") {
    return "status-token--running";
  }

  if (status === "queued") {
    return "status-token--queued";
  }

  if (status === "failed" || status === "blocked") {
    return "status-token--failed";
  }

  return "status-token--done";
}

function ProcessChip({ pin, index, active }: { pin: WaferPin; index: number; active: boolean }) {
  return (
    <g transform={`translate(${20}, ${56 + index * 18})`}>
      <rect
        x="0"
        y="0"
        width="186"
        height="16"
        rx="8"
        className="flow-token"
      />
      <circle cx="10" cy="8" r="4" className={`status-dot ${statusTokenClass(pin.currentStepStatus)}`} />
      <text x="20" y="12" className="flow-token-text">
        {formatWaferLabel(pin.waferCode, pin.dieLabel)}
      </text>
      {active ? null : <text x="170" y="12" className="flow-token-status">queued</text>}
    </g>
  );
}

function makeLinePath(from: DiagramNode, to: DiagramNode, kind: "flow" | "loop" | "return") {
  const startX = from.x + from.width / 2;
  const endX = to.x + to.width / 2;
  const startBottom = from.y + from.height;
  const startTop = from.y;
  const endBottom = to.y + to.height;
  const endTop = to.y;

  if (kind === "flow") {
    const downDirection = endTop >= startBottom;
    const startY = downDirection ? startBottom : startTop;
    const endY = downDirection ? endTop : endBottom;
    const midY = (startY + endY) / 2;

    if (startX === endX) {
      return `M ${startX} ${startY} C ${startX} ${midY} ${endX} ${midY} ${endX} ${endY}`;
    }

    const cornerX = startX + (endX > startX ? 60 : -60);
    return `M ${startX} ${startY} C ${cornerX} ${startY} ${cornerX} ${endY} ${endX} ${endY}`;
  }

  if (kind === "loop") {
    const fromY = startBottom;
    const toY = endTop;
    const side = to.x > from.x ? 1 : -1;
    const sideOffset = 110 * (from.lane + 1);
    const controlX = startX + sideOffset * side;
    return `M ${startX} ${fromY} C ${controlX} ${fromY + 55} ${controlX} ${toY - 55} ${endX} ${toY}`;
  }

  const fromY = startTop;
  const toY = endTop;
  const side = to.x > from.x ? -1 : 1;
  const sideOffset = 130 * (from.lane + 1);
  const controlX = endX + sideOffset * side;
  return `M ${startX} ${fromY} C ${controlX} ${fromY - 55} ${controlX} ${toY + 55} ${endX} ${toY}`;
}

export function ProcessFlowDiagram({ steps }: { steps: DiagramStep[] }) {
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const scaleRef = useRef(1);
  const pinchBaseScaleRef = useRef(1);
  const panStateRef = useRef<{
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  const sortedSteps = useMemo(
    () => [...steps].sort((a, b) => a.step_order - b.step_order),
    [steps]
  );

  const graph = useMemo(() => {
    const nodeWidth = 232;
    const nodeHeight = 112;
    const gapY = 170;
    const laneSpacing = 290;
    const nodeY = 72;
    const startX = 360;

    const sanitized = sortedSteps.map((step, index) => ({
      id: step.id,
      name: step.name,
      subLabel: step.process_area,
      wafers: step.wafers,
      order: index
    }));

    const hasSteps = sanitized.length > 0;

    const loopLaneByStepId = new Map<string, number>();
    let loopLaneCounter = 1;

    sortedSteps.forEach((step, index) => {
      const nextStep = sortedSteps[index + 1];
      if (!nextStep) {
        return;
      }

      const isInspectionStep = step.name.toLowerCase().includes("inspection");
      const nextIsClean = nextStep.name.toLowerCase().includes("clean");

      if (isInspectionStep && nextIsClean && !loopLaneByStepId.has(nextStep.id)) {
        loopLaneByStepId.set(nextStep.id, loopLaneCounter);
        loopLaneCounter += 1;
      }
    });

    const nodes: DiagramNode[] = [
      {
        id: "start",
        label: "Start",
        subLabel: "Wafer intake",
        x: startX,
        y: nodeY,
        width: nodeWidth,
        height: nodeHeight,
        wafers: [],
        type: "start" as const,
        lane: 0
      },
      ...sanitized.map((step, index) => {
        const lane = loopLaneByStepId.get(step.id) ?? 0;
        const x = startX + lane * laneSpacing;
        const y = nodeY + (index + 1) * gapY;

        return {
          id: step.id,
          label: step.name,
          subLabel: step.subLabel,
          x,
          y,
          width: nodeWidth,
          height: nodeHeight,
          wafers: step.wafers,
          type: "normal" as const,
          lane
        };
      }),
      {
        id: "end",
        label: "Process end",
        subLabel: "All dies complete",
        x: startX,
        y: nodeY + (sanitized.length + 1) * gapY,
        width: nodeWidth,
        height: nodeHeight,
        wafers: [],
        type: "end" as const,
        lane: 0
      }
    ];

    const normalEdges: DiagramEdge[] = [];
    for (let i = 0; i < nodes.length - 1; i += 1) {
      normalEdges.push({
        from: nodes[i].id,
        to: nodes[i + 1].id,
        kind: "flow"
      });
    }

    const loopPairs = sortedSteps
      .map((step, index) => ({ step, index }))
      .filter(
        ({ step }) => step.name.toLowerCase().includes("inspection")
      )
      .map(({ index }) => {
        const cleanStep = sortedSteps[index + 1];
        if (!cleanStep || !cleanStep.name.toLowerCase().includes("clean")) {
          return null;
        }

        const nextStep = sortedSteps[index + 2];
        const nextAfterCleanId = nextStep ? nextStep.id : "end";

        return {
          inspectStepId: sortedSteps[index].id,
          cleanStepId: cleanStep.id,
          nextAfterCleanId
        };
      })
      .filter((pair): pair is NonNullable<{
        inspectStepId: string;
        cleanStepId: string;
        nextAfterCleanId: string;
      }> => pair !== null);

    // See docs/process-loop-summary.md for canonical loop contract:
    // inspection failure routes through clean, then back to EBL.
    let edges = normalEdges;
    if (loopPairs.length > 0) {
      for (const pair of loopPairs) {
        edges = edges.filter(
          (edge) =>
            !(edge.from === pair.inspectStepId && edge.to === pair.cleanStepId)
        );
      }

      edges = [
        ...edges,
        ...loopPairs.map((pair) => ({
          from: pair.inspectStepId,
          to: pair.cleanStepId,
          kind: "loop" as const,
          label: "Fail"
        })),
        ...loopPairs.map((pair) => ({
          from: pair.cleanStepId,
          to: pair.inspectStepId,
          kind: "return" as const,
          label: "Retry"
        })),
        ...loopPairs.map((pair) => ({
          from: pair.inspectStepId,
          to: pair.nextAfterCleanId,
          kind: "flow" as const,
          label: "Pass"
        }))
      ];
    }

    const allX = nodes.map((node) => node.x + node.width);
    const maxX = Math.max(...allX);
    const maxY = Math.max(...nodes.map((node) => node.y + node.height));

    const width = hasSteps ? maxX + 240 : 800;
    const height = Math.max(maxY + 140, nodeY + 860);

    return {
      nodes,
      edges,
      width,
      height,
      hasSteps
    };
  }, [sortedSteps]);

  const sceneWidth = graph.width;
  const sceneHeight = graph.height;
  const s = Math.min(2.6, Math.max(0.6, scale));
  const scaledWidth = Math.round(sceneWidth * s);
  const scaledHeight = Math.round(sceneHeight * s);

  const zoomIn = () => setScale((value) => Math.min(2.6, value + 0.1));
  const zoomOut = () => setScale((value) => Math.max(0.6, value - 0.1));
  const zoomReset = () => setScale(1);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
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
    if (!isPanning || !panStateRef.current) {
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

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const clampScale = (nextScale: number) =>
      Math.min(2.6, Math.max(0.6, Number(nextScale.toFixed(2))));

    const applyScale = (nextScale: number) => {
      const bounded = clampScale(nextScale);
      setScale((current) => (current === bounded ? current : bounded));
    };

    const handleWheelFallback = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const isIntent = event.ctrlKey || event.metaKey;
      if (!isIntent) {
        frame.scrollLeft += event.deltaX;
        frame.scrollTop += event.deltaY;
        return;
      }

      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      applyScale(scaleRef.current + delta);
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

      applyScale(pinchBaseScaleRef.current * gestureScale);
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

  return (
    <section className="flow-map-shell">
      <div className="flow-map-toolbar" aria-label="Flow map controls">
        <div>
          <p className="flow-map-help">
            Use this map to scan the process flow. Ctrl/Cmd + scroll to zoom,
            drag to pan.
          </p>
          <p className="flow-map-help flow-map-reference">
            Logic reference: docs/process-loop-summary.md
          </p>
        </div>
        <div className="flow-map-actions" role="group" aria-label="Zoom controls">
          <button className="button button-secondary" type="button" onClick={zoomOut}>
            −
          </button>
          <span className="flow-map-zoom">{Math.round(s * 100)}%</span>
          <button className="button button-secondary" type="button" onClick={zoomIn}>
            +
          </button>
          <button className="button button-secondary" type="button" onClick={zoomReset}>
            Reset
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
        {graph.hasSteps ? (
          <svg
            className="flow-map-canvas"
            width={scaledWidth}
            height={scaledHeight}
            viewBox={`0 0 ${sceneWidth} ${sceneHeight}`}
            style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}
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

            {graph.edges.map((edge) => {
              const from = graph.nodes.find((node) => node.id === edge.from);
              const to = graph.nodes.find((node) => node.id === edge.to);
              if (!from || !to) {
                return null;
              }

              const path = makeLinePath(from, to, edge.kind);
              const labelX = (from.x + to.x) / 2;
              const labelY = (from.y + to.y) / 2 - 10;

              return (
                <g key={`${edge.from}-${edge.to}-${edge.label ?? ""}`}>
                  <path d={path} fill="none" className={`flow-edge flow-edge--${edge.kind}`} markerEnd="url(#flowMapArrow)" />
                  {edge.label ? (
                    <text x={labelX} y={labelY} className="flow-edge-label">
                      {edge.label}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {graph.nodes.map((node) => {
              const pinPreview = node.wafers.slice(0, 4);

              return (
                <g
                  key={node.id}
                  className={`flow-node flow-node--${node.type}`}
                  transform={`translate(${node.x} ${node.y})`}
                >
                  <rect x="0" y="0" width={node.width} height={node.height} rx="12" className="flow-node-card" />
                  <text x="12" y="28" className="flow-node-title">
                    {node.label}
                  </text>
                  <text x="12" y="46" className="flow-node-subtitle">
                    {node.subLabel}
                  </text>
                  <text x="12" y="66" className="flow-node-meta">
                    {node.wafers.length} die{node.wafers.length === 1 ? "" : "s"}
                  </text>
                  <g>
                    {pinPreview.map((pin, pinIndex) => (
                      <ProcessChip key={pin.assignmentId} pin={pin} index={pinIndex} active={pin.currentStepStatus === "running"} />
                    ))}
                  </g>
                </g>
              );
            })}
          </svg>
        ) : null}
      </div>

      {graph.hasSteps ? null : (
        <p className="muted" style={{ margin: 0 }}>
          No configured flow steps for this process.
        </p>
      )}
    </section>
  );
}
