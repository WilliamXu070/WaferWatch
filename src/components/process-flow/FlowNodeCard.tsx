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
};

export function FlowNodeCard({
  node,
  isConnecting,
  isDragging,
  isSelected,
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
  onBeginWaferDrag
}: FlowNodeCardProps) {
  const active = hasActiveWafer(node);

  return (
    <g
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
      <title>{`${node.label} · ${node.subLabel}`}</title>
      <rect x="0" y="0" width={node.width} height={node.height} rx="10" className="flow-node-card" />
      <path className="flow-node-icon" d={getNodeIconPath(node.role)} />
      <g className="flow-node-port-hit">
        <circle cx={node.width - 24} cy="24" r="14" className="flow-node-port-target" />
        <circle cx={node.width - 24} cy="24" r="8" className="flow-node-port" />
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
        {node.wafers.map((wafer, index) => (
          <WaferChip
            key={wafer.assignmentId}
            label={getWaferChipLabel(wafer)}
            x={(index % NODE_CHIP_COLUMNS) * WAFER_CHIP_GAP_X}
            y={Math.floor(index / NODE_CHIP_COLUMNS) * WAFER_CHIP_GAP_Y}
            onPointerDown={(event) => onBeginWaferDrag(event, node, wafer)}
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
  onPointerDown
}: {
  label: string;
  x: number;
  y?: number;
  className?: string;
  pointerEvents?: "none";
  opacity?: string;
  onPointerDown?: (event: PointerEvent<SVGGElement>) => void;
}) {
  return (
    <g
      className={`flow-wafer-chip ${className}`.trim()}
      pointerEvents={pointerEvents}
      transform={`translate(${x} ${y})`}
      opacity={opacity}
      onPointerDown={onPointerDown}
    >
      <rect x="0" y="0" width={WAFER_CHIP_WIDTH} height={WAFER_CHIP_HEIGHT} rx="7" />
      <text x={WAFER_CHIP_WIDTH / 2} y={WAFER_CHIP_HEIGHT / 2}>
        {truncateLabel(label, 4)}
      </text>
    </g>
  );
}
