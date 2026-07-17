"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ClipboardEvent, MouseEvent, PointerEvent } from "react";
import {
  getBoundedPinchAccumulatorScale,
  getPinchTargetScale,
  getStableZoomAnchor,
  getTouchCentroid,
  getTouchDistance,
  getWheelZoomTargetScale,
  getZoomScrollPosition,
  isTouchTapWithinThreshold,
  shouldStartNodePointerInteraction,
  supportsWebKitGestureEvents,
  type TouchPoint
} from "@/components/process-flow/gesture";
import { useRouter } from "next/navigation";
import { PendingNoteAttachments } from "@/components/notes/PendingNoteAttachments";
import { getClipboardImageFiles } from "@/features/measurements/clipboardImages";
import { mergeNoteAttachmentFiles } from "@/features/measurements/noteAttachmentDraft";
import { persistWaferStepNoteAttachments } from "@/features/measurements/noteAttachmentUpload";
import {
  getNextGreekWaferCode,
  getWaferCodeValidationError,
  normalizeWaferCode
} from "@/features/process-flows/waferNaming";
import type { ProcessStepNodeType, ProcessStepTransitionType } from "@/types/database";
import { readDeletedWaferIds } from "@/features/process-flows/waferDeletion";
import { ProcessFlowCanvas } from "./process-flow/ProcessFlowCanvas";
import { ProcessArchiveDock } from "./process-flow/ProcessArchiveDock";
import { ProcessFlowToolbar } from "./process-flow/ProcessFlowToolbar";
import {
  StepParameterEntryDialog,
  type PendingStepParameterEntry
} from "./process-flow/StepParameterEntryDialog";
import { WaferCreateDialog, type WaferCreateDraft } from "./process-flow/WaferCreateDialog";
import {
  areWafersArchivable,
  getBeginningLaneRestoreTarget,
  isClientPointInsideRect
} from "./process-flow/archiveInteractions";
import {
  BUTTON_ZOOM_STEP,
  EDGE_ID_PREFIX,
  FIT_VIEW_PADDING,
  MAX_SCALE,
  MIN_SCALE,
  NAME_DEBOUNCE_MS,
  NODE_HEIGHT,
  NODE_ID_PREFIX,
  NODE_WIDTH,
  PERSISTENCE_DEBOUNCE_MS,
  POSITION_DEBOUNCE_MS,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  TRANSITION_RETRY_DELAY_MS,
  TRANSITION_RETRY_LIMIT,
  getNodeHeightForWaferCount,
  getNodeHeightForWafers
} from "./process-flow/constants";
import { getGraphBounds, getSnappedNodePosition, nodeContainsPoint } from "./process-flow/geometry";
import { findEdgeSplitCandidate, splitEdgeWithNode } from "./process-flow/graphEdit";
import { createLatestFrameQueue, type LatestFrameQueue } from "./process-flow/latestFrameQueue";
import {
  getProcessMoveActionNote,
  hasCrossedWaferDragThreshold,
  shouldCommitWaferDrop
} from "./process-flow/interactions";
import {
  getAvailableWaferMoveTargets,
  getSelectedLinkedStepEdge
} from "./process-flow/mobileActions";
import {
  clampScale,
  getWaferChipLabel,
  isTextInputTarget
} from "./process-flow/labels";
import { applyGraphDisplayOrder, autoLayoutNodes } from "./process-flow/layout";
import { getInitialGraph } from "./process-flow/graphSeed";
import {
  canMoveToProcessStep,
  canReviewerRouteCheckpoint,
  canSubmitCheckpoint,
  getReviewerRouteDecision
} from "./process-flow/checkpointPhase";
import type {
  CheckpointReviewerOption,
  ArchiveCompletedProcessWafersAction,
  ConnectionDraft,
  CreateWaferAtProcessStartAction,
  CreateProcessFlowStepAction,
  CreateProcessStepTransitionAction,
  DeleteProcessFlowWaferAction,
  DeleteProcessStepsAction,
  DeleteProcessTransitionsAction,
  DiagramStep,
  DiagramTransition,
  FlowEdge,
  FlowNode,
  GraphViewportFit,
  MoveApprovedCheckpointAction,
  NodeDrag,
  PanePoint,
  PendingWaferMove,
  ProcessArchiveItem,
  PersistedStepPayload,
  RoleMenu,
  RouteCheckpointAction,
  RestoreArchivedProcessWaferAction,
  SaveStepParameterRecordAction,
  ScenePoint,
  SelectionBox,
  SelectionRect,
  SnapGuide,
  UpdateProcessStepExecutionModeAction,
  UpdateProcessStepNameAction,
  UpdateStepCheckpointReviewerAction,
  UpdateProcessStepNodeTypeAction,
  UpdateProcessStepPositionsAction,
  WaferDrag,
  WaferPin,
  SubmitStepCheckpointAction,
  ZoomAnchor
} from "./process-flow/types";

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

type GraphSnapshot = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  scale: number;
  scrollLeft: number;
  scrollTop: number;
};

type CreatedWaferPayload = {
  wafer?: {
    wafer_code?: string | null;
  } | null;
  assignment?: {
    id?: string | null;
  } | null;
};

type SelectedFlowWafer = {
  assignmentId: string;
  nodeId: string;
  label: string;
  isDie: boolean;
};

const MAX_UNDO_STACK = 30;

function getWaferSelectionLabel(wafers: readonly Pick<SelectedFlowWafer, "label" | "isDie">[]) {
  if (wafers.length === 1) {
    return wafers[0].label;
  }

  const noun = wafers.every((wafer) => wafer.isDie)
    ? "dies"
    : wafers.every((wafer) => !wafer.isDie)
      ? "wafers"
      : "items";
  return `${wafers.length} ${noun}`;
}

function moveWafersBetweenNodes(
  nodes: FlowNode[],
  sourceStepId: string,
  targetStepId: string,
  assignmentIds: ReadonlySet<string>,
  destinationStatus: "queued" | "redo_required" = "queued"
) {
  if (assignmentIds.size === 0) {
    return nodes;
  }

  const sourceNode = nodes.find((node) => node.id === sourceStepId);
  const movingWafers = sourceNode?.wafers.filter((wafer) => assignmentIds.has(wafer.assignmentId)) ?? [];
  if (movingWafers.length === 0) {
    return nodes;
  }

  if (sourceStepId === targetStepId) {
    return nodes.map((node) => node.id === sourceStepId
      ? {
          ...node,
          wafers: node.wafers.map((wafer) => assignmentIds.has(wafer.assignmentId)
            ? { ...wafer, currentStepStatus: destinationStatus }
            : wafer)
        }
      : node);
  }

  return nodes.map((node) => {
    if (node.id === sourceStepId) {
      const nextWafers = node.wafers.filter((wafer) => !assignmentIds.has(wafer.assignmentId));
      return {
        ...node,
        wafers: nextWafers,
        height: getNodeHeightForWafers(nextWafers)
      };
    }

    if (node.id === targetStepId) {
      const nextWafers = [
        ...node.wafers.filter((wafer) => !assignmentIds.has(wafer.assignmentId)),
        ...movingWafers.map((wafer) => ({
          ...wafer,
          currentStepStatus: destinationStatus
        }))
      ];
      return {
        ...node,
        wafers: nextWafers,
        height: getNodeHeightForWafers(nextWafers)
      };
    }

    return node;
  });
}

function getEdgeConnectionKey(edge: FlowEdge) {
  return `${edge.from}:${edge.to}:${edge.kind}`;
}

function normalizeFlowEdges(edges: FlowEdge[]) {
  const byId = new Map<string, FlowEdge>();
  for (const edge of edges) {
    byId.set(edge.id, edge);
  }

  const byConnection = new Map<string, FlowEdge>();
  for (const edge of byId.values()) {
    const key = getEdgeConnectionKey(edge);
    const existing = byConnection.get(key);

    if (!existing) {
      byConnection.set(key, edge);
      continue;
    }

    const existingIsLocal = existing.id.startsWith(EDGE_ID_PREFIX);
    const nextIsLocal = edge.id.startsWith(EDGE_ID_PREFIX);

    if (existingIsLocal && !nextIsLocal) {
      byConnection.set(key, edge);
      continue;
    }

    if (!existingIsLocal && nextIsLocal) {
      continue;
    }

    byConnection.set(key, edge);
  }

  return Array.from(byConnection.values());
}

function isAlreadyDeletedStepError(message: string) {
  return message.includes("selected process steps no longer exist");
}

function isAlreadyDeletedTransitionError(message: string) {
  return message.includes("selected transitions no longer exist");
}

function safelySetPointerCapture(element: Element, pointerId: number) {
  if (!("setPointerCapture" in element)) {
    return;
  }

  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Scripted events and interrupted gestures may not have an active pointer.
    // The drag state still tracks pointerId, so capture is only an enhancement.
  }
}

function safelyReleasePointerCapture(element: Element, pointerId: number) {
  if (!("releasePointerCapture" in element)) {
    return;
  }

  try {
    if (!("hasPointerCapture" in element) || element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Capture may already be released by cancellation, navigation, or tests.
  }
}

export function ProcessFlowDiagram({
  steps,
  transitions = [],
  processTemplateId,
  suggestedWaferCode,
  archiveItems = [],
  onCreateStep,
  onCreateWaferAtProcessStart,
  onUpdateStepPositions,
  onUpdateStepName,
  onUpdateStepExecutionMode,
  onCreateTransition,
  onDeleteSteps,
  onDeleteTransitions,
  onDeleteWafer,
  onArchiveWafers,
  onRestoreArchivedWafer,
  onSubmitCheckpoint,
  onRouteCheckpoint,
  onMoveApprovedWafer,
  onSaveStepParameters,
  onUpdateStepReviewer,
  reviewerOptions = [],
  currentUserId,
  currentUserName,
  canEdit = true
}: {
  steps: DiagramStep[];
  transitions?: DiagramTransition[];
  processTemplateId?: string;
  suggestedWaferCode?: string;
  archiveItems?: ProcessArchiveItem[];
  canEdit?: boolean;
  onCreateStep?: CreateProcessFlowStepAction;
  onCreateWaferAtProcessStart?: CreateWaferAtProcessStartAction;
  onUpdateStepPositions?: UpdateProcessStepPositionsAction;
  onUpdateStepName?: UpdateProcessStepNameAction;
  onUpdateStepExecutionMode?: UpdateProcessStepExecutionModeAction;
  onUpdateStepNodeType?: UpdateProcessStepNodeTypeAction;
  onCreateTransition?: CreateProcessStepTransitionAction;
  onDeleteSteps?: DeleteProcessStepsAction;
  onDeleteTransitions?: DeleteProcessTransitionsAction;
  onDeleteWafer?: DeleteProcessFlowWaferAction;
  onArchiveWafers?: ArchiveCompletedProcessWafersAction;
  onRestoreArchivedWafer?: RestoreArchivedProcessWaferAction;
  onSubmitCheckpoint?: SubmitStepCheckpointAction;
  onRouteCheckpoint?: RouteCheckpointAction;
  onMoveApprovedWafer?: MoveApprovedCheckpointAction;
  onSaveStepParameters?: SaveStepParameterRecordAction;
  onUpdateStepReviewer?: UpdateStepCheckpointReviewerAction;
  reviewerOptions?: CheckpointReviewerOption[];
  currentUserId?: string;
  currentUserName?: string;
}) {

  const router = useRouter();
  const [scale, setScale] = useState(1);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [pendingConnectionStart, setPendingConnectionStart] = useState<ConnectionDraft | null>(null);
  const [nodeDrag, setNodeDrag] = useState<NodeDrag | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [waferDrag, setWaferDrag] = useState<WaferDrag | null>(null);
  const [waferDropTarget, setWaferDropTarget] = useState<{ nodeId: string; kind: "submit" | "move" } | null>(null);
  const [optimisticArchiveItems, setOptimisticArchiveItems] = useState<ProcessArchiveItem[]>([]);
  const [hiddenArchiveWaferIds, setHiddenArchiveWaferIds] = useState<Set<string>>(new Set());
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isArchiveDropActive, setIsArchiveDropActive] = useState(false);
  const [isArchiveDropEligible, setIsArchiveDropEligible] = useState(false);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [archiveRestoreDrag, setArchiveRestoreDrag] = useState<{
    item: ProcessArchiveItem;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    clientX: number;
    clientY: number;
    hasMoved: boolean;
  } | null>(null);
  const [archiveRestoreTargetNodeId, setArchiveRestoreTargetNodeId] = useState<string | null>(null);
  const [archiveDockReceived, setArchiveDockReceived] = useState(false);
  const [pendingWaferMove, setPendingWaferMove] = useState<PendingWaferMove | null>(null);
  const [pendingWaferMoveNote, setPendingWaferMoveNote] = useState("");
  const [pendingWaferMoveFiles, setPendingWaferMoveFiles] = useState<File[]>([]);
  const [pendingWaferMoveFileError, setPendingWaferMoveFileError] = useState<string | null>(null);
  const [pendingStepParameterEntries, setPendingStepParameterEntries] = useState<PendingStepParameterEntry[]>([]);
  const [waferCreateDraft, setWaferCreateDraft] = useState<WaferCreateDraft | null>(null);
  const [waferCreateError, setWaferCreateError] = useState<string | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [roleMenu, setRoleMenu] = useState<RoleMenu | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedWafers, setSelectedWafers] = useState<SelectedFlowWafer[]>([]);
  const [undoStepsCount, setUndoStepsCount] = useState(0);
  const setMoveMessage = (msg: string | null) => { if (msg) console.warn("[ProcessFlow]", msg); };
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeLabel, setEditingNodeLabel] = useState("");
  const editingInputRef = useRef<HTMLInputElement | null>(null);
  const [isMovePending, startMoveTransition] = useTransition();
  const [isGraphPending, startGraphTransition] = useTransition();
  const [isWaferMutationPending, startWaferMutationTransition] = useTransition();
  const scaleRef = useRef(1);
  const pinchInitialAppScaleRef = useRef(1);
  const pinchInitialGestureScaleRef = useRef(1);
  const pointerPinchRef = useRef({ active: false, lastDistance: 1, rawScale: 1 });
  const activePinchSourceRef = useRef<"pointer" | "webkit" | null>(null);
  const touchPointersRef = useRef<Map<number, TouchPoint>>(new Map());
  const pinchAnchorRef = useRef<{ paneX: number; paneY: number } | null>(null);
  const pinchSceneAnchorRef = useRef<ZoomAnchor | null>(null);
  const lastZoomPanePointRef = useRef<PanePoint | null>(null);
  const pendingPinchScaleRef = useRef<number | null>(null);
  const pinchAnimationFrameRef = useRef<number | null>(null);
  const pendingTouchNodeRef = useRef<{
    nodeId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const pendingZoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const pendingGraphFitRef = useRef<GraphViewportFit | null>(null);
  const pendingStepCreateRef = useRef<Map<string, QueuedStepCreate>>(new Map());
  const pendingTransitionCreateRef = useRef<Map<string, QueuedTransition>>(new Map());
  const pendingPositionUpdateRef = useRef<Map<string, {
    canvasX: number;
    canvasY: number;
    expectedCanvasX: number;
    expectedCanvasY: number;
  }>>(new Map());
  const pendingNameUpdateRef = useRef<Map<string, { name: string; expectedName: string }>>(new Map());
  const pendingWaferDeleteIdsRef = useRef<Set<string>>(new Set());
  const archiveDockRef = useRef<HTMLButtonElement | null>(null);
  const waferDragRef = useRef<WaferDrag | null>(null);
  const waferDropTargetRef = useRef<{ nodeId: string; kind: "submit" | "move" } | null>(null);
  const waferDragRenderQueueRef = useRef<LatestFrameQueue<WaferDrag> | null>(null);
  if (waferDragRenderQueueRef.current === null) {
    waferDragRenderQueueRef.current = createLatestFrameQueue({
      cancel: (frameId) => window.cancelAnimationFrame(frameId),
      flush: (drag) => setWaferDrag(drag),
      schedule: (callback) => window.requestAnimationFrame(callback)
    });
  }
  const undoRecoveredNodeIdsRef = useRef<Set<string>>(new Set());
  const undoRecoveredEdgeIdsRef = useRef<Set<string>>(new Set());
  const undoStackRef = useRef<GraphSnapshot[]>([]);
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
  const serverGraph = useMemo(() => getInitialGraph(steps, transitions), [steps, transitions]);
  const graphSeedKey = processTemplateId ?? `unselected:${steps.map((step) => step.id).join("|")}`;
  const seededGraphKeyRef = useRef<string | null>(null);

  const displayNodes = useMemo(() => applyGraphDisplayOrder(nodes, edges), [edges, nodes]);

  const sceneBounds = useMemo(() => {
    const maxNodeX = displayNodes.length ? Math.max(...displayNodes.map((node) => node.x + node.width)) + 160 : SCENE_WIDTH;
    const maxNodeY = displayNodes.length ? Math.max(...displayNodes.map((node) => node.y + node.height)) + 160 : SCENE_HEIGHT;
    return {
      width: Math.max(SCENE_WIDTH, maxNodeX),
      height: Math.max(SCENE_HEIGHT, maxNodeY)
    };
  }, [displayNodes]);

  const s = clampScale(scale);
  const scaledWidth = Math.round(sceneBounds.width * s);
  const scaledHeight = Math.round(sceneBounds.height * s);
  const nodeById = useMemo(() => new Map(displayNodes.map((node) => [node.id, node])), [displayNodes]);
  const activeSelectedWafers = useMemo(
    () => selectedWafers.filter((selection) =>
      nodeById.get(selection.nodeId)?.wafers.some((wafer) => wafer.assignmentId === selection.assignmentId)
    ),
    [nodeById, selectedWafers]
  );
  const selectedWafer = activeSelectedWafers[activeSelectedWafers.length - 1] ?? null;
  const selectedWaferPin = selectedWafer
    ? nodeById.get(selectedWafer.nodeId)?.wafers.find((wafer) => wafer.assignmentId === selectedWafer.assignmentId) ?? null
    : null;
  const selectedWaferAssignmentIds = useMemo(
    () => new Set(activeSelectedWafers.map((wafer) => wafer.assignmentId)),
    [activeSelectedWafers]
  );
  const selectedArchivePins = useMemo(() => {
    if (!selectedWafer) return [];
    const selectedIds = new Set(
      activeSelectedWafers
        .filter((selection) => selection.nodeId === selectedWafer.nodeId)
        .map((selection) => selection.assignmentId)
    );
    return nodeById.get(selectedWafer.nodeId)?.wafers.filter((wafer) => selectedIds.has(wafer.assignmentId)) ?? [];
  }, [activeSelectedWafers, nodeById, selectedWafer]);
  const canArchiveSelected = areWafersArchivable(selectedArchivePins);
  const selectedLinkedStepEdge = useMemo(
    () => getSelectedLinkedStepEdge(edges, selectedNodeIds),
    [edges, selectedNodeIds]
  );
  const selectedWaferMoveTargets = useMemo(() => {
    if (!selectedWafer || !selectedWaferPin) return [];
    const source = nodeById.get(selectedWafer.nodeId);
    if (!source) return [];

    return getAvailableWaferMoveTargets(
      displayNodes,
      edges,
      selectedWafer.nodeId,
      selectedWaferPin.anytimeReturnStepId
    ).filter((target) => canMoveToProcessStep({
      sourceMode: source.executionMode,
      status: selectedWaferPin.currentStepStatus,
      targetMode: target.executionMode
    }));
  }, [displayNodes, edges, nodeById, selectedWafer, selectedWaferPin]);
  const resolveWaferDropTarget = useCallback((drag: WaferDrag) => {
    if (!drag.hasMoved) {
      return null;
    }

    const source = nodeById.get(drag.sourceStepId);
    const target = displayNodes.find((node) =>
      nodeContainsPoint(node, { x: drag.x, y: drag.y })
    );

    if (!source || !target) {
      return null;
    }

    const draggedWafers = source.wafers.filter((wafer) => drag.wafers.some((item) => item.assignmentId === wafer.assignmentId));
    const canSubmit = target.id === source.id && drag.x >= source.x + source.width / 2 &&
      Boolean(onSubmitCheckpoint) && draggedWafers.every((wafer) => canSubmitCheckpoint(wafer.currentStepStatus));
    const canMove = (target.id !== source.id || drag.x < source.x + source.width / 2) &&
      draggedWafers.every((wafer) =>
        (target.id !== source.id && Boolean(onMoveApprovedWafer) && canMoveToProcessStep({
          sourceMode: source.executionMode,
          status: wafer.currentStepStatus,
          targetMode: target.executionMode
        })) ||
        (Boolean(onRouteCheckpoint) && canReviewerRouteCheckpoint({
          attemptId: wafer.latestStepAttemptId,
          canReview: wafer.canReview,
          currentUserId,
          requiredReviewerId: wafer.requiredReviewerId,
          status: wafer.currentStepStatus
        }))
      );
    if (!canSubmit && !canMove) return null;

    return {
      nodeId: target.id,
      kind: canSubmit ? "submit" as const : "move" as const
    };
  }, [currentUserId, displayNodes, nodeById, onMoveApprovedWafer, onRouteCheckpoint, onSubmitCheckpoint]);
  const archiveItemsState = useMemo(() => {
    const byWaferId = new Map<string, ProcessArchiveItem>();
    for (const item of [...archiveItems, ...optimisticArchiveItems]) {
      if (!hiddenArchiveWaferIds.has(item.waferId)) {
        byWaferId.set(item.waferId, item);
      }
    }
    return Array.from(byWaferId.values()).sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
  }, [archiveItems, hiddenArchiveWaferIds, optimisticArchiveItems]);
  const nodesRef = useRef<FlowNode[]>([]);
  const edgesRef = useRef<FlowEdge[]>([]);

  useEffect(() => {
    nodesRef.current = displayNodes;
  }, [displayNodes]);

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

  const createGraphSnapshot = useCallback(() => ({
    nodes: nodesRef.current.map((node) => ({ ...node, wafers: [...node.wafers] })),
    edges: normalizeFlowEdges(edgesRef.current).map((edge) => ({ ...edge })),
    selectedNodeIds: [...selectedNodeIds],
    selectedEdgeId,
    scale: scaleRef.current,
    scrollLeft: frameRef.current?.scrollLeft ?? 0,
    scrollTop: frameRef.current?.scrollTop ?? 0
  }), [selectedEdgeId, selectedNodeIds]);

  const pushUndoSnapshot = useCallback(() => {
    const snapshot = createGraphSnapshot();
    undoStackRef.current = [...undoStackRef.current, snapshot].slice(-MAX_UNDO_STACK);
    setUndoStepsCount(undoStackRef.current.length);
  }, [createGraphSnapshot]);

  const popUndoSnapshot = useCallback(() => {
    const current = undoStackRef.current;
    if (current.length === 0) {
      return null;
    }

    const snapshot = current[current.length - 1];
    undoStackRef.current = current.slice(0, -1);
    setUndoStepsCount(undoStackRef.current.length);
    return snapshot;
  }, []);

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

  const scheduleBackgroundRefresh = useCallback(() => {
    window.setTimeout(() => {
      router.refresh();
    }, 250);
  }, [router]);

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
              executionMode: persistedStep.execution_mode,
              isOptimistic: false
            }
          : node
      )
    );

    setEdges((currentEdges) =>
      normalizeFlowEdges(
        currentEdges.map((edge) => ({
          ...edge,
          from: edge.from === temporaryStepId ? persistedStep.id : edge.from,
          to: edge.to === temporaryStepId ? persistedStep.id : edge.to
        }))
      )
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
      pendingNameUpdateRef.current.set(persistedStep.id, {
        name: finalLabel,
        expectedName: persistedStep.name
      });
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

    for (const [stepId, update] of entries) {
      const trimmed = update.name.trim();
      if (trimmed.length < 2) {
        continue;
      }

      const result = await onUpdateStepName({
        stepId,
        name: trimmed,
        expectedName: update.expectedName
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
        canvasY: position.canvasY,
        expectedCanvasX: position.expectedCanvasX,
        expectedCanvasY: position.expectedCanvasY
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
          setEdges((current) => normalizeFlowEdges(current.filter((edge) => edge.id !== localId)));
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
        setEdges((current) => normalizeFlowEdges(current.filter((edge) => edge.id !== localId)));
        continue;
      }

      const persisted = result.data;
      setEdges((currentEdges) =>
        normalizeFlowEdges(
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
        setEdges((currentEdges) => normalizeFlowEdges(currentEdges.filter((edge) => edge.from !== temporaryStepId && edge.to !== temporaryStepId)));
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

    const persistedNode = serverGraph.nodes.find((node) => node.id === stepId);
    pendingNameUpdateRef.current.set(stepId, {
      name: trimmed,
      expectedName: persistedNode?.label ?? getLatestNode(stepId)?.label ?? trimmed
    });
    schedulePending(pendingNameTimerRef, flushPendingNameUpdates, NAME_DEBOUNCE_MS);
  }, [flushPendingNameUpdates, getLatestNode, isOptimisticStep, schedulePending, serverGraph.nodes]);

  const queueNodePositionPersist = useCallback((stepId: string, canvasX: number, canvasY: number) => {
    const persistedNode = serverGraph.nodes.find((node) => node.id === stepId);
    pendingPositionUpdateRef.current.set(stepId, {
      canvasX,
      canvasY,
      expectedCanvasX: persistedNode?.x ?? canvasX,
      expectedCanvasY: persistedNode?.y ?? canvasY
    });
    if (isOptimisticStep(stepId)) {
      return;
    }

    schedulePending(pendingPositionTimerRef, flushPendingPositionUpdates, POSITION_DEBOUNCE_MS);
  }, [flushPendingPositionUpdates, isOptimisticStep, schedulePending, serverGraph.nodes]);

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
    if (!canEdit) {
      return;
    }

    const node = nodeById.get(nodeId);
    if (!node) {
      return;
    }

    setEditingNode(nodeId);
    setEditingNodeLabel(node.label);
  }, [canEdit, nodeById]);

  const commitNodeLabel = useCallback((nodeId: string, raw: string) => {
    if (!canEdit) {
      clearEditingNode();
      return;
    }

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
      pushUndoSnapshot();
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
  }, [canEdit, clearEditingNode, nodeById, pushUndoSnapshot, queueNodeNamePersist]);

  const commitActiveNodeLabel = useCallback(() => {
    if (!editingNodeId) {
      return;
    }

    commitNodeLabel(editingNodeId, editingInputRef.current?.value ?? editingNodeLabel);
  }, [commitNodeLabel, editingNodeId, editingNodeLabel]);

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
      waferDragRenderQueueRef.current?.clear();
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

  const restoreArchiveItem = useCallback((item: ProcessArchiveItem, targetStepId: string) => {
    if (!canEdit || !processTemplateId || !onRestoreArchivedWafer || isWaferMutationPending) {
      return;
    }

    const target = nodeById.get(targetStepId);
    if (!target) {
      setArchiveMessage("Choose a current process step.");
      return;
    }

    setArchiveMessage(`Restoring ${item.dieLabel ?? item.waferCode} to ${target.label}…`);
    startWaferMutationTransition(() => {
      void onRestoreArchivedWafer({
        templateId: processTemplateId,
        waferId: item.waferId,
        archivedAssignmentId: item.assignmentId,
        targetStepId,
        mutationId: crypto.randomUUID()
      }).then((result) => {
        if (!result.ok) {
          setArchiveMessage(result.error);
          return;
        }

        const restored = result.data && typeof result.data === "object" && !Array.isArray(result.data)
          ? result.data as Record<string, unknown>
          : {};
        const assignmentId = typeof restored.assignment_id === "string" ? restored.assignment_id : null;
        const stepExecutionId = typeof restored.step_execution_id === "string" ? restored.step_execution_id : null;
        setOptimisticArchiveItems((current) => current.filter((candidate) => candidate.waferId !== item.waferId));
        setHiddenArchiveWaferIds((current) => new Set(current).add(item.waferId));
        if (assignmentId) {
          setNodes((currentNodes) => currentNodes.map((node) => {
            if (node.id !== targetStepId) return node;
            const nextWafers = [
              ...node.wafers.filter((wafer) => wafer.waferId !== item.waferId),
              {
                assignmentId,
                waferId: item.waferId,
                currentStepExecutionId: stepExecutionId,
                waferCode: item.waferCode,
                dieLabel: item.dieLabel,
                currentStepStatus: "queued" as const,
                isArchivable: false
              }
            ];
            return { ...node, wafers: nextWafers, height: getNodeHeightForWafers(nextWafers) };
          }));
        }
        setArchiveMessage(`${item.dieLabel ?? item.waferCode} restored to ${target.label} · Beginning.`);
        router.refresh();
      }).catch((error: unknown) => {
        setArchiveMessage(error instanceof Error ? error.message : "The archive restore failed.");
      });
    });
  }, [canEdit, isWaferMutationPending, nodeById, onRestoreArchivedWafer, processTemplateId, router]);

  const beginArchiveRestoreDrag = useCallback((
    event: PointerEvent<HTMLButtonElement>,
    item: ProcessArchiveItem
  ) => {
    if (!canEdit || !onRestoreArchivedWafer || isWaferMutationPending || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setArchiveMessage(`Drag ${item.dieLabel ?? item.waferCode} to a Beginning lane.`);
    setArchiveRestoreDrag({
      item,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      hasMoved: false
    });
  }, [canEdit, isWaferMutationPending, onRestoreArchivedWafer]);

  useEffect(() => {
    if (!archiveRestoreDrag) return;

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== archiveRestoreDrag.pointerId) return;
      event.preventDefault();
      const hasMoved = archiveRestoreDrag.hasMoved || Math.hypot(
        event.clientX - archiveRestoreDrag.startClientX,
        event.clientY - archiveRestoreDrag.startClientY
      ) >= 8;
      const scenePoint = getScenePointFromClient(event.clientX, event.clientY);
      const target = hasMoved ? getBeginningLaneRestoreTarget(displayNodes, scenePoint) : null;
      setArchiveRestoreTargetNodeId(target?.id ?? null);
      setArchiveRestoreDrag((current) => current ? {
        ...current,
        clientX: event.clientX,
        clientY: event.clientY,
        hasMoved
      } : null);
    };

    const finishRestoreDrag = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== archiveRestoreDrag.pointerId) return;
      const scenePoint = getScenePointFromClient(event.clientX, event.clientY);
      const target = event.type === "pointerup" && archiveRestoreDrag.hasMoved
        ? getBeginningLaneRestoreTarget(displayNodes, scenePoint)
        : null;
      const item = archiveRestoreDrag.item;
      setArchiveRestoreDrag(null);
      setArchiveRestoreTargetNodeId(null);
      if (target) {
        restoreArchiveItem(item, target.id);
      } else if (event.type === "pointerup") {
        setArchiveMessage("Drop onto the left, Beginning half of a process step.");
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishRestoreDrag);
    window.addEventListener("pointercancel", finishRestoreDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishRestoreDrag);
      window.removeEventListener("pointercancel", finishRestoreDrag);
    };
  }, [archiveRestoreDrag, displayNodes, getScenePointFromClient, restoreArchiveItem]);

  const getSelectionRect = useCallback((box: SelectionBox | null = selectionBox): SelectionRect | null => {
    if (!box) {
      return null;
    }

    return {
      x: Math.min(box.startX, box.x),
      y: Math.min(box.startY, box.y),
      width: Math.abs(box.x - box.startX),
      height: Math.abs(box.y - box.startY)
    };
  }, [selectionBox]);

  const nodeIntersectsSelection = (node: FlowNode, rect: SelectionRect) => (
    node.x <= rect.x + rect.width &&
    node.x + node.width >= rect.x &&
    node.y <= rect.y + rect.height &&
    node.y + node.height >= rect.y
  );

  const applyScaleAtAnchor = useCallback((
    nextScale: number,
    anchor: PanePoint | null = getPanePoint(),
    stableSceneAnchor: ZoomAnchor | null = null
  ) => {
    const frame = frameRef.current;
    const currentScale = scaleRef.current;
    const boundedScale = clampScale(nextScale);

    if (!frame || !anchor || boundedScale === currentScale) {
      setScale(boundedScale);
      scaleRef.current = boundedScale;
      return;
    }

    pendingZoomAnchorRef.current = stableSceneAnchor
      ? { ...stableSceneAnchor, paneX: anchor.paneX, paneY: anchor.paneY }
      : getStableZoomAnchor(
          currentScale,
          frame.scrollLeft,
          frame.scrollTop,
          anchor,
          pendingZoomAnchorRef.current
        );

    scaleRef.current = boundedScale;
    setScale(boundedScale);
  }, [getPanePoint]);

  const zoomIn = () => applyScaleAtAnchor(
    scaleRef.current + BUTTON_ZOOM_STEP,
    lastZoomPanePointRef.current ?? getPanePoint()
  );
  const zoomOut = () => applyScaleAtAnchor(
    scaleRef.current - BUTTON_ZOOM_STEP,
    lastZoomPanePointRef.current ?? getPanePoint()
  );
  const applyGraphFit = useCallback((fit: GraphViewportFit) => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    frame.scrollLeft = Math.max(0, Math.round(fit.centerX * fit.scale - frame.clientWidth / 2));
    frame.scrollTop = Math.max(0, Math.round(fit.centerY * fit.scale - frame.clientHeight / 2));
  }, []);

  const getCanvasSceneCenter = useCallback(() => ({
    x: sceneBounds.width / 2,
    y: sceneBounds.height / 2
  }), [sceneBounds.width, sceneBounds.height]);

  const centerView = useCallback((targetNodes?: FlowNode[], centerPoint?: ScenePoint) => {
    const frame = frameRef.current;
    const bounds = getGraphBounds(targetNodes ?? nodesRef.current);
    if (!frame || !bounds) {
      return;
    }

    const availableWidth = Math.max(1, frame.clientWidth - FIT_VIEW_PADDING);
    const availableHeight = Math.max(1, frame.clientHeight - FIT_VIEW_PADDING);
    const nextScale = clampScale(Math.min(MAX_SCALE, availableWidth / bounds.width, availableHeight / bounds.height));
    const fit = {
      centerX: centerPoint?.x ?? bounds.centerX,
      centerY: centerPoint?.y ?? bounds.centerY,
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
  }, [applyGraphFit]);

  const organizeCanvas = () => {
    if (!canEdit) {
      return;
    }

    if (nodes.length < 2) {
      return;
    }

    if (!onUpdateStepPositions) {
      setMoveMessage("Graph position persistence is not available for this process view.");
      return;
    }

    pushUndoSnapshot();

    const targetCenter = getCanvasSceneCenter();
    const nextNodes = autoLayoutNodes(displayNodes, edges, targetCenter);
    setNodes(nextNodes);
    setSelectedNodeIds(new Set());
    setRoleMenu(null);
    setMoveMessage("Organized process flow.");
    centerView(nextNodes, targetCenter);
    nextNodes.forEach((node) => {
      queueNodePositionPersist(node.id, node.x, node.y);
    });
  };

  const openWaferCreateDialog = useCallback(() => {
    if (!canEdit || !processTemplateId || !onCreateWaferAtProcessStart || isWaferMutationPending) {
      return;
    }

    const startNode = displayNodes.find((node) => node.role === "start") ?? displayNodes[0];
    if (!startNode) {
      setMoveMessage("Create a start step before adding wafers.");
      return;
    }

    const existingWaferCodes = displayNodes.flatMap((node) => node.wafers.map((wafer) => wafer.waferCode));
    setWaferCreateError(null);
    setWaferCreateDraft({
      waferCode: suggestedWaferCode ?? getNextGreekWaferCode(existingWaferCodes),
      dieCount: 1
    });
  }, [
    canEdit,
    displayNodes,
    isWaferMutationPending,
    onCreateWaferAtProcessStart,
    processTemplateId,
    suggestedWaferCode
  ]);

  const submitWaferCreate = useCallback(() => {
    if (!waferCreateDraft || !canEdit || !processTemplateId || !onCreateWaferAtProcessStart || isWaferMutationPending) {
      return;
    }

    const startNode = displayNodes.find((node) => node.role === "start") ?? displayNodes[0];
    const waferCode = normalizeWaferCode(waferCreateDraft.waferCode);
    const validationError = getWaferCodeValidationError(waferCode);
    if (validationError) {
      setWaferCreateError(validationError);
      return;
    }
    if (!startNode) {
      setWaferCreateError("Create a start step before adding wafers.");
      return;
    }

    const draft = { ...waferCreateDraft, waferCode };
    setWaferCreateError(null);
    setWaferCreateDraft(null);

    const temporaryAssignmentId = `local-wafer-${Math.random().toString(36).slice(2, 10)}`;
    const optimisticWafer: WaferPin = {
      assignmentId: temporaryAssignmentId,
      waferCode,
      dieLabel: null,
      currentStepStatus: "queued"
    };

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === startNode.id
          ? {
              ...node,
              wafers: [...node.wafers, optimisticWafer],
              height: getNodeHeightForWaferCount(node.wafers.length + 1)
            }
          : node
      )
    );
    setMoveMessage("Adding wafer in background...");
    startWaferMutationTransition(() => {
      void (async () => {
        const result = await onCreateWaferAtProcessStart({
          templateId: processTemplateId,
          waferCode,
          dieCount: draft.dieCount
        });

        if (!result.ok) {
          setNodes((currentNodes) =>
            currentNodes.map((node) =>
              node.id === startNode.id
                ? {
                    ...node,
                    wafers: node.wafers.filter((wafer) => wafer.assignmentId !== temporaryAssignmentId),
                    height: getNodeHeightForWaferCount(
                      node.wafers.filter((wafer) => wafer.assignmentId !== temporaryAssignmentId).length
                    )
                  }
                : node
            )
          );
          setWaferCreateDraft(draft);
          setWaferCreateError(result.error);
          setMoveMessage(result.error);
          return;
        }

        const payload = result.data as CreatedWaferPayload;
        const assignmentId = payload.assignment?.id;
        const createdWaferCode = payload.wafer?.wafer_code;

        if (assignmentId && createdWaferCode) {
          setNodes((currentNodes) =>
            currentNodes.map((node) =>
              node.id === startNode.id
                ? {
                    ...node,
                    wafers: node.wafers.map((wafer) =>
                      wafer.assignmentId === temporaryAssignmentId
                        ? {
                            ...wafer,
                            assignmentId,
                            waferCode: createdWaferCode
                          }
                        : wafer
                    )
                  }
                : node
            )
          );
        }

        setMoveMessage(`Added ${waferCode}.`);
        scheduleBackgroundRefresh();
      })();
    });
  }, [
    canEdit,
    displayNodes,
    isWaferMutationPending,
    onCreateWaferAtProcessStart,
    processTemplateId,
    scheduleBackgroundRefresh,
    waferCreateDraft
  ]);

  const selectWafer = useCallback((nodeId: string, wafer: WaferPin) => {
    if (waferDragRef.current?.hasMoved) {
      return;
    }

    setSelectedNodeIds(new Set());
    setSelectedEdgeId(null);
    setRoleMenu(null);
    const nextSelection: SelectedFlowWafer = {
      assignmentId: wafer.assignmentId,
      nodeId,
      label: getWaferChipLabel(wafer),
      isDie: Boolean(wafer.dieLabel)
    };
    setSelectedWafers((current) => {
      if (current.some((selection) => selection.assignmentId === wafer.assignmentId)) {
        return current.filter((selection) => selection.assignmentId !== wafer.assignmentId);
      }

      if (current.some((selection) => selection.nodeId !== nodeId)) {
        return [nextSelection];
      }

      return [...current, nextSelection];
    });
  }, []);

  const openWaferDetails = useCallback((wafer: WaferPin) => {
    if (!processTemplateId || !wafer.waferId) {
      return;
    }

    const search = new URLSearchParams({
      processId: processTemplateId,
      waferId: wafer.waferId
    });
    if (wafer.dieLabel?.trim()) {
      search.set("dieLabel", wafer.dieLabel.trim());
    }
    router.push(`/wafer-status?${search.toString()}`);
  }, [processTemplateId, router]);

  const openStepParameters = useCallback((stepId: string) => {
    const search = processTemplateId
      ? `?${new URLSearchParams({ processId: processTemplateId }).toString()}`
      : "";
    router.push(`/process-flow/steps/${stepId}/parameters${search}`);
  }, [processTemplateId, router]);

  const deleteSelectedWafer = useCallback(() => {
    if (!canEdit || !selectedWafer) {
      return;
    }

    if (!onDeleteWafer) {
      setMoveMessage("Wafer deletion is not available for this process view.");
      return;
    }

    const wafer = selectedWafer;
    if (pendingWaferDeleteIdsRef.current.has(wafer.assignmentId)) {
      return;
    }

    const sourceNode = nodesRef.current.find((node) => node.id === wafer.nodeId);
    const deletedPin = sourceNode?.wafers.find((pin) => pin.assignmentId === wafer.assignmentId);
    if (!deletedPin) {
      setSelectedWafers((current) => current.filter((selection) => selection.assignmentId !== wafer.assignmentId));
      return;
    }
    pendingWaferDeleteIdsRef.current.add(wafer.assignmentId);
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === wafer.nodeId
          ? {
              ...node,
              wafers: node.wafers.filter((pin) => pin.assignmentId !== wafer.assignmentId),
              height: getNodeHeightForWaferCount(node.wafers.filter((pin) => pin.assignmentId !== wafer.assignmentId).length)
            }
          : node
      )
    );
    setSelectedWafers((current) => current.filter((selection) => selection.assignmentId !== wafer.assignmentId));
    setMoveMessage(`Deleting ${wafer.label}...`);

    void (async () => {
      const result = await onDeleteWafer({ assignmentId: wafer.assignmentId });
      pendingWaferDeleteIdsRef.current.delete(wafer.assignmentId);

      if (!result.ok) {
        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            if (node.id !== wafer.nodeId || node.wafers.some((pin) => pin.assignmentId === wafer.assignmentId)) {
              return node;
            }

            const restoredWafers = [...node.wafers, deletedPin];
            return {
              ...node,
              wafers: restoredWafers,
              height: getNodeHeightForWaferCount(restoredWafers.length)
            };
          })
        );
        setSelectedWafers((current) =>
          current.some((selection) => selection.assignmentId === wafer.assignmentId)
            ? current
            : [...current, wafer]
        );
        setMoveMessage(result.error);
        return;
      }

      const deletedWaferIds = new Set(readDeletedWaferIds(result.data));
      if (deletedWaferIds.size > 0) {
        const deletedAssignmentIds = new Set(
          nodesRef.current.flatMap((node) =>
            node.wafers
              .filter((pin) => Boolean(pin.waferId && deletedWaferIds.has(pin.waferId)))
              .map((pin) => pin.assignmentId)
          )
        );
        setNodes((currentNodes) => currentNodes.map((node) => {
          const remainingWafers = node.wafers.filter((pin) => !pin.waferId || !deletedWaferIds.has(pin.waferId));
          return remainingWafers.length === node.wafers.length
            ? node
            : {
                ...node,
                wafers: remainingWafers,
                height: getNodeHeightForWaferCount(remainingWafers.length)
              };
        }));
        setSelectedWafers((current) =>
          current.filter((selection) => !deletedAssignmentIds.has(selection.assignmentId))
        );
      }

      setMoveMessage(`Deleted ${wafer.label}.`);
      scheduleBackgroundRefresh();
    })();
  }, [canEdit, onDeleteWafer, scheduleBackgroundRefresh, selectedWafer]);

  const restoreFromSnapshot = useCallback((snapshot: GraphSnapshot) => {
    clearTimers();
    clearQueuedStepMaps();
    pendingPositionUpdateRef.current.clear();
    pendingTransitionCreateRef.current.clear();

    const currentNodeIds = new Set(nodesRef.current.map((node) => node.id));
    const currentEdgeIds = new Set(edgesRef.current.map((edge) => edge.id));
    for (const node of snapshot.nodes) {
      if (!currentNodeIds.has(node.id)) {
        undoRecoveredNodeIdsRef.current.add(node.id);
      }
    }

    for (const edge of snapshot.edges) {
      if (!currentEdgeIds.has(edge.id)) {
        undoRecoveredEdgeIdsRef.current.add(edge.id);
      }
    }

    setNodes(snapshot.nodes.map((node) => ({ ...node, wafers: [...node.wafers] })));
    setEdges(normalizeFlowEdges(snapshot.edges).map((edge) => ({ ...edge })));
    setSelectedNodeIds(new Set(snapshot.selectedNodeIds));
    setSelectedEdgeId(snapshot.selectedEdgeId);
    setConnectionDraft(null);
    setPendingConnectionStart(null);
    setNodeDrag(null);
    setSelectionBox(null);
    setWaferDrag(null);
    setSnapGuides([]);
    setRoleMenu(null);
    setEditingNodeId(null);
    setEditingNodeLabel("");
    setMoveMessage("Undid last edit.");
    scaleRef.current = snapshot.scale;
    setScale(snapshot.scale);

    window.requestAnimationFrame(() => {
      const frame = frameRef.current;
      if (!frame) {
        return;
      }

      frame.scrollLeft = snapshot.scrollLeft;
      frame.scrollTop = snapshot.scrollTop;
    });
  }, [clearQueuedStepMaps, clearTimers]);

  const undoLastEdit = useCallback(() => {
    const snapshot = popUndoSnapshot();
    if (!snapshot) {
      return;
    }

    restoreFromSnapshot(snapshot);
  }, [popUndoSnapshot, restoreFromSnapshot]);

  const mergeServerGraphIntoLocal = useCallback((graph: { nodes: FlowNode[]; edges: FlowEdge[] }) => {
    const serverNodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const serverEdgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));

    setNodes((currentNodes) => {
      const nextNodes: FlowNode[] = [];
      const seenNodeIds = new Set<string>();

      for (const node of currentNodes) {
        const serverNode = serverNodeById.get(node.id);

        if (!serverNode) {
          if (node.isOptimistic || pendingStepCreateRef.current.has(node.id) || undoRecoveredNodeIdsRef.current.has(node.id)) {
            nextNodes.push(node);
          }
          continue;
        }

        seenNodeIds.add(node.id);
        undoRecoveredNodeIdsRef.current.delete(node.id);
        const hasPendingName = pendingNameUpdateRef.current.has(node.id) || editingNodeId === node.id;
        const hasPendingPosition = pendingPositionUpdateRef.current.has(node.id);
        nextNodes.push({
          ...serverNode,
          label: hasPendingName ? node.label : serverNode.label,
          x: hasPendingPosition ? node.x : serverNode.x,
          y: hasPendingPosition ? node.y : serverNode.y,
          height: getNodeHeightForWaferCount(serverNode.wafers.length),
          isOptimistic: false
        });
      }

      for (const serverNode of graph.nodes) {
        if (!seenNodeIds.has(serverNode.id)) {
          nextNodes.push(serverNode);
        }
      }

      return nextNodes;
    });

    setEdges((currentEdges) => {
      const nextEdges: FlowEdge[] = [];
      const seenServerEdgeIds = new Set<string>();
      const hasEndpointMatch = (candidate: FlowEdge) => (
        nextEdges.some((edge) =>
          edge.from === candidate.from &&
          edge.to === candidate.to &&
          edge.kind === candidate.kind
        )
      );

      for (const edge of currentEdges) {
        if (edge.id.startsWith(EDGE_ID_PREFIX) || pendingTransitionCreateRef.current.has(edge.id)) {
          nextEdges.push(edge);
          continue;
        }

        const serverEdge = serverEdgeById.get(edge.id);
        if (!serverEdge) {
          if (undoRecoveredEdgeIdsRef.current.has(edge.id)) {
            nextEdges.push(edge);
          }
          continue;
        }

        seenServerEdgeIds.add(edge.id);
        undoRecoveredEdgeIdsRef.current.delete(edge.id);
        nextEdges.push(serverEdge);
      }

      for (const serverEdge of graph.edges) {
        if (!seenServerEdgeIds.has(serverEdge.id) && !hasEndpointMatch(serverEdge)) {
          nextEdges.push(serverEdge);
        }
      }

      return normalizeFlowEdges(nextEdges);
    });
  }, [editingNodeId]);

  useEffect(() => {
    if (seededGraphKeyRef.current === graphSeedKey) {
      mergeServerGraphIntoLocal(serverGraph);
      return;
    }

    undoStackRef.current = [];
    undoRecoveredNodeIdsRef.current.clear();
    undoRecoveredEdgeIdsRef.current.clear();
    setUndoStepsCount(0);
    setNodes(serverGraph.nodes);
    setEdges(normalizeFlowEdges(serverGraph.edges));
    setConnectionDraft(null);
    setPendingConnectionStart(null);
    setNodeDrag(null);
    setSelectionBox(null);
    setWaferDrag(null);
    setSnapGuides([]);
    setRoleMenu(null);
    setSelectedNodeIds(new Set());
    setSelectedWafers([]);
    setMoveMessage(null);
    setEditingNode(null);
    clearQueuedStepMaps();
    clearTimers();
    seededGraphKeyRef.current = graphSeedKey;
    centerView(serverGraph.nodes);
  }, [centerView, clearQueuedStepMaps, clearTimers, graphSeedKey, mergeServerGraphIntoLocal, serverGraph]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const anchor = pendingZoomAnchorRef.current;

    if (!frame || !anchor) {
      return;
    }

    const scrollPosition = getZoomScrollPosition(anchor, scale);
    frame.scrollLeft = scrollPosition.scrollLeft;
    frame.scrollTop = scrollPosition.scrollTop;
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
    setSelectedWafers([]);

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
    safelySetPointerCapture(frame, event.pointerId);
  };

  const queuePinchScale = useCallback((nextScale: number) => {
    pendingPinchScaleRef.current = nextScale;
    if (pinchAnimationFrameRef.current !== null) {
      return;
    }

    pinchAnimationFrameRef.current = window.requestAnimationFrame(() => {
      pinchAnimationFrameRef.current = null;
      const queuedScale = pendingPinchScaleRef.current;
      pendingPinchScaleRef.current = null;
      if (queuedScale !== null) {
        applyScaleAtAnchor(queuedScale, pinchAnchorRef.current, pinchSceneAnchorRef.current);
      }
      if (activePinchSourceRef.current === null) {
        pinchSceneAnchorRef.current = null;
      }
    });
  }, [applyScaleAtAnchor]);

  const beginTouchPinch = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") {
      return;
    }

    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    touchPointersRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY
    });

    const pointers = Array.from(touchPointersRef.current.entries()).slice(0, 2);
    if (pointers.length < 2) {
      return;
    }

    const distance = getTouchDistance(pointers[0][1], pointers[1][1]);
    if (distance <= 0) {
      return;
    }

    pendingTouchNodeRef.current = null;
    if (supportsWebKitGestureEvents(window)) {
      pointerPinchRef.current = { active: false, lastDistance: 1, rawScale: scaleRef.current };
      return;
    }

    pointerPinchRef.current = {
      active: true,
      lastDistance: distance,
      rawScale: scaleRef.current
    };
    activePinchSourceRef.current = "pointer";
    const centroid = getTouchCentroid(pointers.map(([, point]) => point));
    const panePoint = centroid ? getPanePoint(centroid.clientX, centroid.clientY) : getPanePoint();
    pinchAnchorRef.current = panePoint;
    lastZoomPanePointRef.current = panePoint;
    pinchSceneAnchorRef.current = panePoint
      ? getStableZoomAnchor(
          scaleRef.current,
          frame.scrollLeft,
          frame.scrollTop,
          panePoint,
          pendingZoomAnchorRef.current
        )
      : null;
    safelySetPointerCapture(frame, pointers[0][0]);
    safelySetPointerCapture(frame, pointers[1][0]);
    event.preventDefault();
    event.stopPropagation();
  };

  const updateTouchPinch = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !touchPointersRef.current.has(event.pointerId)) {
      return;
    }

    touchPointersRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY
    });

    if (supportsWebKitGestureEvents(window)) {
      return;
    }

    const pinch = pointerPinchRef.current;
    const pointers = Array.from(touchPointersRef.current.values()).slice(0, 2);
    if (!pinch.active || pointers.length < 2) {
      return;
    }

    const distance = getTouchDistance(pointers[0], pointers[1]);
    if (distance <= 0) {
      return;
    }

    const nextRawScale = getBoundedPinchAccumulatorScale(
      pinch.rawScale,
      pinch.lastDistance,
      distance,
      MIN_SCALE,
      MAX_SCALE
    );
    pointerPinchRef.current = {
      active: true,
      lastDistance: distance,
      rawScale: nextRawScale
    };
    const centroid = getTouchCentroid(pointers);
    if (centroid) {
      pinchAnchorRef.current = getPanePoint(centroid.clientX, centroid.clientY);
      lastZoomPanePointRef.current = pinchAnchorRef.current;
    }
    queuePinchScale(clampScale(nextRawScale));
    event.preventDefault();
    event.stopPropagation();
  };

  const endTouchPinch = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !touchPointersRef.current.has(event.pointerId)) {
      return;
    }

    const frame = frameRef.current;
    touchPointersRef.current.delete(event.pointerId);
    if (frame) {
      safelyReleasePointerCapture(frame, event.pointerId);
    }

    if (touchPointersRef.current.size < 2) {
      pointerPinchRef.current = { active: false, lastDistance: 1, rawScale: scaleRef.current };
      if (activePinchSourceRef.current === "pointer") {
        activePinchSourceRef.current = null;
      }
      if (pinchAnimationFrameRef.current === null) {
        pinchSceneAnchorRef.current = null;
      }
    }
  };

  const updatePan = (event: PointerEvent<HTMLDivElement>) => {
    lastZoomPanePointRef.current = getPanePoint(event.clientX, event.clientY);
    if (waferDragRef.current) {
      updateWaferDrag(event as unknown as PointerEvent<Element>);
      return;
    }

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
    if (waferDragRef.current) {
      finishWaferDrag(event as unknown as PointerEvent<Element>);
      return;
    }

    if (!isPanning) {
      return;
    }

    const frame = frameRef.current;
    if (frame) {
      safelyReleasePointerCapture(frame, event.pointerId);
    }

    setIsPanning(false);
    panStateRef.current = null;
  };

  const beginCanvasSelection = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as EventTarget | null;
    const hasNodeTarget = target instanceof Element && target.closest(".flow-node") !== null;
    const hasEdgeTarget = target instanceof Element && target.closest(".flow-edge-group") !== null;
    if (hasNodeTarget || hasEdgeTarget) {
      return;
    }

    commitActiveNodeLabel();
    setRoleMenu(null);
    setSelectedEdgeId(null);
    setSelectedWafers([]);

    if (event.pointerType === "touch") {
      setSelectedNodeIds(new Set());
      return;
    }

    event.preventDefault();
    const point = getScenePoint(event);
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;

    if (!additive) {
      setSelectedNodeIds(new Set());
    }

    setSelectionBox({
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      additive,
      hasMoved: false,
      baseSelectedNodeIds: additive ? [...selectedNodeIds] : []
    });
    safelySetPointerCapture(event.currentTarget, event.pointerId);
  };

  const updateCanvasSelection = (event: PointerEvent<SVGSVGElement>) => {
    if (!selectionBox || selectionBox.pointerId !== event.pointerId) {
      return false;
    }

    const point = getScenePoint(event);
    const nextBox = {
      ...selectionBox,
      x: point.x,
      y: point.y,
      hasMoved:
        selectionBox.hasMoved ||
        Math.abs(point.x - selectionBox.startX) > 6 ||
        Math.abs(point.y - selectionBox.startY) > 6
    };
    const rect = getSelectionRect(nextBox);

    if (rect) {
      const nextSelected = new Set(nextBox.additive ? nextBox.baseSelectedNodeIds : []);
      nodes.forEach((node) => {
        if (nodeIntersectsSelection(node, rect)) {
          nextSelected.add(node.id);
        }
      });
      setSelectedNodeIds(nextSelected);
    }

    setSelectionBox(nextBox);
    return true;
  };

  const finishCanvasSelection = (event: PointerEvent<SVGSVGElement>) => {
    if (!selectionBox || selectionBox.pointerId !== event.pointerId) {
      return false;
    }

    if (!selectionBox.hasMoved && !selectionBox.additive) {
      setSelectedNodeIds(new Set());
    }

    safelyReleasePointerCapture(event.currentTarget, event.pointerId);
    setSelectionBox(null);
    return true;
  };

  const createNodeAtPoint = (point: ScenePoint, edgeToSplit: FlowEdge | null) => {
    if (!canEdit) {
      return;
    }

    if (!processTemplateId || !onCreateStep) {
      setMoveMessage("Load an authenticated process template before editing the graph.");
      return;
    }

    pushUndoSnapshot();

    const canvasX = Math.max(24, Math.round(point.x - NODE_WIDTH / 2));
    const canvasY = Math.max(24, Math.round(point.y - NODE_HEIGHT / 2));
    const temporaryStepId = `${NODE_ID_PREFIX}${Math.random().toString(36).slice(2, 10)}`;
    const splitEdges = edgeToSplit ? splitEdgeWithNode(edgeToSplit, temporaryStepId) : [];
    const fallbackNode: FlowNode = {
      id: temporaryStepId,
      label: "Untitled",
      subLabel: "Process step",
      wafers: [],
      x: canvasX,
      y: canvasY,
      width: NODE_WIDTH,
      height: getNodeHeightForWaferCount(0),
      role: "normal",
      executionMode: "main",
      order: displayNodes.length + 1,
      parametersSchema: {},
      isOptimistic: true
    };

    setRoleMenu(null);
    setSelectedWafers([]);
    setNodes((currentNodes) => [...currentNodes, fallbackNode]);
    if (edgeToSplit) {
      pendingTransitionCreateRef.current.delete(edgeToSplit.id);
      setEdges((currentEdges) =>
        normalizeFlowEdges([
          ...currentEdges.filter((edge) => edge.id !== edgeToSplit.id),
          ...splitEdges
        ])
      );
      setSelectedEdgeId(null);
      splitEdges.forEach((edge, index) => {
        queueTransitionPersist(edge.id, {
          id: edge.id,
          fromStepId: edge.from,
          toStepId: edge.to,
          edgeType: edge.kind,
          priority: edges.length * 10 + index
        });
      });

      if (!edgeToSplit.id.startsWith(EDGE_ID_PREFIX) && onDeleteTransitions) {
        startGraphTransition(() => {
          void (async () => {
            const result = await onDeleteTransitions({ transitionIds: [edgeToSplit.id] });
            if (!result.ok && !isAlreadyDeletedTransitionError(result.error)) {
              setMoveMessage(result.error);
            }
          })();
        });
      }
    }
    setSelectedNodeIds(new Set([temporaryStepId]));
    setMoveMessage(edgeToSplit ? "Inserted step into transition locally." : "Added step locally.");
    queueStepPersist(temporaryStepId, {
      canvasX,
      canvasY,
      fallbackNode,
      stepArea: "Process step",
      nodeType: "procedure"
    });
  };

  const createNode = (event: MouseEvent<SVGSVGElement>) => {
    if (event.detail !== 2 || event.button !== 0) {
      return;
    }

    if (event.target instanceof Element && event.target.closest(".flow-wafer-chip, .flow-node")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = getScenePoint(event);
    const splitCandidate = findEdgeSplitCandidate(point, edges, displayNodes);
    const edgeToSplit =
      splitCandidate && (splitCandidate.edge.id.startsWith(EDGE_ID_PREFIX) || (onDeleteTransitions && onCreateTransition))
        ? splitCandidate.edge
        : null;
    createNodeAtPoint(point, edgeToSplit);
  };

  const createLinkedStep = () => {
    if (!selectedLinkedStepEdge) {
      setMoveMessage("Select one step with an outgoing process path first.");
      return;
    }

    const source = nodeById.get(selectedLinkedStepEdge.from);
    const target = nodeById.get(selectedLinkedStepEdge.to);
    if (!source || !target) {
      setMoveMessage("The selected process path is no longer available.");
      return;
    }

    createNodeAtPoint({
      x: (source.x + source.width / 2 + target.x + target.width / 2) / 2,
      y: (source.y + source.height / 2 + target.y + target.height / 2) / 2
    }, selectedLinkedStepEdge);
  };

  const beginPendingConnection = (event: PointerEvent<SVGGElement>, nodeId: string) => {
    if (nodeById.get(nodeId)?.executionMode === "anytime") {
      setMoveMessage("Anytime steps stay disconnected from the main process path.");
      return;
    }

    event.stopPropagation();
    setRoleMenu(null);
    setSelectedWafers([]);

    const point = getScenePoint(event);
    setPendingConnectionStart({
      from: nodeId,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      hasMoved: false
    });
    safelySetPointerCapture(event.currentTarget, event.pointerId);
  };

  const handleNodePointerDown = (event: PointerEvent<SVGGElement>, node: FlowNode) => {
    if (!canEdit) {
      return;
    }

    event.stopPropagation();
    if (!shouldStartNodePointerInteraction(event.pointerType)) {
      pendingTouchNodeRef.current = {
        nodeId: node.id,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY
      };
      return;
    }

    if (editingNodeId && editingNodeId !== node.id) {
      commitActiveNodeLabel();
    }

    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      event.preventDefault();
      setRoleMenu(null);
      setSelectedWafers([]);
      setSelectedNodeIds((current) => {
        const next = new Set(current);
        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }
        return next;
      });

      if (event.shiftKey && !event.metaKey && !event.ctrlKey) {
        beginPendingConnection(event, node.id);
      }
      return;
    }

    setSelectedNodeIds(new Set([node.id]));
    setSelectedWafers([]);
    beginNodeDrag(event, node);
  };

  const beginNodeDrag = (event: PointerEvent<SVGGElement>, node: FlowNode) => {
    if (event.pointerType === "touch" && pointerPinchRef.current.active) {
      return;
    }
    if (!canEdit || event.button !== 0 || connectionDraft) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setRoleMenu(null);
    setSelectedWafers([]);
    const selectedIds = selectedNodeIds.has(node.id) ? selectedNodeIds : new Set([node.id]);
    setSelectedNodeIds(selectedIds);

    const point = getScenePoint(event);
    const nodeStartPositions = nodes
      .filter((currentNode) => selectedIds.has(currentNode.id))
      .map((currentNode) => ({
        nodeId: currentNode.id,
        x: currentNode.x,
        y: currentNode.y
      }));

    setNodeDrag({
      nodeId: node.id,
      pointerId: event.pointerId,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
      startX: node.x,
      startY: node.y,
      nodeStartPositions
    });
    safelySetPointerCapture(event.currentTarget, event.pointerId);
    setDragTouchAction();
  };

  const updateNodeDrag = (event: PointerEvent<SVGGElement>) => {
    if (waferDragRef.current) {
      updateWaferDrag(event as unknown as PointerEvent<SVGSVGElement>);
      return;
    }

    const pendingTouchNode = pendingTouchNodeRef.current;
    if (event.pointerType === "touch" && pendingTouchNode?.pointerId === event.pointerId) {
      if (!isTouchTapWithinThreshold(
        pendingTouchNode.startClientX,
        pendingTouchNode.startClientY,
        event.clientX,
        event.clientY
      )) {
        pendingTouchNodeRef.current = null;
      }
      return;
    }

    if (pendingConnectionStart && pendingConnectionStart.pointerId === event.pointerId) {
      const point = getScenePoint(event);
      const hasMoved =
        Math.abs(point.x - pendingConnectionStart.startX) > 6 ||
        Math.abs(point.y - pendingConnectionStart.startY) > 6;

      if (hasMoved) {
        setConnectionDraft({
          ...pendingConnectionStart,
          x: point.x,
          y: point.y,
          hasMoved: true
        });
        setPendingConnectionStart(null);
        setSelectedNodeIds(new Set([pendingConnectionStart.from]));
      }
      return;
    }

    if (connectionDraft && connectionDraft.pointerId === event.pointerId) {
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
      return;
    }

    if (!nodeDrag || nodeDrag.pointerId !== event.pointerId) {
      return;
    }

    const point = getScenePoint(event);
    const draggedNode = nodes.find((node) => node.id === nodeDrag.nodeId);
    if (!draggedNode) {
      setSnapGuides([]);
      return;
    }

    const unselectedNodes = nodes.filter((node) => (
      !nodeDrag.nodeStartPositions.some((position) => position.nodeId === node.id)
    ));
    const snapped = getSnappedNodePosition(
      draggedNode,
      Math.round(point.x - nodeDrag.offsetX),
      Math.round(point.y - nodeDrag.offsetY),
      unselectedNodes
    );
    const deltaX = snapped.x - nodeDrag.startX;
    const deltaY = snapped.y - nodeDrag.startY;
    const draggedPositions = new Map(nodeDrag.nodeStartPositions.map((position) => [position.nodeId, position]));

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const startPosition = draggedPositions.get(node.id);
        return startPosition
          ? {
              ...node,
              x: Math.max(24, Math.round(startPosition.x + deltaX)),
              y: Math.max(24, Math.round(startPosition.y + deltaY))
            }
          : node;
      })
    );
    setSnapGuides(snapped.guides);
  };

  const finishNodeDrag = (event: PointerEvent<SVGGElement>) => {
    if (waferDragRef.current) {
      finishWaferDrag(event as unknown as PointerEvent<SVGSVGElement>);
      return;
    }

    const pendingTouchNode = pendingTouchNodeRef.current;
    if (event.pointerType === "touch" && pendingTouchNode?.pointerId === event.pointerId) {
      pendingTouchNodeRef.current = null;
      if (event.type === "pointerup") {
        setRoleMenu(null);
        setSelectedWafers([]);
        setSelectedNodeIds(new Set([pendingTouchNode.nodeId]));
      }
      return;
    }

    clearDragTouchAction();
    if (pendingConnectionStart && pendingConnectionStart.pointerId === event.pointerId) {
      safelyReleasePointerCapture(event.currentTarget, event.pointerId);
      setPendingConnectionStart(null);
      return;
    }

    if (connectionDraft && connectionDraft.pointerId === event.pointerId) {
      safelyReleasePointerCapture(event.currentTarget, event.pointerId);
      finishConnection(event);
      return;
    }

    if (!nodeDrag || nodeDrag.pointerId !== event.pointerId) {
      return;
    }

    safelyReleasePointerCapture(event.currentTarget, event.pointerId);
    const finishedDrag = nodeDrag;
    setNodeDrag(null);
    setSnapGuides([]);

    const nodeStartPositions = new Map(finishedDrag.nodeStartPositions.map((position) => [position.nodeId, position]));
    const movedNodes = nodes.filter((node) => {
      const startPosition = nodeStartPositions.get(node.id);
      return startPosition && (node.x !== startPosition.x || node.y !== startPosition.y);
    });

    if (movedNodes.length === 0) {
      return;
    }

    pushUndoSnapshot();

    movedNodes.forEach((node) => queueNodePositionPersist(node.id, node.x, node.y));
  };

  const beginWaferDrag = (event: PointerEvent<SVGGElement>, node: FlowNode, wafer: WaferPin) => {
    if (event.pointerType === "touch" && pointerPinchRef.current.active) {
      return;
    }
    if (!canEdit || (!onSubmitCheckpoint && !onMoveApprovedWafer && !onRouteCheckpoint && !onArchiveWafers) || event.button !== 0 || isMovePending) {
      return;
    }

    event.stopPropagation();
    waferDragRenderQueueRef.current?.clear();
    setIsArchiveDropActive(false);
    setIsArchiveDropEligible(false);
    setRoleMenu(null);
    setMoveMessage(null);

    const draggedSelection = activeSelectedWafers.some(
      (selection) => selection.assignmentId === wafer.assignmentId
    )
      ? activeSelectedWafers
      : [{
          assignmentId: wafer.assignmentId,
          nodeId: node.id,
          label: getWaferChipLabel(wafer),
          isDie: Boolean(wafer.dieLabel)
        }];

    const point = getScenePoint(event);
    const nextDrag = {
      assignmentId: wafer.assignmentId,
      sourceStepId: node.id,
      waferLabel: getWaferSelectionLabel(draggedSelection),
      wafers: draggedSelection.map((selection) => ({
        assignmentId: selection.assignmentId,
        waferLabel: selection.label,
        isDie: selection.isDie
      })),
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      hasMoved: false
    };
    waferDragRef.current = nextDrag;
    safelySetPointerCapture(event.currentTarget, event.pointerId);
  };

  const updateWaferDrag = (event: PointerEvent<Element>) => {
    const currentDrag = waferDragRef.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) {
      return;
    }

    event.stopPropagation();
    const point = getScenePoint(event);
    const hasMoved =
      currentDrag.hasMoved ||
      hasCrossedWaferDragThreshold({
        startClientX: currentDrag.startClientX,
        startClientY: currentDrag.startClientY,
        clientX: event.clientX,
        clientY: event.clientY
      });
    const nextDrag = {
      ...currentDrag,
      clientX: event.clientX,
      clientY: event.clientY,
      x: point.x,
      y: point.y,
      hasMoved
    };
    waferDragRef.current = nextDrag;
    if (hasMoved) {
      if (!currentDrag.hasMoved) {
        if (frameRef.current) {
          safelySetPointerCapture(frameRef.current, event.pointerId);
        }
        setDragTouchAction();
      }
      const nextDropTarget = resolveWaferDropTarget(nextDrag);
      const currentDropTarget = waferDropTargetRef.current;
      const targetChanged =
        currentDropTarget?.nodeId !== nextDropTarget?.nodeId ||
        currentDropTarget?.kind !== nextDropTarget?.kind;
      if (targetChanged) {
        waferDropTargetRef.current = nextDropTarget;
        setWaferDropTarget(nextDropTarget);
      }

      const dockRect = archiveDockRef.current?.getBoundingClientRect();
      const nextArchiveDropActive = Boolean(
        dockRect && isClientPointInsideRect({ x: event.clientX, y: event.clientY }, dockRect)
      );
      const source = nodeById.get(nextDrag.sourceStepId);
      const draggedPins = source?.wafers.filter((wafer) => (
        nextDrag.wafers.some((item) => item.assignmentId === wafer.assignmentId)
      )) ?? [];
      setIsArchiveDropActive(nextArchiveDropActive);
      setIsArchiveDropEligible(nextArchiveDropActive && areWafersArchivable(draggedPins));

      const dragPreview = svgRef.current?.querySelector<SVGGElement>(".flow-wafer-drag-preview");
      if (!dragPreview || targetChanged) {
        waferDragRenderQueueRef.current?.push(nextDrag);
      } else {
        dragPreview.setAttribute("transform", `translate(${nextDrag.x + 12} ${nextDrag.y + 12})`);
      }
    }
  };

  const clearDragTouchAction = () => {
    if (frameRef.current) {
      frameRef.current.style.touchAction = "";
    }
    if (svgRef.current) {
      svgRef.current.style.touchAction = "";
    }
  };

  const setDragTouchAction = () => {
    if (frameRef.current) {
      frameRef.current.style.touchAction = "none";
    }
    if (svgRef.current) {
      svgRef.current.style.touchAction = "none";
    }
  };

  const clearWaferDragState = () => {
    waferDragRef.current = null;
    waferDropTargetRef.current = null;
    waferDragRenderQueueRef.current?.clear();
    setWaferDrag(null);
    setWaferDropTarget(null);
    setIsArchiveDropActive(false);
    setIsArchiveDropEligible(false);
    clearDragTouchAction();
  };

  const archiveDraggedWafers = (drag: WaferDrag) => {
    if (!processTemplateId || !onArchiveWafers || isWaferMutationPending) {
      setArchiveMessage("Archiving is not available for this process.");
      return;
    }

    const source = nodeById.get(drag.sourceStepId);
    const pins = source?.wafers.filter((wafer) => (
      drag.wafers.some((item) => item.assignmentId === wafer.assignmentId)
    )) ?? [];
    if (!areWafersArchivable(pins)) {
      setArchiveMessage("Only wafers and dies with a completed process can be archived.");
      return;
    }

    const assignmentIds = new Set(pins.map((wafer) => wafer.assignmentId));
    setArchiveMessage(`Archiving ${drag.waferLabel}…`);
    startWaferMutationTransition(() => {
      void onArchiveWafers({
        templateId: processTemplateId,
        items: pins.map((wafer) => ({ assignmentId: wafer.assignmentId, mutationId: crypto.randomUUID() }))
      }).then((result) => {
        if (!result.ok) {
          setArchiveMessage(result.error);
          return;
        }

        setNodes((currentNodes) => currentNodes.map((node) => {
          const nextWafers = node.wafers.filter((wafer) => !assignmentIds.has(wafer.assignmentId));
          return nextWafers.length === node.wafers.length
            ? node
            : { ...node, wafers: nextWafers, height: getNodeHeightForWafers(nextWafers) };
        }));
        setSelectedWafers((current) => current.filter((selection) => !assignmentIds.has(selection.assignmentId)));
        const archivedAt = new Date().toISOString();
        setOptimisticArchiveItems((current) => {
          const byWaferId = new Map(current.map((item) => [item.waferId, item]));
          for (const pin of pins) {
            if (!pin.waferId) continue;
            byWaferId.set(pin.waferId, {
              assignmentId: pin.assignmentId,
              waferId: pin.waferId,
              waferCode: pin.waferCode,
              dieLabel: pin.dieLabel,
              archivedAt,
              archivedByName: null,
              completedAt: archivedAt
            });
          }
          return Array.from(byWaferId.values()).sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
        });
        setHiddenArchiveWaferIds((current) => {
          const next = new Set(current);
          for (const pin of pins) {
            if (pin.waferId) next.delete(pin.waferId);
          }
          return next;
        });
        setArchiveDockReceived(true);
        window.setTimeout(() => setArchiveDockReceived(false), 360);
        setArchiveMessage(`${drag.waferLabel} archived. Completed history was preserved.`);
        router.refresh();
      }).catch((error: unknown) => {
        setArchiveMessage(error instanceof Error ? error.message : "The archive operation failed.");
      });
    });
  };

  const openWaferMoveDialog = (
    wafers: readonly SelectedFlowWafer[],
    sourceStepId: string,
    targetStepId: string
  ) => {
    const sourceNode = nodeById.get(sourceStepId);
    const target = nodeById.get(targetStepId);
    if (!sourceNode || !target) {
      return;
    }

    const uniqueWafers = Array.from(
      new Map(
        wafers
          .filter((wafer) => wafer.nodeId === sourceStepId)
          .map((wafer) => [wafer.assignmentId, wafer])
      ).values()
    );
    if (uniqueWafers.length === 0) {
      return;
    }
    const eligible = sourceNode.wafers.filter((wafer) =>
      uniqueWafers.some((selected) => selected.assignmentId === wafer.assignmentId)
    );
    const allEligible = eligible.length === uniqueWafers.length && eligible.every((wafer) =>
      (sourceStepId !== targetStepId && Boolean(onMoveApprovedWafer) && canMoveToProcessStep({
        sourceMode: sourceNode.executionMode,
        status: wafer.currentStepStatus,
        targetMode: target.executionMode
      })) ||
      (Boolean(onRouteCheckpoint) && canReviewerRouteCheckpoint({
        attemptId: wafer.latestStepAttemptId,
        canReview: wafer.canReview,
        currentUserId,
        requiredReviewerId: wafer.requiredReviewerId,
        status: wafer.currentStepStatus
      }))
    );
    if (!allEligible) {
      setMoveMessage(target.executionMode === "anytime"
        ? "Only active main-flow work or approved Complete work can enter an anytime step."
        : "Complete and approve this work before moving it to another main-flow step.");
      return;
    }

    const move: PendingWaferMove = {
      kind: "move",
      wafers: uniqueWafers.map((wafer) => ({
        mutationId: crypto.randomUUID(),
        checkpointMutationId: crypto.randomUUID(),
        assignmentId: wafer.assignmentId,
        waferLabel: wafer.label,
        isDie: wafer.isDie
      })),
      sourceStepId,
      sourceLabel: sourceNode.label,
      targetStepId: target.id,
      targetLabel: target.label,
      waferLabel: getWaferSelectionLabel(uniqueWafers),
      completeSourceStep: false,
      revertToPriorStep: false
    };
    setPendingWaferMoveNote("");
    setPendingWaferMoveFiles([]);
    setPendingWaferMoveFileError(null);
    submitPendingWaferMove(move, "");
  };

  const openCheckpointSubmitDialog = (
    wafers: readonly SelectedFlowWafer[],
    sourceStepId: string
  ) => {
    const sourceNode = nodeById.get(sourceStepId);
    if (!sourceNode) return;
    const uniqueWafers = Array.from(new Map(
      wafers.filter((wafer) => wafer.nodeId === sourceStepId).map((wafer) => [wafer.assignmentId, wafer])
    ).values());
    const eligible = sourceNode.wafers.filter((wafer) => uniqueWafers.some((selected) => selected.assignmentId === wafer.assignmentId));
    if (!sourceNode.requiredReviewerId) {
      setMoveMessage(`Assign a checkpoint reviewer to ${sourceNode.label} before completing work.`);
      return;
    }
    if (!eligible.length || !eligible.every((wafer) => wafer.currentStepExecutionId && canSubmitCheckpoint(wafer.currentStepStatus))) {
      setMoveMessage("Only work on the Beginning side can be submitted for checkpoint review.");
      return;
    }
    setPendingWaferMove({
      kind: "submit",
      wafers: uniqueWafers.map((wafer) => ({
        mutationId: crypto.randomUUID(),
        checkpointMutationId: crypto.randomUUID(),
        assignmentId: wafer.assignmentId,
        waferLabel: wafer.label,
        isDie: wafer.isDie
      })),
      sourceStepId,
      sourceLabel: sourceNode.label,
      targetStepId: sourceStepId,
      targetLabel: `${sourceNode.label} · Complete`,
      waferLabel: getWaferSelectionLabel(uniqueWafers),
      completeSourceStep: false,
      revertToPriorStep: false
    });
    setPendingWaferMoveNote("");
    setPendingWaferMoveFiles([]);
    setPendingWaferMoveFileError(null);
  };

  const finishWaferDrag = (event: PointerEvent<Element>) => {
    const currentDrag = waferDragRef.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) {
      return;
    }

    event.stopPropagation();
    safelyReleasePointerCapture(event.currentTarget, event.pointerId);
    const finishedDrag = currentDrag;
    clearWaferDragState();

    if (!shouldCommitWaferDrop(event.type, finishedDrag.hasMoved)) {
      return;
    }

    const dockRect = archiveDockRef.current?.getBoundingClientRect();
    if (dockRect && isClientPointInsideRect(
      { x: finishedDrag.clientX, y: finishedDrag.clientY },
      dockRect
    )) {
      archiveDraggedWafers(finishedDrag);
      return;
    }

    const point = getScenePoint(event);
    const target = displayNodes.find((node) => nodeContainsPoint(node, point));

    if (!target) {
      return;
    }
    const selections = finishedDrag.wafers.map((wafer) => ({
        assignmentId: wafer.assignmentId,
        nodeId: finishedDrag.sourceStepId,
        label: wafer.waferLabel,
        isDie: wafer.isDie
      }));
    if (target.id === finishedDrag.sourceStepId) {
      if (point.x >= target.x + target.width / 2) {
        openCheckpointSubmitDialog(selections, finishedDrag.sourceStepId);
      } else {
        openWaferMoveDialog(selections, finishedDrag.sourceStepId, target.id);
      }
    } else {
      openWaferMoveDialog(selections, finishedDrag.sourceStepId, target.id);
    }
  };

  const appendPendingWaferMoveFiles = (files: readonly File[]) => {
    setPendingWaferMoveFiles((current) => {
      const merged = mergeNoteAttachmentFiles(current, files);
      setPendingWaferMoveFileError(
        merged.oversizedCount > 0
          ? "Files must be 50 MB or smaller."
          : merged.overflowCount > 0
            ? "You can attach up to 8 files."
            : null
      );
      return merged.files;
    });
  };

  const pastePendingWaferMoveImages = (event: ClipboardEvent<HTMLElement>) => {
    const images = getClipboardImageFiles(event.clipboardData);
    if (!images.length) {
      return;
    }

    event.preventDefault();
    appendPendingWaferMoveFiles(images);
  };

  const cancelPendingWaferMove = () => {
    if (isMovePending) {
      return;
    }

    setPendingWaferMove(null);
    setPendingWaferMoveNote("");
    setPendingWaferMoveFiles([]);
    setPendingWaferMoveFileError(null);
  };

  function submitPendingWaferMove(moveOverride?: PendingWaferMove, noteOverride?: string) {
    const activeMove = moveOverride ?? pendingWaferMove;
    if (!activeMove || isMovePending || (
      activeMove.kind === "submit"
        ? !onSubmitCheckpoint
        : !onMoveApprovedWafer && !onRouteCheckpoint
    )) {
      return;
    }

    const note = (noteOverride ?? pendingWaferMoveNote).trim();
    if (activeMove.kind === "submit" && !note) {
      setMoveMessage(`Add a process note before moving ${activeMove.waferLabel}.`);
      return;
    }

    const move = activeMove;
    const actionNote = getProcessMoveActionNote(move.kind, note, move.targetLabel);
    const files = moveOverride ? [] : pendingWaferMoveFiles;
    const previousNodes = nodesRef.current;
    const moveAssignmentIds = new Set(move.wafers.map((wafer) => wafer.assignmentId));
    const movingWafers = previousNodes
      .find((node) => node.id === move.sourceStepId)
      ?.wafers.filter((wafer) => moveAssignmentIds.has(wafer.assignmentId)) ?? [];
    const movingWafersByAssignmentId = new Map(
      movingWafers.map((wafer) => [wafer.assignmentId, wafer])
    );
    const sourceNode = previousNodes.find((node) => node.id === move.sourceStepId);
    const targetNode = previousNodes.find((node) => node.id === move.targetStepId);
    const destinationStatus = sourceNode && targetNode && getReviewerRouteDecision(
      sourceNode.order,
      targetNode.order,
      sourceNode.executionMode,
      targetNode.executionMode
    ) === "redo"
      ? "redo_required" as const
      : "queued" as const;

    setNodes((currentNodes) => move.kind === "submit"
      ? currentNodes.map((node) => node.id === move.sourceStepId ? {
          ...node,
          wafers: node.wafers.map((wafer) => moveAssignmentIds.has(wafer.assignmentId)
            ? { ...wafer, currentStepStatus: "awaiting_checkpoint" as const }
            : wafer),
          height: getNodeHeightForWafers(node.wafers)
        } : node)
      : moveWafersBetweenNodes(currentNodes, move.sourceStepId, move.targetStepId, moveAssignmentIds, destinationStatus)
    );
    setSelectedWafers([]);
    setPendingWaferMove(null);
    setPendingWaferMoveNote("");
    setPendingWaferMoveFiles([]);
    setPendingWaferMoveFileError(null);
    setMoveMessage(`Moving ${move.waferLabel} to ${move.targetLabel} in background...`);

    startMoveTransition(() => {
      void (async () => {
        const outcomes = await Promise.all(move.wafers.map(async (waferMove) => {
          const movingWafer = movingWafersByAssignmentId.get(waferMove.assignmentId) ?? null;

          try {
            const result = move.kind === "submit"
              ? await onSubmitCheckpoint!({
                  stepExecutionId: movingWafer?.currentStepExecutionId ?? "",
                  mutationId: waferMove.mutationId,
                  notes: actionNote,
                  evidence: {}
                })
              : movingWafer && canReviewerRouteCheckpoint({
                  attemptId: movingWafer.latestStepAttemptId,
                  canReview: movingWafer.canReview,
                  currentUserId,
                  requiredReviewerId: movingWafer.requiredReviewerId,
                  status: movingWafer.currentStepStatus
                })
                ? await onRouteCheckpoint!({
                    attemptId: movingWafer.latestStepAttemptId!,
                    targetStepId: move.targetStepId,
                    decisionMutationId: waferMove.checkpointMutationId,
                    movementMutationId: waferMove.mutationId,
                    note: actionNote
                  })
                : await onMoveApprovedWafer!({
                    mutationId: waferMove.mutationId,
                    assignmentId: waferMove.assignmentId,
                    sourceStepId: move.sourceStepId,
                    targetStepId: move.targetStepId,
                    note: actionNote
                  });
            let attachmentError: string | null = null;

            if (result.ok && files.length && movingWafer?.projectId && movingWafer.waferId) {
              try {
                const payload = result.data as {
                  id?: string;
                  step_execution_id?: string;
                  metadata?: Record<string, unknown> | null;
                };
                const stepId = move.kind === "submit" ? move.sourceStepId : move.targetStepId;
                const stepExecutionId = move.kind === "submit"
                  ? movingWafer.currentStepExecutionId ?? null
                  : payload.id ?? payload.step_execution_id ?? null;
                const noteId = `execution-note:${stepExecutionId ?? waferMove.mutationId}`;
                const authorId = typeof payload.metadata?.note_author_id === "string"
                  ? payload.metadata.note_author_id
                  : currentUserId ?? null;
                const author = typeof payload.metadata?.note_author_name === "string"
                  ? payload.metadata.note_author_name
                  : currentUserName?.trim() || "Unknown user";
                await persistWaferStepNoteAttachments({
                  projectId: movingWafer.projectId,
                  waferId: movingWafer.waferId,
                  dieLabel: movingWafer.dieLabel || movingWafer.waferCode,
                  stepId,
                  stepName: move.kind === "submit" ? move.sourceLabel : move.targetLabel,
                  stepExecutionId,
                  noteId,
                  authorId,
                  author,
                  body: actionNote,
                  files
                });
              } catch (error) {
                attachmentError = error instanceof Error
                  ? error.message
                  : "The pasted image could not be saved.";
              }
            }

            return { waferMove, result, attachmentError };
          } catch (error) {
            return {
              waferMove,
              result: {
                ok: false as const,
                error: error instanceof Error ? error.message : "The wafer move failed."
              },
              attachmentError: null
            };
          }
        }));

        const failedOutcomes = outcomes.filter((outcome) => !outcome.result.ok);
        const successfulOutcomes = outcomes.filter((outcome) => outcome.result.ok);

        if (move.kind === "move" && onSaveStepParameters && targetNode && successfulOutcomes.length > 0) {
          setPendingStepParameterEntries((current) => [
            ...current,
            ...successfulOutcomes.map((outcome) => ({
              assignmentId: outcome.waferMove.assignmentId,
              movementMutationId: outcome.waferMove.mutationId,
              waferLabel: outcome.waferMove.waferLabel,
              stepId: move.targetStepId,
              stepName: move.targetLabel,
              parametersSchema: targetNode.parametersSchema
            }))
          ]);
        }

        if (failedOutcomes.length > 0) {
          const successfulAssignmentIds = new Set(
            successfulOutcomes.map((outcome) => outcome.waferMove.assignmentId)
          );
          const failedWafers = failedOutcomes.map((outcome) => outcome.waferMove);
          const failedSelections: SelectedFlowWafer[] = failedWafers.map((wafer) => ({
            assignmentId: wafer.assignmentId,
            nodeId: move.sourceStepId,
            label: wafer.waferLabel,
            isDie: wafer.isDie
          }));

          setNodes(move.kind === "submit"
            ? previousNodes.map((node) => node.id === move.sourceStepId ? {
                ...node,
                wafers: node.wafers.map((wafer) => successfulAssignmentIds.has(wafer.assignmentId)
                  ? { ...wafer, currentStepStatus: "awaiting_checkpoint" as const }
                  : wafer),
                height: getNodeHeightForWafers(node.wafers)
              } : node)
            : moveWafersBetweenNodes(
                previousNodes,
                move.sourceStepId,
                move.targetStepId,
                successfulAssignmentIds,
                destinationStatus
              ));
          setSelectedWafers(failedSelections);
          if (move.kind === "submit") {
            setPendingWaferMove({
              ...move,
              wafers: failedWafers,
              waferLabel: getWaferSelectionLabel(failedSelections)
            });
            setPendingWaferMoveNote(actionNote);
            setPendingWaferMoveFiles(files);
          }
          const firstFailure = failedOutcomes[0];
          const failureMessage = firstFailure && !firstFailure.result.ok
            ? firstFailure.result.error
            : "The selected dies could not be moved.";
          setMoveMessage(
            successfulOutcomes.length > 0
              ? `${successfulOutcomes.length} of ${outcomes.length} moved. ${failedOutcomes.length} remain selected: ${failureMessage}`
              : failureMessage
          );
          if (successfulOutcomes.length > 0) {
            scheduleBackgroundRefresh();
          }
          return;
        }

        const attachmentFailureCount = outcomes.filter((outcome) => outcome.attachmentError).length;
        const successMessage = move.kind === "submit"
          ? `Submitted ${move.waferLabel} for checkpoint review.`
          : `Moved ${move.waferLabel} to ${move.targetLabel}.`;
        setMoveMessage(
          attachmentFailureCount > 0
            ? `${successMessage} ${attachmentFailureCount} attachment set${attachmentFailureCount === 1 ? "" : "s"} could not be saved.`
            : successMessage
        );
      })();
    });
  }

  const updateCheckpointReviewer = (nodeId: string, reviewerId: string | null) => {
    if (!onUpdateStepReviewer || isGraphPending) return;
    const reviewerName = reviewerOptions.find((reviewer) => reviewer.id === reviewerId)?.name ?? null;
    setNodes((current) => current.map((node) => node.id === nodeId
      ? { ...node, requiredReviewerId: reviewerId, requiredReviewerName: reviewerName }
      : node));
    setRoleMenu(null);
    startGraphTransition(() => {
      void (async () => {
        const result = await onUpdateStepReviewer({ stepId: nodeId, reviewerId });
        if (!result.ok) {
          setMoveMessage(result.error);
          scheduleBackgroundRefresh();
          return;
        }
        setMoveMessage(reviewerId ? `Checkpoint reviewer set to ${reviewerName}.` : "Checkpoint reviewer removed.");
      })();
    });
  };

  const updateStepExecutionMode = (nodeId: string, executionMode: "main" | "anytime") => {
    if (!onUpdateStepExecutionMode || isGraphPending) return;
    const previousNode = nodeById.get(nodeId);
    if (!previousNode || previousNode.executionMode === executionMode) return;

    const removedEdges = edgesRef.current.filter((edge) => edge.from === nodeId || edge.to === nodeId);
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, executionMode } : node));
    if (executionMode === "anytime") {
      setEdges((current) => current.filter((edge) => edge.from !== nodeId && edge.to !== nodeId));
    }
    setRoleMenu(null);

    startGraphTransition(() => {
      void (async () => {
        const result = await onUpdateStepExecutionMode({ stepId: nodeId, executionMode });
        if (!result.ok) {
          setNodes((current) => current.map((node) => node.id === nodeId ? previousNode : node));
          if (executionMode === "anytime") {
            setEdges((current) => normalizeFlowEdges([...current, ...removedEdges]));
          }
          setMoveMessage(result.error);
          return;
        }

        setMoveMessage(executionMode === "anytime"
          ? `${previousNode.label} is now available anytime.`
          : `${previousNode.label} returned to the main-flow canvas. Connect it where it belongs.`);
      })();
    });
  };

  const updateConnection = (event: PointerEvent<SVGSVGElement>) => {
    if (updateCanvasSelection(event)) {
      return;
    }

    if (waferDragRef.current) {
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

  const finishConnection = (event: PointerEvent<SVGSVGElement | SVGGElement>) => {
    if (event.currentTarget instanceof SVGSVGElement && finishCanvasSelection(event as PointerEvent<SVGSVGElement>)) {
      return;
    }

    if (waferDragRef.current) {
      finishWaferDrag(event as PointerEvent<SVGSVGElement>);
      return;
    }

    if (!connectionDraft || connectionDraft.pointerId !== event.pointerId) {
      return;
    }

    const point = getScenePoint(event);
    const finishedDraft = connectionDraft;
    const sourceNode = nodeById.get(finishedDraft.from);
    const target = displayNodes.find((node) => node.id !== finishedDraft.from && nodeContainsPoint(node, point));
    setConnectionDraft(null);

    if (!target || !sourceNode || !finishedDraft.hasMoved) {
      return;
    }

    if (sourceNode.executionMode === "anytime" || target.executionMode === "anytime") {
      setMoveMessage("Anytime steps stay disconnected and can be entered from any approved stage.");
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
    const temporaryTransitionId = `${EDGE_ID_PREFIX}${crypto.randomUUID()}`;
    const transitionExists = edges.some((edge) => edge.from === finishedDraft.from && edge.to === target.id);
    if (transitionExists) {
      setMoveMessage("That transition already exists.");
      return;
    }

    pushUndoSnapshot();

    setEdges((currentEdges) =>
      normalizeFlowEdges([
        ...currentEdges,
        {
          id: temporaryTransitionId,
          from: finishedDraft.from,
          to: target.id,
          kind: edgeType
        }
      ])
    );
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

  const deleteNodes = useCallback((nodeIds: string[]) => {
    if (!canEdit) {
      return;
    }

    const uniqueNodeIds = Array.from(new Set(nodeIds)).filter((nodeId) => nodeById.has(nodeId));
    if (uniqueNodeIds.length === 0) {
      return;
    }

    if (!onDeleteSteps) {
      setMoveMessage("Graph deletion persistence is not available for this process view.");
      return;
    }

    pushUndoSnapshot();

    const label = uniqueNodeIds.length === 1
      ? nodeById.get(uniqueNodeIds[0])?.label ?? "selected step"
      : `${uniqueNodeIds.length} selected steps`;
    const previousNodes = nodesRef.current;
    const previousEdges = edgesRef.current;
    const previousRecoveredNodeIds = new Set(undoRecoveredNodeIdsRef.current);
    const previousRecoveredEdgeIds = new Set(undoRecoveredEdgeIdsRef.current);
    const deletedIds = new Set(uniqueNodeIds);
    uniqueNodeIds.forEach((nodeId) => undoRecoveredNodeIdsRef.current.delete(nodeId));
    previousEdges.forEach((edge) => {
      if (deletedIds.has(edge.from) || deletedIds.has(edge.to)) {
        undoRecoveredEdgeIdsRef.current.delete(edge.id);
      }
    });

    setNodes((currentNodes) => currentNodes.filter((node) => !deletedIds.has(node.id)));
    setEdges((currentEdges) => normalizeFlowEdges(currentEdges.filter((edge) => !deletedIds.has(edge.from) && !deletedIds.has(edge.to))));
    setConnectionDraft((draft) => (draft && deletedIds.has(draft.from) ? null : draft));
    setNodeDrag((drag) => (drag && deletedIds.has(drag.nodeId) ? null : drag));
    setWaferDrag((drag) => (drag && deletedIds.has(drag.sourceStepId) ? null : drag));
    setSelectedNodeIds(new Set());
    setSnapGuides([]);
    setRoleMenu(null);
    setMoveMessage(`Deleting ${label}...`);

    startGraphTransition(() => {
      void (async () => {
        const result = await onDeleteSteps({ stepIds: uniqueNodeIds });

        if (!result.ok) {
          if (isAlreadyDeletedStepError(result.error)) {
            setMoveMessage(`Deleted ${label} locally; server copy was already removed.`);
            return;
          }

          setNodes(previousNodes);
          setEdges(normalizeFlowEdges(previousEdges));
          undoRecoveredNodeIdsRef.current = previousRecoveredNodeIds;
          undoRecoveredEdgeIdsRef.current = previousRecoveredEdgeIds;
          setMoveMessage(result.error);
          return;
        }

        setMoveMessage(`Deleted ${label}.`);
      })();
    });
  }, [canEdit, nodeById, onDeleteSteps, pushUndoSnapshot]);

  const deleteSelectedNodes = useCallback(() => {
    deleteNodes([...selectedNodeIds]);
  }, [deleteNodes, selectedNodeIds]);

  const deleteEdge = useCallback((edgeId: string) => {
    if (!canEdit) {
      return;
    }

    const hasEdge = edges.some((edge) => edge.id === edgeId);
    if (!hasEdge) {
      return;
    }

    pushUndoSnapshot();
    undoRecoveredEdgeIdsRef.current.delete(edgeId);
    setEdges((current) => normalizeFlowEdges(current.filter((edge) => edge.id !== edgeId)));
    setSelectedEdgeId(null);

    if (edgeId.startsWith(EDGE_ID_PREFIX) || !onDeleteTransitions) {
      return;
    }

    startGraphTransition(() => {
      void (async () => {
        const result = await onDeleteTransitions({ transitionIds: [edgeId] });
        if (!result.ok) {
          if (isAlreadyDeletedTransitionError(result.error)) {
            setMoveMessage("Deleted transition locally; server copy was already removed.");
            return;
          }

          setMoveMessage(result.error);
        }
      })();
    });
  }, [canEdit, edges, onDeleteTransitions, pushUndoSnapshot]);

  useEffect(() => {
    const onGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isTextInputTarget(event.target)) {
        return;
      }

      const isUndoShortcut = (event.key === "z" || event.key === "Z") && (event.ctrlKey || event.metaKey) && !event.shiftKey;
      if (isUndoShortcut) {
        if (!canEdit) {
          return;
        }

        event.preventDefault();
        undoLastEdit();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!canEdit) {
          return;
        }

        if (selectedWafer) {
          event.preventDefault();
          deleteSelectedWafer();
        } else if (selectedEdgeId) {
          event.preventDefault();
          deleteEdge(selectedEdgeId);
        } else if (selectedNodeIds.size > 0) {
          event.preventDefault();
          deleteSelectedNodes();
        }
      }
    };

    window.addEventListener("keydown", onGlobalKeyDown);

    return () => {
      window.removeEventListener("keydown", onGlobalKeyDown);
    };
  }, [canEdit, deleteEdge, deleteSelectedNodes, deleteSelectedWafer, selectedEdgeId, selectedNodeIds, selectedWafer, undoLastEdit]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const normalizeWheelDelta = (event: globalThis.WheelEvent) => {
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        return {
          x: event.deltaX * 16,
          y: event.deltaY * 16
        };
      }

      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        return {
          x: event.deltaX * frame.clientWidth,
          y: event.deltaY * frame.clientHeight
        };
      }

      return {
        x: event.deltaX,
        y: event.deltaY
      };
    };

    const handleWheelFallback = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (!event.ctrlKey && !event.metaKey) {
        const normalizedDelta = normalizeWheelDelta(event);
        frame.scrollLeft += normalizedDelta.x;
        frame.scrollTop += normalizedDelta.y;
        return;
      }

      const panePoint = getPanePoint(event.clientX, event.clientY);
      lastZoomPanePointRef.current = panePoint;
      applyScaleAtAnchor(
        getWheelZoomTargetScale(scaleRef.current, event.deltaY, MIN_SCALE, MAX_SCALE),
        panePoint
      );
    };

    const handleGestureStart = (event: Event) => {
      if (activePinchSourceRef.current === "pointer") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const gestureEvent = event as Event & { scale?: number; clientX?: number; clientY?: number };
      const gestureScale = typeof gestureEvent.scale === "number" && gestureEvent.scale > 0
        ? gestureEvent.scale
        : 1;

      activePinchSourceRef.current = "webkit";
      pointerPinchRef.current = { active: false, lastDistance: 1, rawScale: scaleRef.current };
      pinchInitialAppScaleRef.current = scaleRef.current;
      pinchInitialGestureScaleRef.current = gestureScale;
      const pointerCentroid = getTouchCentroid(Array.from(touchPointersRef.current.values()).slice(0, 2));
      const panePoint = typeof gestureEvent.clientX === "number" && typeof gestureEvent.clientY === "number"
        ? getPanePoint(gestureEvent.clientX, gestureEvent.clientY)
        : pointerCentroid
          ? getPanePoint(pointerCentroid.clientX, pointerCentroid.clientY)
          : getPanePoint();
      pinchAnchorRef.current = panePoint;
      lastZoomPanePointRef.current = panePoint;
      pinchSceneAnchorRef.current = panePoint
        ? getStableZoomAnchor(
            scaleRef.current,
            frame.scrollLeft,
            frame.scrollTop,
            panePoint,
            pendingZoomAnchorRef.current
          )
        : null;
      pendingPinchScaleRef.current = null;
      pendingTouchNodeRef.current = null;

      event.preventDefault();
      event.stopPropagation();
    };

    const handleGestureChange = (event: Event) => {
      if (activePinchSourceRef.current !== "webkit") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const gestureEvent = event as Event & { scale?: number; clientX?: number; clientY?: number };
      const gestureScale = gestureEvent.scale;
      if (gestureScale === undefined) {
        return;
      }

      if (typeof gestureEvent.clientX === "number" && typeof gestureEvent.clientY === "number") {
        pinchAnchorRef.current = getPanePoint(gestureEvent.clientX, gestureEvent.clientY);
        lastZoomPanePointRef.current = pinchAnchorRef.current;
      }

      queuePinchScale(getPinchTargetScale(
        pinchInitialAppScaleRef.current,
        pinchInitialGestureScaleRef.current,
        gestureScale
      ));
      event.preventDefault();
      event.stopPropagation();
    };

    const handleGestureEnd = (event: Event) => {
      if (activePinchSourceRef.current === "webkit") {
        activePinchSourceRef.current = null;
        pinchInitialAppScaleRef.current = scaleRef.current;
        pinchInitialGestureScaleRef.current = 1;
        if (pinchAnimationFrameRef.current === null) {
          pinchSceneAnchorRef.current = null;
        }
      }

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
      if (pinchAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(pinchAnimationFrameRef.current);
        pinchAnimationFrameRef.current = null;
      }
    };
  }, [applyScaleAtAnchor, getPanePoint, queuePinchScale]);

  return (
    <section className="flow-map-shell">
      {!pendingWaferMove && pendingStepParameterEntries[0] && onSaveStepParameters ? (
        <StepParameterEntryDialog
          key={pendingStepParameterEntries.map((entry) => entry.movementMutationId).join(":")}
          entries={pendingStepParameterEntries}
          onSave={onSaveStepParameters}
          currentUserName={currentUserName}
          onPersistAttachment={persistWaferStepNoteAttachments}
          onComplete={(message) => {
            const completedMutationIds = new Set(
              pendingStepParameterEntries.map((entry) => entry.movementMutationId)
            );
            setPendingStepParameterEntries((current) => current.filter(
              (entry) => !completedMutationIds.has(entry.movementMutationId)
            ));
            setMoveMessage(message);
          }}
          onSkipAll={() => setPendingStepParameterEntries([])}
        />
      ) : null}
      {waferCreateDraft ? (
        <WaferCreateDialog
          draft={waferCreateDraft}
          errorMessage={waferCreateError}
          isPending={isWaferMutationPending}
          onCancel={() => {
            setWaferCreateDraft(null);
            setWaferCreateError(null);
          }}
          onChange={(draft) => {
            setWaferCreateDraft(draft);
            setWaferCreateError(null);
          }}
          onSubmit={submitWaferCreate}
        />
      ) : null}
      {pendingWaferMove ? (
        <div className="flow-wafer-move-dialog-backdrop">
          <section
            aria-labelledby="flow-wafer-move-title"
            aria-modal="true"
            className="flow-wafer-move-dialog"
            onPaste={pastePendingWaferMoveImages}
            role="dialog"
          >
            <div className="flow-wafer-move-dialog__header">
              <h2 id="flow-wafer-move-title">
                {pendingWaferMove.kind === "submit" ? "Checkpoint note" : "Movement note"}
              </h2>
              {pendingWaferMove.wafers.length > 1 ? (
                <p>Applies to {pendingWaferMove.waferLabel}.</p>
              ) : null}
            </div>
            <dl className="flow-wafer-move-dialog__path">
              <div>
                <dt>From</dt>
                <dd>{pendingWaferMove.sourceLabel}</dd>
              </div>
              <div>
                <dt>To</dt>
                <dd>{pendingWaferMove.targetLabel}</dd>
              </div>
            </dl>
            <label className="flow-wafer-move-dialog__field">
              <span>Required note</span>
              <textarea
                autoFocus
                disabled={isMovePending}
                id="process-wafer-move-note"
                maxLength={4000}
                name="processWaferMoveNote"
                onChange={(event) => setPendingWaferMoveNote(event.currentTarget.value)}
                placeholder={
                  pendingWaferMove.kind === "submit"
                    ? "Summarize completed work and any review details."
                    : `Reason for moving to ${pendingWaferMove.targetLabel}.`
                }
                rows={5}
                value={pendingWaferMoveNote}
              />
            </label>
            <PendingNoteAttachments
              files={pendingWaferMoveFiles}
              disabled={isMovePending}
              error={pendingWaferMoveFileError}
              description={pendingWaferMove.wafers.length > 1
                ? "Paste images or attach files for all selected dies."
                : "Paste images or attach files for this step note."}
              onAddFiles={appendPendingWaferMoveFiles}
              onRemoveFile={(file) => setPendingWaferMoveFiles((current) => current.filter((candidate) => candidate !== file))}
            />
            <div className="flow-wafer-move-dialog__actions">
              <button
                className="button ghost-button"
                disabled={isMovePending}
                onClick={cancelPendingWaferMove}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button primary-button"
                disabled={isMovePending || !pendingWaferMoveNote.trim()}
                onClick={() => submitPendingWaferMove()}
                type="button"
              >
                {isMovePending
                  ? "Saving…"
                  : pendingWaferMove.kind === "submit" ? "Submit for review" : "Confirm move"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <ProcessFlowToolbar
        nodesCount={nodes.length}
        zoomPercent={Math.round(s * 100)}
        isGraphPending={isGraphPending}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onCenterView={() => centerView()}
        onOrganize={organizeCanvas}
        onAddLinkedStep={createLinkedStep}
        onAddWafer={openWaferCreateDialog}
        onUndo={undoLastEdit}
        canUndo={undoStepsCount > 0}
        canAddLinkedStep={Boolean(
          canEdit &&
          processTemplateId &&
          onCreateStep &&
          selectedLinkedStepEdge &&
          (selectedLinkedStepEdge.id.startsWith(EDGE_ID_PREFIX) || (onDeleteTransitions && onCreateTransition))
        )}
        canAddWafer={Boolean(canEdit && processTemplateId && onCreateWaferAtProcessStart)}
        canEdit={canEdit}
      />
      {selectedWafer && selectedWaferPin ? (
        <div
          aria-label={`Selection actions for ${activeSelectedWafers.map((wafer) => wafer.label).join(", ")}`}
          className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-[#e5e5db] bg-[#fafaf4] p-3 md:hidden"
        >
          <span
            className="mr-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#6b6a5f]"
            title={activeSelectedWafers.map((wafer) => wafer.label).join(", ")}
          >
            {getWaferSelectionLabel(activeSelectedWafers)} selected
          </span>
          <button
            className="button ghost-button"
            disabled={isMovePending}
            onClick={() => setSelectedWafers([])}
            type="button"
          >
            Clear
          </button>
          {canEdit && onDeleteWafer ? (
            <button
              className="button button-secondary"
              disabled={isMovePending}
              onClick={deleteSelectedWafer}
              type="button"
            >
              Delete {selectedWafer.isDie ? "die" : "wafer"}
            </button>
          ) : null}
          {canEdit && onArchiveWafers && canArchiveSelected && selectedWafer ? (
            <button
              className="button button-secondary"
              disabled={isWaferMutationPending}
              onClick={() => archiveDraggedWafers({
                assignmentId: selectedWafer.assignmentId,
                sourceStepId: selectedWafer.nodeId,
                waferLabel: getWaferSelectionLabel(activeSelectedWafers),
                wafers: selectedArchivePins.map((wafer) => ({
                  assignmentId: wafer.assignmentId,
                  waferLabel: getWaferChipLabel(wafer),
                  isDie: Boolean(wafer.dieLabel)
                })),
                pointerId: -1,
                startClientX: 0,
                startClientY: 0,
                clientX: 0,
                clientY: 0,
                startX: 0,
                startY: 0,
                x: 0,
                y: 0,
                hasMoved: true
              })}
              type="button"
            >
              Archive {selectedArchivePins.length > 1 ? "selected" : selectedWafer.isDie ? "die" : "wafer"}
            </button>
          ) : null}
          {activeSelectedWafers.every((selection) => {
            const wafer = nodeById.get(selection.nodeId)?.wafers.find((item) => item.assignmentId === selection.assignmentId);
            return wafer && canSubmitCheckpoint(wafer.currentStepStatus);
          }) ? (
            <button
              className="button primary-button"
              disabled={isMovePending}
              onClick={() => openCheckpointSubmitDialog(activeSelectedWafers, selectedWafer.nodeId)}
              type="button"
            >Complete{activeSelectedWafers.length > 1 ? " selected" : ""}</button>
          ) : null}
          {selectedWaferMoveTargets.map((target) => (
            <button
              className="button button-secondary"
              disabled={isMovePending}
              key={target.id}
              onClick={() => openWaferMoveDialog(
                activeSelectedWafers,
                selectedWafer.nodeId,
                target.id
              )}
              type="button"
            >
              {target.id === selectedWaferPin.anytimeReturnStepId
                ? `Return${activeSelectedWafers.length > 1 ? " all" : ""} to ${target.label}`
                : `Move${activeSelectedWafers.length > 1 ? " all" : ""} to ${target.label}`}
            </button>
          ))}
        </div>
      ) : null}
      {selectedNodeIds.size > 0 ? (
        <div
          aria-label="Selected step actions"
          className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-[#e5e5db] bg-[#fafaf4] p-3 md:hidden"
        >
          <span className="mr-auto text-xs font-semibold uppercase tracking-[0.08em] text-[#6b6a5f]">
            {selectedNodeIds.size === 1 ? "1 step selected" : `${selectedNodeIds.size} steps selected`}
          </span>
          <button
            className="button ghost-button"
            onClick={() => setSelectedNodeIds(new Set())}
            type="button"
          >
            Clear
          </button>
          <button
            className="button button-secondary"
            disabled={isGraphPending}
            onClick={deleteSelectedNodes}
            type="button"
          >
            {selectedNodeIds.size === 1 ? "Delete step" : "Delete steps"}
          </button>
        </div>
      ) : null}
      <ProcessFlowCanvas
        frameRef={frameRef}
        svgRef={svgRef}
        isPanning={isPanning}
        scaledWidth={scaledWidth}
        scaledHeight={scaledHeight}
        sceneWidth={sceneBounds.width}
        sceneHeight={sceneBounds.height}
        snapGuides={snapGuides}
        nodes={displayNodes}
        nodeById={nodeById}
        connectionDraft={connectionDraft}
        connectionNodeId={connectionDraft?.from ?? null}
        waferDrag={waferDrag}
        waferDropTarget={waferDropTarget}
        archiveRestoreTargetNodeId={archiveRestoreTargetNodeId}
        edges={edges}
        selectedNodeIds={selectedNodeIds}
        selectedEdgeId={selectedEdgeId}
        selectedWaferAssignmentIds={selectedWaferAssignmentIds}
        nodeDrag={nodeDrag}
        selectionRect={getSelectionRect()}
        editingNodeId={editingNodeId}
        editingNodeLabel={editingNodeLabel}
        editingInputRef={editingInputRef}
        roleMenu={roleMenu}
        roleMenuNode={roleMenu ? (nodeById.get(roleMenu.nodeId) ?? null) : null}
        onFramePointerDown={beginPan}
        onFramePointerMove={updatePan}
        onFramePointerUp={endPan}
        onFramePointerCancel={endPan}
        onFramePointerLeave={endPan}
        onFrameTouchPointerDownCapture={beginTouchPinch}
        onFrameTouchPointerMoveCapture={updateTouchPinch}
        onFrameTouchPointerEndCapture={endTouchPinch}
        onCanvasPointerMove={updateConnection}
        onCanvasPointerUp={finishConnection}
        onCanvasPointerCancel={() => {
          clearWaferDragState();
          setConnectionDraft(null);
          setPendingConnectionStart(null);
          setSelectionBox(null);
        }}
        onCanvasPointerDown={beginCanvasSelection}
        onCanvasDoubleClick={createNode}
        onCanvasContextMenu={(event) => {
          event.preventDefault();
          if (!canEdit) {
            return;
          }
          setRoleMenu(null);
          setSelectionBox(null);
          setSelectedNodeIds(new Set());
          setSelectedWafers([]);
        }}
        onNodePointerDown={handleNodePointerDown}
        onNodePointerMove={updateNodeDrag}
        onNodePointerUp={finishNodeDrag}
        onNodePointerCancel={finishNodeDrag}
        onNodeContextMenu={canEdit ? openRoleMenu : (event) => event.preventDefault()}
        onBeginLabelEdit={beginNodeLabelEdit}
        onEditingLabelChange={(event) => setEditingNodeLabel(event.currentTarget.value)}
        onCommitLabel={commitNodeLabel}
        onCancelLabelEdit={cancelNodeLabelEdit}
        onBeginWaferDrag={beginWaferDrag}
        onSelectWafer={selectWafer}
        onOpenWaferDetails={openWaferDetails}
        onOpenStepParameters={openStepParameters}
        onDeleteNodes={(nodeIds) => deleteNodes(nodeIds)}
        reviewerOptions={reviewerOptions}
        onUpdateReviewer={onUpdateStepReviewer ? updateCheckpointReviewer : undefined}
        onUpdateExecutionMode={onUpdateStepExecutionMode ? updateStepExecutionMode : undefined}
        onEdgeClick={(edgeId) => {
          setSelectedNodeIds(new Set());
          setSelectedWafers([]);
          setSelectedEdgeId(canEdit ? edgeId : null);
        }}
      />
      {archiveRestoreDrag?.hasMoved ? (
        <div
          aria-hidden
          className="flow-archive-restore-preview"
          style={{ left: archiveRestoreDrag.clientX + 12, top: archiveRestoreDrag.clientY + 12 }}
        >
          {archiveRestoreDrag.item.dieLabel ?? archiveRestoreDrag.item.waferCode}
        </div>
      ) : null}
      <ProcessArchiveDock
        archiveItems={archiveItemsState}
        canEdit={canEdit}
        dockRef={archiveDockRef}
        isBusy={isWaferMutationPending}
        isDropActive={isArchiveDropActive}
        isDropEligible={isArchiveDropEligible}
        isOpen={isArchiveOpen}
        isReceived={archiveDockReceived}
        statusMessage={archiveMessage}
        steps={displayNodes}
        onBeginRestoreDrag={beginArchiveRestoreDrag}
        onClose={() => setIsArchiveOpen(false)}
        onRestoreToStep={restoreArchiveItem}
        onToggle={() => setIsArchiveOpen((current) => !current)}
      />
    </section>
  );
}
