import { useEffect, useRef } from "react";
import type { ChangeEvent, KeyboardEvent, MouseEvent, PointerEvent, RefObject } from "react";
import {
  NODE_CHIP_COLUMNS,
  WAFER_CHIP_GAP_X,
  WAFER_CHIP_GAP_Y,
  WAFER_CHIP_HEIGHT,
  WAFER_CHIP_WIDTH
} from "./constants";
import {
  describeRole,
  getNodeIconPath,
  getVisibleNodeSubtitle,
  getWaferChipLabel,
  hasActiveWafer,
  truncateLabel
} from "./labels";
import type { FlowNode, WaferDrag, WaferPin } from "./types";

type FlowNodeCardProps = {
  node: FlowNode;
  isConnecting: boolean;
  isDragging: boolean;
  isSelected: boolean;
  selectedWaferAssignmentId: string | null;
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
};

export function FlowNodeCard({
  node,
  isConnecting,
  isDragging,
  isSelected,
  selectedWaferAssignmentId,
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
  onSelectWafer
}: FlowNodeCardProps) {
  const active = hasActiveWafer(node);
  const nodeCardRef = useRef<SVGGElement>(null);
  const visibleSubtitle = getVisibleNodeSubtitle(node.label, node.subLabel);

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

  return (
    <g
      ref={nodeCardRef}
      className={`flow-node flow-node--${node.role} ${active ? "flow-node--active" : ""} ${isConnecting ? "flow-node--connecting" : ""} ${
        isDragging ? "flow-node--dragging" : ""
      } ${isSelected ? "flow-node--selected" : ""}`}
      transform={`translate(${node.x} ${node.y})`}
      onPointerDown={(event) => onNodePointerDown(event, node)}
      onPointerMove={onNodePointerMove}
      onPointerUp={onNodePointerUp}
      onPointerCancel={onNodePointerCancel}
      onContextMenu={(event) => onNodeContextMenu(event, node.id)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onBeginLabelEdit(node.id);
      }}
    >
      <title>{visibleSubtitle ? `${node.label} · ${visibleSubtitle}` : node.label}</title>
      <rect x="0" y="0" width={node.width} height={node.height} rx="10" className="flow-node-card" style={{ touchAction: "none" }} />
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
          {truncateLabel(node.label, 20)}
        </text>
      )}
      {visibleSubtitle ? (
        <text x="64" y="56" className="flow-node-subtitle" style={{ touchAction: "none" }}>
          {truncateLabel(visibleSubtitle, 28)}
        </text>
      ) : null}
      {active ? (
        <g className="flow-node-active-pill" transform={`translate(${node.width - 78} 22)`}>
          <rect x="0" y="0" width="56" height="22" rx="11" style={{ touchAction: "none" }} />
          <text x="28" y="15" style={{ touchAction: "none" }}>Active</text>
        </g>
      ) : null}
      <text x="64" y="82" className="flow-node-meta" style={{ touchAction: "none" }}>
        {describeRole(node.role)}
      </text>
      <g transform="translate(64 96)">
        {node.wafers.map((wafer, index) => (
          <WaferChip
            key={wafer.assignmentId}
            label={getWaferChipLabel(wafer)}
            x={(index % NODE_CHIP_COLUMNS) * WAFER_CHIP_GAP_X}
            y={Math.floor(index / NODE_CHIP_COLUMNS) * WAFER_CHIP_GAP_Y}
            isSelected={selectedWaferAssignmentId === wafer.assignmentId}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelectWafer(node.id, wafer);
              onBeginWaferDrag(event, node, wafer);
            }}
          />
        ))}
      </g>
    </g>
  );
}

export function WaferDragPreview({ waferDrag }: { waferDrag: WaferDrag }) {
  return (
    <WaferChip
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
  onPointerDown
}: {
  label: string;
  x: number;
  y?: number;
  className?: string;
  pointerEvents?: "none";
  opacity?: string;
  isSelected?: boolean;
  onPointerDown?: (event: PointerEvent<SVGGElement>) => void;
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
      className={`flow-wafer-chip ${isSelected ? "flow-wafer-chip--selected" : ""} ${className}`.trim()}
      pointerEvents={pointerEvents}
      transform={`translate(${x} ${y})`}
      opacity={opacity}
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
    >
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
