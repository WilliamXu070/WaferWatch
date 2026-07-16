import { useEffect, useRef } from "react";
import type { ChangeEvent, KeyboardEvent, MouseEvent, PointerEvent, RefObject } from "react";
import {
  NODE_CHIP_COLUMNS,
  WAFER_CHIP_GAP_X,
  WAFER_CHIP_GAP_Y,
  WAFER_CHIP_HEIGHT,
  WAFER_CHIP_WIDTH
} from "./constants";
import { getCheckpointPhase, getCheckpointStateLabel } from "./checkpointPhase";
import {
  getNodeIconPath,
  getWaferChipLabel,
  hasActiveWafer,
  truncateLabel
} from "./labels";
import { getNearestWaferGridIndex, getStepDoubleClickAction } from "./interactions";
import type { FlowNode, WaferDrag, WaferPin } from "./types";

const MOBILE_WAFER_TOUCH_RADIUS_PX = 28;

type FlowNodeCardProps = {
  node: FlowNode;
  isConnecting: boolean;
  isDragging: boolean;
  dropTargetKind: "submit" | "move" | "restore" | null;
  isSelected: boolean;
  selectedWaferAssignmentIds: ReadonlySet<string>;
  isEditing: boolean;
  editingNodeLabel: string;
  editingInputRef: RefObject<HTMLInputElement | null>;
  onNodePointerDown: (event: PointerEvent<SVGGElement>, node: FlowNode) => void;
  onNodePointerMove: (event: PointerEvent<SVGGElement>) => void;
  onNodePointerUp: (event: PointerEvent<SVGGElement>) => void;
  onNodePointerCancel: (event: PointerEvent<SVGGElement>) => void;
  onNodeContextMenu: (event: MouseEvent<SVGGElement>, nodeId: string) => void;
  onBeginLabelEdit: (nodeId: string) => void;
  onEditingLabelChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onCommitLabel: (nodeId: string, value: string) => void;
  onCancelLabelEdit: (nodeId: string) => void;
  onBeginWaferDrag: (event: PointerEvent<SVGGElement>, node: FlowNode, wafer: WaferPin) => void;
  onSelectWafer: (nodeId: string, wafer: WaferPin) => void;
  onOpenWaferDetails: (wafer: WaferPin) => void;
  onOpenStepParameters: (nodeId: string) => void;
};

export function FlowNodeCard({
  node,
  isConnecting,
  isDragging,
  dropTargetKind,
  isSelected,
  selectedWaferAssignmentIds,
  isEditing,
  editingNodeLabel,
  editingInputRef,
  onNodePointerDown,
  onNodePointerMove,
  onNodePointerUp,
  onNodePointerCancel,
  onNodeContextMenu,
  onBeginLabelEdit,
  onEditingLabelChange,
  onCommitLabel,
  onCancelLabelEdit,
  onBeginWaferDrag,
  onSelectWafer,
  onOpenWaferDetails,
  onOpenStepParameters
}: FlowNodeCardProps) {
  const active = hasActiveWafer(node);
  const phaseClipId = `flow-node-phase-clip-${node.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const beginningWafers = node.wafers.filter((wafer) => getCheckpointPhase(wafer.currentStepStatus) === "beginning");
  const completeWafers = node.wafers.filter((wafer) => getCheckpointPhase(wafer.currentStepStatus) === "complete");
  const nodeCardRef = useRef<SVGGElement>(null);
  const lanePointerWafersRef = useRef<Map<number, WaferPin>>(new Map());

  const getLaneWafer = (
    event: PointerEvent<SVGGElement> | MouseEvent<SVGGElement>,
    wafers: readonly WaferPin[]
  ) => {
    const svg = event.currentTarget.ownerSVGElement;
    const matrix = event.currentTarget.getScreenCTM();
    if (!svg || !matrix) {
      return wafers[0] ?? null;
    }

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const localPoint = point.matrixTransform(matrix.inverse());
    const waferIndex = getNearestWaferGridIndex({
      x: localPoint.x,
      y: localPoint.y,
      waferCount: wafers.length
    });
    if (waferIndex === null) {
      return null;
    }

    const chipCenter = svg.createSVGPoint();
    chipCenter.x = (waferIndex % NODE_CHIP_COLUMNS) * WAFER_CHIP_GAP_X + WAFER_CHIP_WIDTH / 2;
    chipCenter.y = Math.floor(waferIndex / NODE_CHIP_COLUMNS) * WAFER_CHIP_GAP_Y + WAFER_CHIP_HEIGHT / 2;
    const screenChipCenter = chipCenter.matrixTransform(matrix);
    if (Math.hypot(event.clientX - screenChipCenter.x, event.clientY - screenChipCenter.y) > MOBILE_WAFER_TOUCH_RADIUS_PX) {
      return null;
    }

    return wafers[waferIndex] ?? null;
  };

  useEffect(() => {
    const el = nodeCardRef.current;
    if (!el) return;
    const inputFo = el.querySelector("foreignObject");
    const preventScroll = (e: TouchEvent) => {
      if (inputFo && inputFo.contains(e.target as Node)) return;
      e.preventDefault();
    };
    el.addEventListener("touchstart", preventScroll, { passive: false });
    return () => el.removeEventListener("touchstart", preventScroll);
  }, []);

  const renderWaferChip = (wafer: WaferPin, index: number) => (
    <WaferChip
      key={wafer.assignmentId}
      label={getWaferChipLabel(wafer)}
      x={(index % NODE_CHIP_COLUMNS) * WAFER_CHIP_GAP_X}
      y={Math.floor(index / NODE_CHIP_COLUMNS) * WAFER_CHIP_GAP_Y}
      isSelected={selectedWaferAssignmentIds.has(wafer.assignmentId)}
      status={wafer.currentStepStatus}
      title={`${getWaferChipLabel(wafer)} · ${getCheckpointStateLabel(wafer.currentStepStatus)}`}
      onPointerDown={(event) => {
        event.stopPropagation();
        onBeginWaferDrag(event, node, wafer);
      }}
      onPointerUp={() => {
        onSelectWafer(node.id, wafer);
      }}
      onDoubleClick={() => onOpenWaferDetails(wafer)}
    />
  );

  const renderLaneTouchLayer = (
    phase: "beginning" | "complete",
    wafers: readonly WaferPin[],
    x: number
  ) => wafers.length > 0 ? (
    <g
      className="flow-node-wafer-touch-layer"
      data-checkpoint-phase={phase}
      style={{ touchAction: "none" }}
      transform={`translate(${x} 90)`}
      onPointerDown={(event) => {
        const wafer = getLaneWafer(event, wafers);
        if (!wafer) return;
        lanePointerWafersRef.current.set(event.pointerId, wafer);
        onBeginWaferDrag(event, node, wafer);
      }}
      onPointerUp={(event) => {
        const wafer = lanePointerWafersRef.current.get(event.pointerId);
        lanePointerWafersRef.current.delete(event.pointerId);
        if (!wafer) return;
        onSelectWafer(node.id, wafer);
      }}
      onPointerCancel={(event) => {
        lanePointerWafersRef.current.delete(event.pointerId);
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const wafer = getLaneWafer(event, wafers);
        if (wafer) {
          onOpenWaferDetails(wafer);
        } else {
          onOpenStepParameters(node.id);
        }
      }}
    >
      <rect
        className="flow-node-wafer-touch-target"
        x={-18}
        y={-16}
        width={node.width / 2}
        height={node.height - 74}
        style={{ touchAction: "none" }}
      />
    </g>
  ) : null;

  return (
    <g
      ref={nodeCardRef}
      data-node-id={node.id}
      className={`flow-node flow-node--${node.role} ${active ? "flow-node--active" : ""} ${isConnecting ? "flow-node--connecting" : ""} ${
        isDragging ? "flow-node--dragging" : ""
      } ${dropTargetKind ? "flow-node--drop-target" : ""} ${
        dropTargetKind === "submit" ? "flow-node--drop-target-submit" : ""
      } ${dropTargetKind === "restore" ? "flow-node--drop-target-restore" : ""
      } ${isSelected ? "flow-node--selected" : ""}`}
      transform={`translate(${node.x} ${node.y})`}
      onPointerDown={(event) => onNodePointerDown(event, node)}
      onPointerMove={onNodePointerMove}
      onPointerUp={onNodePointerUp}
      onPointerCancel={onNodePointerCancel}
      onContextMenu={(event) => onNodeContextMenu(event, node.id)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        const svg = event.currentTarget.ownerSVGElement;
        const matrix = event.currentTarget.getScreenCTM();
        if (!svg || !matrix) {
          onOpenStepParameters(node.id);
          return;
        }

        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const localPoint = point.matrixTransform(matrix.inverse());
        if (getStepDoubleClickAction({ x: localPoint.x, y: localPoint.y, nodeWidth: node.width }) === "rename") {
          onBeginLabelEdit(node.id);
        } else {
          onOpenStepParameters(node.id);
        }
      }}
    >
      <title>{node.label}</title>
      <defs>
        <clipPath id={phaseClipId}>
          <rect x="1" y="1" width={node.width - 2} height={node.height - 2} rx="9" />
        </clipPath>
      </defs>
      <rect x="0" y="0" width={node.width} height={node.height} rx="10" className="flow-node-card" style={{ touchAction: "none" }} />
      <g clipPath={`url(#${phaseClipId})`}>
        <rect x="1" y="54" width={(node.width - 2) / 2} height={node.height - 55} className="flow-node-phase flow-node-phase--beginning" />
        <rect x={node.width / 2} y="54" width={(node.width - 2) / 2} height={node.height - 55} className="flow-node-phase flow-node-phase--complete" />
        <line x1={node.width / 2} y1="54" x2={node.width / 2} y2={node.height - 1} className="flow-node-phase-divider" />
      </g>
      <path className="flow-node-icon" d={getNodeIconPath(node.role)} style={{ touchAction: "none" }} />
      <text x="31" y="35" className="flow-node-order" style={{ touchAction: "none" }}>
        {node.order}
      </text>
      <g className="flow-node-port-hit">
        <circle cx={node.width - 24} cy="24" r="14" className="flow-node-port-target" style={{ touchAction: "none" }} />
        <circle cx={node.width - 24} cy="24" r="8" className="flow-node-port" style={{ touchAction: "none" }} />
      </g>
      {isEditing ? (
        <foreignObject
          x="62"
          y="17"
          width={Math.max(150, node.width - 104)}
          height="26"
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div className="flow-node-title-input-frame">
            <input
              ref={editingInputRef}
              type="text"
              className="flow-node-title-input"
              value={editingNodeLabel}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={onEditingLabelChange}
              onBlur={(event) => onCommitLabel(node.id, event.currentTarget.value)}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommitLabel(node.id, event.currentTarget.value);
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelLabelEdit(node.id);
                }
              }}
            />
          </div>
        </foreignObject>
      ) : (
        <text x="64" y="34" className="flow-node-title" style={{ touchAction: "none" }}>
          {truncateLabel(node.label, 28)}
        </text>
      )}
      {active ? (
        <g className="flow-node-active-pill" transform={`translate(${node.width - 78} 22)`}>
          <rect x="0" y="0" width="56" height="22" rx="11" style={{ touchAction: "none" }} />
          <text x="28" y="15" style={{ touchAction: "none" }}>Active</text>
        </g>
      ) : null}
      <text x="18" y="76" className="flow-node-phase-label">Beginning</text>
      <text x={node.width / 2 + 18} y="76" className="flow-node-phase-label">Complete</text>
      <text x={node.width - 18} y="76" textAnchor="end" className="flow-node-reviewer-label">
        {node.requiredReviewerName ? `Reviewer: ${truncateLabel(node.requiredReviewerName, 16)}` : "Reviewer required"}
      </text>
      <g transform="translate(18 90)">
        {beginningWafers.map(renderWaferChip)}
      </g>
      <g transform={`translate(${node.width / 2 + 18} 90)`}>
        {completeWafers.map(renderWaferChip)}
      </g>
      {renderLaneTouchLayer("beginning", beginningWafers, 18)}
      {renderLaneTouchLayer("complete", completeWafers, node.width / 2 + 18)}
    </g>
  );
}

export function WaferDragPreview({ waferDrag }: { waferDrag: WaferDrag }) {
  return (
    <WaferChip
      className="flow-wafer-drag-preview"
      label={waferDrag.waferLabel}
      x={waferDrag.x + 12}
      y={waferDrag.y + 12}
      pointerEvents="none"
      opacity="0.86"
    />
  );
}

function WaferChip({
  label,
  x,
  y = 0,
  className = "",
  pointerEvents,
  opacity,
  isSelected = false,
  status,
  title,
  onPointerDown,
  onPointerUp,
  onDoubleClick
}: {
  label: string;
  x: number;
  y?: number;
  className?: string;
  pointerEvents?: "none";
  opacity?: string;
  isSelected?: boolean;
  status?: string | null;
  title?: string;
  onPointerDown?: (event: PointerEvent<SVGGElement>) => void;
  onPointerUp?: (event: PointerEvent<SVGGElement>) => void;
  onDoubleClick?: (event: MouseEvent<SVGGElement>) => void;
}) {
  const chipRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const el = chipRef.current;
    if (!el || pointerEvents === "none") return;
    const preventScroll = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("touchstart", preventScroll, { passive: false });
    return () => el.removeEventListener("touchstart", preventScroll);
  }, [pointerEvents]);

  const textScaleWidth = Math.max(24, WAFER_CHIP_WIDTH - 8);
  const fontSize =
    label.length <= 3 ? 12 :
    label.length <= 5 ? 9.5 :
    label.length <= 7 ? 7.5 :
    6.5;
  const shouldCondense = label.length > 5;

  return (
    <g
      ref={chipRef}
      className={`flow-wafer-chip ${status ? `flow-wafer-chip--${status.replaceAll("_", "-")}` : ""} ${isSelected ? "flow-wafer-chip--selected" : ""} ${className}`.trim()}
      pointerEvents={pointerEvents}
      transform={`translate(${x} ${y})`}
      opacity={opacity}
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDoubleClick?.(event);
      }}
    >
      {title ? <title>{title}</title> : null}
      <rect x="0" y="0" width={WAFER_CHIP_WIDTH} height={WAFER_CHIP_HEIGHT} rx="7" style={{ touchAction: "none" }} />
      <text
        x={WAFER_CHIP_WIDTH / 2}
        y={WAFER_CHIP_HEIGHT / 2}
        textLength={shouldCondense ? textScaleWidth : undefined}
        lengthAdjust="spacingAndGlyphs"
        style={{ touchAction: "none", fontSize: `${fontSize}px` }}
      >
        {label}
      </text>
    </g>
  );
}
