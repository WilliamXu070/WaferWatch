"use client";

import { ChangeEvent, MouseEvent, PointerEvent, RefObject } from "react";
import { FlowNodeCard, WaferDragPreview } from "./FlowNodeCard";
import { isReturnEdge, makeDraftPath, makeNodePath } from "./edges";
import type {
  ConnectionDraft,
  FlowEdge,
  FlowNode,
  NodeDrag,
  RoleMenu,
  SelectionRect,
  SnapGuide,
  WaferDrag,
  WaferPin
} from "./types";

type ProcessFlowCanvasProps = {
  frameRef: RefObject<HTMLDivElement | null>;
  svgRef: RefObject<SVGSVGElement | null>;
  isPanning: boolean;
  scaledWidth: number;
  scaledHeight: number;
  sceneWidth: number;
  sceneHeight: number;
  snapGuides: SnapGuide[];
  nodes: FlowNode[];
  nodeById: Map<string, FlowNode>;
  connectionDraft: ConnectionDraft | null;
  waferDrag: WaferDrag | null;
  waferDropTarget: { nodeId: string; kind: "submit" | "move" } | null;
  archiveRestoreTargetNodeId: string | null;
  edges: FlowEdge[];
  selectedNodeIds: Set<string>;
  selectedEdgeId: string | null;
  selectedWaferAssignmentIds: ReadonlySet<string>;
  connectionNodeId: string | null;
  roleMenu: RoleMenu | null;
  roleMenuNode: FlowNode | null;
  nodeDrag: NodeDrag | null;
  selectionRect: SelectionRect | null;
  editingNodeId: string | null;
  editingNodeLabel: string;
  editingInputRef: RefObject<HTMLInputElement | null>;
  onFramePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onFramePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onFramePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onFramePointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onFramePointerLeave: (event: PointerEvent<HTMLDivElement>) => void;
  onFrameTouchPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => void;
  onFrameTouchPointerMoveCapture: (event: PointerEvent<HTMLDivElement>) => void;
  onFrameTouchPointerEndCapture: (event: PointerEvent<HTMLDivElement>) => void;
  onCanvasPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerUp: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerCancel: () => void;
  onCanvasPointerDown: (event: PointerEvent<SVGSVGElement>) => void;
  onCanvasDoubleClick: (event: MouseEvent<SVGSVGElement>) => void;
  onCanvasContextMenu: (event: MouseEvent<SVGSVGElement>) => void;
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
  onDeleteNodes: (nodeIds: string[]) => void;
  onEdgeClick: (edgeId: string) => void;
  reviewerOptions: Array<{ id: string; name: string }>;
  onUpdateReviewer?: (nodeId: string, reviewerId: string | null) => void;
};

export function ProcessFlowCanvas({
  frameRef,
  svgRef,
  isPanning,
  scaledWidth,
  scaledHeight,
  sceneWidth,
  sceneHeight,
  snapGuides,
  nodes,
  nodeById,
  connectionDraft,
  waferDrag,
  waferDropTarget,
  archiveRestoreTargetNodeId,
  edges,
  selectedNodeIds,
  selectedEdgeId,
  selectedWaferAssignmentIds,
  connectionNodeId,
  roleMenu,
  roleMenuNode,
  nodeDrag,
  selectionRect,
  editingNodeId,
  editingNodeLabel,
  editingInputRef,
  onFramePointerDown,
  onFramePointerMove,
  onFramePointerUp,
  onFramePointerCancel,
  onFramePointerLeave,
  onFrameTouchPointerDownCapture,
  onFrameTouchPointerMoveCapture,
  onFrameTouchPointerEndCapture,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onCanvasPointerCancel,
  onCanvasPointerDown,
  onCanvasDoubleClick,
  onCanvasContextMenu,
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
  onOpenStepParameters,
  onDeleteNodes,
  onEdgeClick,
  reviewerOptions,
  onUpdateReviewer
}: ProcessFlowCanvasProps) {
  const draftSourceNode = connectionDraft ? nodeById.get(connectionDraft.from) : null;
  const draftPath = draftSourceNode
    ? makeDraftPath(draftSourceNode, { x: connectionDraft?.x ?? 0, y: connectionDraft?.y ?? 0 })
    : null;

  return (
    <div
      ref={frameRef}
      className={`flow-map-frame ${isPanning ? "flow-map-frame--dragging" : ""}`}
      onPointerDown={onFramePointerDown}
      onPointerMove={onFramePointerMove}
      onPointerUp={onFramePointerUp}
      onPointerCancel={onFramePointerCancel}
      onPointerLeave={onFramePointerLeave}
      onPointerDownCapture={onFrameTouchPointerDownCapture}
      onPointerMoveCapture={onFrameTouchPointerMoveCapture}
      onPointerUpCapture={onFrameTouchPointerEndCapture}
      onPointerCancelCapture={onFrameTouchPointerEndCapture}
    >
      <svg
        ref={svgRef}
        className="flow-map-canvas flow-map-canvas--editable"
        width={scaledWidth}
        height={scaledHeight}
        viewBox={`0 0 ${sceneWidth} ${sceneHeight}`}
        style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerCancel={onCanvasPointerCancel}
        onPointerDown={onCanvasPointerDown}
        onDoubleClick={onCanvasDoubleClick}
        onContextMenu={onCanvasContextMenu}
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

        <rect className="flow-map-hit-area" x="0" y="0" width={sceneWidth} height={sceneHeight} />

        {selectionRect ? (
          <rect
            className="flow-selection-box"
            x={selectionRect.x}
            y={selectionRect.y}
            width={selectionRect.width}
            height={selectionRect.height}
          />
        ) : null}

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
          const isSelected = selectedEdgeId === edge.id;

          return (
            <g
              key={edge.id}
              className="flow-edge-group"
              onClick={(e) => { e.stopPropagation(); onEdgeClick(edge.id); }}
            >
              <path d={path} className="flow-edge-hit" />
              <path
                d={path}
                className={`flow-edge ${isReturn ? "flow-edge--return" : ""} ${isSelected ? "flow-edge--selected" : ""}`}
                markerEnd="url(#flowMapArrow)"
              />
            </g>
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
          <g className="flow-empty-state" transform={`translate(${sceneWidth / 2} ${sceneHeight / 2})`}>
            <circle cx="0" cy="-8" r="28" />
            <path d="M -10 -8 H 10 M 0 -18 V 2" />
            <text x="0" y="46">Blank process canvas</text>
          </g>
        ) : null}

        {nodes.map((node) => (
          <FlowNodeCard
            key={node.id}
            node={node}
            isConnecting={connectionNodeId === node.id}
            isDragging={nodeDrag?.nodeStartPositions.some((position) => position.nodeId === node.id) ?? false}
            dropTargetKind={archiveRestoreTargetNodeId === node.id
              ? "restore"
              : waferDropTarget?.nodeId === node.id ? waferDropTarget.kind : null}
            isSelected={selectedNodeIds.has(node.id)}
            selectedWaferAssignmentIds={selectedWaferAssignmentIds}
            isEditing={editingNodeId === node.id}
            editingNodeLabel={editingNodeLabel}
            editingInputRef={editingInputRef}
            onNodePointerDown={onNodePointerDown}
            onNodePointerMove={onNodePointerMove}
            onNodePointerUp={onNodePointerUp}
            onNodePointerCancel={onNodePointerCancel}
            onNodeContextMenu={onNodeContextMenu}
            onBeginLabelEdit={onBeginLabelEdit}
            onEditingLabelChange={onEditingLabelChange}
            onCommitLabel={onCommitLabel}
            onCancelLabelEdit={onCancelLabelEdit}
            onBeginWaferDrag={onBeginWaferDrag}
            onSelectWafer={onSelectWafer}
            onOpenWaferDetails={onOpenWaferDetails}
            onOpenStepParameters={onOpenStepParameters}
          />
        ))}

        {waferDrag ? <WaferDragPreview waferDrag={waferDrag} /> : null}
      </svg>

      {roleMenu && roleMenuNode ? (
        <div
          className="flow-role-menu"
          style={{ left: `${roleMenu.paneX}px`, top: `${roleMenu.paneY}px` }}
          role="menu"
          aria-label={`${roleMenuNode.label} actions`}
        >
          <label className="flow-role-menu-reviewer">
            <span>Checkpoint reviewer</span>
            <select
              value={roleMenuNode.requiredReviewerId ?? ""}
              onChange={(event) => onUpdateReviewer?.(roleMenuNode.id, event.currentTarget.value || null)}
            >
              <option value="">No reviewer</option>
              {reviewerOptions.map((reviewer) => (
                <option key={reviewer.id} value={reviewer.id}>{reviewer.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            role="menuitem"
            className="flow-role-menu-danger"
            onClick={() => onDeleteNodes(selectedNodeIds.has(roleMenu.nodeId) ? [...selectedNodeIds] : [roleMenu.nodeId])}
          >
            {selectedNodeIds.size > 1 && selectedNodeIds.has(roleMenu.nodeId)
              ? "Delete selected steps"
              : "Delete step"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
