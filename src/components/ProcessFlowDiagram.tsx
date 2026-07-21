"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ClipboardEvent, CSSProperties, MouseEvent, PointerEvent } from "react";
import {
  getBoundedPinchAccumulatorScale,
  getNestedWaferTouchOwner,
  getPanScrollPosition,
  getStableZoomAnchor,
  getTouchCentroid,
  getTouchDistance,
  getTouchGestureOwner,
  getWheelZoomTargetScale,
  getZoomScrollPosition,
  isTouchTapWithinThreshold,
  type TouchPoint
} from "@/components/process-flow/gesture";
import { useRouter } from "next/navigation";
import { PendingNoteAttachments } from "@/components/notes/PendingNoteAttachments";
import { getClipboardImageFiles } from "@/features/measurements/clipboardImages";
import {
  getNoteAttachmentMergeError,
  mergeNoteAttachmentFiles,
  prepareNoteAttachmentFiles
} from "@/features/measurements/noteAttachmentDraft";
import {
  persistWaferStepNoteAttachments,
  persistWaferStepNoteAttachmentsBatch
} from "@/features/measurements/noteAttachmentUpload";
import {
  getNextGreekWaferCode,
  getWaferCodeValidationError,
  normalizeWaferCode
} from "@/features/process-flows/waferNaming";
import type { Json, ProcessStepNodeType, ProcessStepTransitionType } from "@/types/database";
import { readDeletedWaferIds } from "@/features/process-flows/waferDeletion";
import { ProcessFlowCanvas } from "./process-flow/ProcessFlowCanvas";
import { ProcessFlowMutationStatus } from "./process-flow/ProcessFlowMutationStatus";
import { ProcessArchiveDock } from "./process-flow/ProcessArchiveDock";
import { ProcessFlowToolbar } from "./process-flow/ProcessFlowToolbar";
import {
  groupPendingStepParameterEntries,
  mergePendingStepParameterEntries,
  settlePendingStepParameterEntries,
  StepParameterEntryDialog,
  type PendingStepParameterEntry
} from "./process-flow/StepParameterEntryDialog";
import {
  StepTemplateDialog,
  type PreparedStepTemplate,
  type StepTemplateDialogDraft
} from "./process-flow/StepTemplateDialog";
import { WaferCreateDialog, type WaferCreateDraft } from "./process-flow/WaferCreateDialog";
import { useProcessFlowMutationQueue } from "./process-flow/useProcessFlowMutationQueue";
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
  captureProcessFlowViewport,
  getProcessFlowViewportScrollPosition,
  readProcessFlowViewport,
  rememberProcessFlowViewport,
  writeProcessFlowViewport,
  type ProcessFlowViewportSnapshot
} from "./process-flow/processFlowViewport";
import {
  getExpectedCanvasPosition,
  getStableLayoutCenter,
  hasCanvasPositionChanged,
  resolveCanvasPosition,
  targetsSameCanvasPosition
} from "./process-flow/positionPersistence";
import {
  canMoveSelectedProcessStep,
  canMoveSelectedWafer,
  getProcessMoveActionNote,
  getStepDragCaptureTarget,
  getWaferDetailsHref,
  getWaferDetailsPrefetchHref,
  getWaferDragCaptureTarget,
  hasCrossedWaferDragThreshold,
  shouldEndWaferDragFromFrameEvent,
  shouldCommitWaferDrop
} from "./process-flow/interactions";
import {
  getAvailableWaferMoveTargets,
  getSelectedLinkedStepEdge
} from "./process-flow/mobileActions";
import {
  ProcessFlowSelectionInspector,
  type ProcessFlowInspectorItem
} from "./process-flow/ProcessFlowSelectionInspector";
import {
  clampScale,
  getWaferChipLabel,
  isTextInputTarget
} from "./process-flow/labels";
import { applyGraphDisplayOrder, autoLayoutNodes } from "./process-flow/layout";
import { getInitialGraph } from "./process-flow/graphSeed";
import { useVisualViewportBottomInset } from "./process-flow/useVisualViewportBottomInset";
import {
  canMoveToProcessStep,
  canReviewerRouteCheckpoint,
  canSubmitWaferCheckpoint,
  getReviewerRouteDecision
} from "./process-flow/checkpointPhase";
import { reconcileCreatedWaferPin } from "./process-flow/waferCreation";
import type {
  CheckpointReviewerOption,
  ConnectionDraft,
  DiagramStep,
  DiagramTransition,
  FlowEdge,
  FlowNode,
  GraphViewportFit,
  NodeDrag,
  PanePoint,
  PendingWaferMove,
  ProcessArchiveItem,
  ProcessFlowActions,
  ProcessFlowMutationRequest,
  PersistedStepPayload,
  RoleMenu,
  ScenePoint,
  SelectionBox,
  SelectionRect,
  SnapGuide,
  WaferDrag,
  WaferPin,
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
  creationDraft: PendingStepTemplateDialog;
  edgeToSplit: FlowEdge | null;
  edgeToSplitPriority: number;
  splitTransitionIds: string[];
};

type PendingStepTemplateDialog = StepTemplateDialogDraft & {
  stepId?: string;
  expectedRevision?: number;
  canvasX?: number;
  canvasY?: number;
  edgeToSplit?: FlowEdge | null;
};

type QueuedPositionUpdate = {
  canvasX: number;
  canvasY: number;
  expectedCanvasX: number;
  expectedCanvasY: number;
};

type SelectedFlowWafer = {
  assignmentId: string;
  nodeId: string;
  label: string;
  isDie: boolean;
};

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
  actions,
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
  actions?: ProcessFlowActions;
  canEdit?: boolean;
  reviewerOptions?: CheckpointReviewerOption[];
  currentUserId?: string;
  currentUserName?: string;
}) {
  const {
    createStep: onCreateStep,
    createWafer: onCreateWaferAtProcessStart,
    updatePositions: onUpdateStepPositions,
    updateName: onUpdateStepName,
    updateStepTemplate: onUpdateStepTemplate,
    updateExecutionMode: onUpdateStepExecutionMode,
    createTransition: onCreateTransition,
    deleteSteps: onDeleteSteps,
    deleteTransitions: onDeleteTransitions,
    deleteWafer: onDeleteWafer,
    archiveWafers: onArchiveWafers,
    restoreWafer: onRestoreArchivedWafer,
    submitCheckpoint: onSubmitCheckpoint,
    routeCheckpoint: onRouteCheckpoint,
    moveApprovedWafer: onMoveApprovedWafer,
    undoHistory: onUndoDieProcessHistory,
    saveParameters: onSaveStepParameters,
    saveParameterRecordsBatch: onSaveStepParametersBatch,
    persistMutationsBatch: onPersistMutationsBatch,
    updateReviewer: onUpdateStepReviewer
  } = actions ?? {};

  const router = useRouter();
  const [scale, setScale] = useState(1);
  const [viewportRestoreToken, setViewportRestoreToken] = useState(0);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [pendingConnectionStart, setPendingConnectionStart] = useState<ConnectionDraft | null>(null);
  const [nodeDrag, setNodeDrag] = useState<NodeDrag | null>(null);
  // Native iPhone moves can arrive before React commits the pointer-down render.
  // Keep ownership and latest positions synchronous for both node and frame routes.
  const nodeDragRef = useRef<NodeDrag | null>(null);
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
  const keyboardInset = useVisualViewportBottomInset();
  const [pendingStepParameterEntries, setPendingStepParameterEntries] = useState<PendingStepParameterEntry[]>([]);
  const [waferCreateDraft, setWaferCreateDraft] = useState<WaferCreateDraft | null>(null);
  const [waferCreateError, setWaferCreateError] = useState<string | null>(null);
  const [stepTemplateDraft, setStepTemplateDraft] = useState<PendingStepTemplateDialog | null>(null);
  const [stepTemplateError, setStepTemplateError] = useState<string | null>(null);
  const stepTemplateRestoreFocusRef = useRef<HTMLElement | SVGElement | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [roleMenu, setRoleMenu] = useState<RoleMenu | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedWafers, setSelectedWafers] = useState<SelectedFlowWafer[]>([]);
  const [openingWaferDetailsLabel, setOpeningWaferDetailsLabel] = useState<string | null>(null);
  const [waferDetailsFullPrefetchHref, setWaferDetailsFullPrefetchHref] = useState<string | null>(null);
  const [moveMessage, setMoveMessage] = useState<string | null>(null);
  const mutationQueue = useProcessFlowMutationQueue();
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeLabel, setEditingNodeLabel] = useState("");
  const editingInputRef = useRef<HTMLInputElement | null>(null);
  const [, startMoveTransition] = useTransition();
  const [isGraphPending, startGraphTransition] = useTransition();
  const [isStepTemplatePending, startStepTemplateTransition] = useTransition();
  const [isWaferMutationPending, startWaferMutationTransition] = useTransition();
  const scaleRef = useRef(1);
  const pointerPinchRef = useRef({ active: false, lastDistance: 1, rawScale: 1 });
  const touchPointersRef = useRef<Map<number, TouchPoint>>(new Map());
  const touchPanRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startScrollLeft: number;
    startScrollTop: number;
    hasMoved: boolean;
  } | null>(null);
  const touchItemOwnerRef = useRef<number | null>(null);
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
  const pendingTouchStepWaferRef = useRef<{
    nodeId: string;
    assignmentId: string;
    pointerId: number;
  } | null>(null);
  const pendingZoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const pendingGraphFitRef = useRef<GraphViewportFit | null>(null);
  const pendingStepCreateRef = useRef<Map<string, QueuedStepCreate>>(new Map());
  const pendingTransitionCreateRef = useRef<Map<string, QueuedTransition>>(new Map());
  const pendingPositionUpdateRef = useRef<Map<string, QueuedPositionUpdate>>(new Map());
  const inFlightPositionUpdateRef = useRef<Map<string, QueuedPositionUpdate>>(new Map());
  const protectedPositionUpdateRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const positionFlushInFlightRef = useRef(false);
  const pendingNameUpdateRef = useRef<Map<string, { name: string; expectedName: string }>>(new Map());
  const pendingWaferDeleteIdsRef = useRef<Set<string>>(new Set());
  const prefetchedWaferDetailsRef = useRef<Set<string>>(new Set());
  const selectionParameterDirtyRef = useRef(false);
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
  type TimerHandle = NodeJS.Timeout | number | null;
  const pendingStepCreateTimerRef = useRef<TimerHandle>(null);
  const pendingTransitionCreateTimerRef = useRef<TimerHandle>(null);
  const pendingPositionTimerRef = useRef<TimerHandle>(null);
  const pendingNameTimerRef = useRef<TimerHandle>(null);
  const fallbackRefreshTimerRef = useRef<TimerHandle>(null);
  const viewportPersistTimerRef = useRef<TimerHandle>(null);
  const pendingViewportRestoreRef = useRef<ProcessFlowViewportSnapshot | null>(null);
  const viewportReadyProcessIdRef = useRef<string | null>(null);
  const lastViewportSnapshotRef = useRef<{
    processId: string;
    snapshot: ProcessFlowViewportSnapshot;
  } | null>(null);
  const flushPendingTransitionCreatesRef = useRef<(() => Promise<void>) | null>(null);
  const flushPendingPositionUpdatesRef = useRef<(() => Promise<void>) | null>(null);
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
  const flushProcessFlowViewport = useCallback((targetFrame?: HTMLDivElement | null) => {
    if (viewportPersistTimerRef.current) {
      window.clearTimeout(viewportPersistTimerRef.current);
      viewportPersistTimerRef.current = null;
    }

    const frame = targetFrame ?? frameRef.current;
    if (!processTemplateId || !frame) return;
    const latestSnapshot = lastViewportSnapshotRef.current?.processId === processTemplateId
      ? lastViewportSnapshotRef.current.snapshot
      : captureProcessFlowViewport({
          scale: scaleRef.current,
          scrollLeft: frame.scrollLeft,
          scrollTop: frame.scrollTop,
          clientWidth: frame.clientWidth,
          clientHeight: frame.clientHeight
        });
    writeProcessFlowViewport(
      window.localStorage,
      processTemplateId,
      latestSnapshot
    );
  }, [processTemplateId]);
  const scheduleProcessFlowViewportPersist = useCallback(() => {
    const frame = frameRef.current;
    if (!processTemplateId || !frame || viewportReadyProcessIdRef.current !== processTemplateId) return;
    lastViewportSnapshotRef.current = {
      processId: processTemplateId,
      snapshot: captureProcessFlowViewport({
        scale: scaleRef.current,
        scrollLeft: frame.scrollLeft,
        scrollTop: frame.scrollTop,
        clientWidth: frame.clientWidth,
        clientHeight: frame.clientHeight
      })
    };
    rememberProcessFlowViewport(
      processTemplateId,
      lastViewportSnapshotRef.current.snapshot
    );
    if (viewportPersistTimerRef.current) {
      window.clearTimeout(viewportPersistTimerRef.current);
    }
    viewportPersistTimerRef.current = window.setTimeout(() => {
      viewportPersistTimerRef.current = null;
      flushProcessFlowViewport();
    }, 160);
  }, [flushProcessFlowViewport, processTemplateId]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !processTemplateId) return;

    const handleScroll = () => scheduleProcessFlowViewportPersist();
    const handlePageHide = () => flushProcessFlowViewport();
    frame.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      frame.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pagehide", handlePageHide);
      flushProcessFlowViewport(frame);
    };
  }, [flushProcessFlowViewport, processTemplateId, scheduleProcessFlowViewportPersist]);

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
  const selectedWaferSourceNode = selectedWafer ? nodeById.get(selectedWafer.nodeId) ?? null : null;
  const mobileWaferMoveTargets = useMemo(() => {
    if (!canEdit || !selectedWafer || !selectedWaferPin || !selectedWaferSourceNode ||
      activeSelectedWafers.some((selection) => selection.nodeId !== selectedWafer.nodeId)) {
      return [];
    }
    return getAvailableWaferMoveTargets(
      displayNodes,
      edges,
      selectedWafer.nodeId,
      selectedWaferPin.anytimeReturnStepId
    ).map((node) => ({ id: node.id, label: node.label }));
  }, [
    activeSelectedWafers,
    canEdit,
    displayNodes,
    edges,
    selectedWafer,
    selectedWaferPin,
    selectedWaferSourceNode
  ]);
  const selectedWaferAssignmentIds = useMemo(
    () => new Set(activeSelectedWafers.map((wafer) => wafer.assignmentId)),
    [activeSelectedWafers]
  );
  const selectionInspectorItems = useMemo(() => activeSelectedWafers.flatMap((selection) => {
    const node = nodeById.get(selection.nodeId);
    const pin = node?.wafers.find((wafer) => wafer.assignmentId === selection.assignmentId);
    if (!node || !pin) return [];
    return [{
      assignmentId: selection.assignmentId,
      waferId: pin.waferId,
      projectId: pin.projectId,
      processTemplateId,
      stepId: node.id,
      stepName: node.label,
      stepExecutionId: pin.currentStepExecutionId,
      parametersSchema: node.parametersSchema,
      waferCode: pin.waferCode,
      dieLabel: pin.dieLabel,
      label: selection.label,
      isDie: selection.isDie,
      status: pin.currentStepStatus,
      handlerName: pin.currentHandlerName,
      latestNote: pin.latestStepAttemptNotes,
      syncState: mutationQueue.syncStateByAssignmentId.get(selection.assignmentId),
      canSubmitCheckpoint: Boolean(
        canEdit &&
        onSubmitCheckpoint &&
        node.requiredReviewerId &&
        canSubmitWaferCheckpoint(pin)
      )
    } satisfies ProcessFlowInspectorItem];
  }), [
    activeSelectedWafers,
    canEdit,
    mutationQueue.syncStateByAssignmentId,
    nodeById,
    onSubmitCheckpoint,
    processTemplateId
  ]);
  const selectedLinkedStepEdge = useMemo(
    () => getSelectedLinkedStepEdge(edges, selectedNodeIds),
    [edges, selectedNodeIds]
  );
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
      Boolean(onSubmitCheckpoint) && draggedWafers.every(canSubmitWaferCheckpoint);
    const canMove = (target.id !== source.id || drag.x < source.x + source.width / 2) &&
      draggedWafers.every((wafer) =>
        (target.id !== source.id && Boolean(onMoveApprovedWafer) && canMoveToProcessStep({
          canCorrectCheckpointRoute: wafer.canCorrectCheckpointRoute,
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
    if (fallbackRefreshTimerRef.current) {
      window.clearTimeout(fallbackRefreshTimerRef.current);
      fallbackRefreshTimerRef.current = null;
    }
  }, []);

  const scheduleBackgroundRefresh = useCallback(() => {
    if (fallbackRefreshTimerRef.current) {
      window.clearTimeout(fallbackRefreshTimerRef.current);
    }
    fallbackRefreshTimerRef.current = window.setTimeout(() => {
      fallbackRefreshTimerRef.current = null;
      router.refresh();
    }, 2000);
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
              parametersSchema: persistedStep.parameters_schema,
              revision: persistedStep.revision,
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

    if (nodeDragRef.current?.nodeId === temporaryStepId) {
      nodeDragRef.current = { ...nodeDragRef.current, nodeId: persistedStep.id };
    }
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
    moveQueuedValues(temporaryStepId, persistedStep.id, protectedPositionUpdateRef.current);
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
    inFlightPositionUpdateRef.current.delete(stepId);
    protectedPositionUpdateRef.current.delete(stepId);
    pendingNameUpdateRef.current.delete(stepId);
  };

  const clearQueuedStepMaps = useCallback(() => {
    pendingStepCreateRef.current.clear();
    pendingTransitionCreateRef.current.clear();
    pendingPositionUpdateRef.current.clear();
    inFlightPositionUpdateRef.current.clear();
    protectedPositionUpdateRef.current.clear();
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

  const schedulePositionFlush = useCallback((delay: number) => {
    schedulePending(
      pendingPositionTimerRef,
      async () => {
        await flushPendingPositionUpdatesRef.current?.();
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
      inFlightPositionUpdateRef.current.clear();
      protectedPositionUpdateRef.current.clear();
      return;
    }

    if (positionFlushInFlightRef.current) {
      return;
    }

    const entries = [...pendingPositionUpdateRef.current.entries()].filter(([stepId]) => !isOptimisticStep(stepId));
    if (entries.length === 0) {
      return;
    }

    for (const [stepId, position] of entries) {
      if (pendingPositionUpdateRef.current.get(stepId) === position) {
        pendingPositionUpdateRef.current.delete(stepId);
      }
      inFlightPositionUpdateRef.current.set(stepId, position);
    }

    positionFlushInFlightRef.current = true;
    try {
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
        for (const [stepId, position] of entries) {
          const queuedPosition = pendingPositionUpdateRef.current.get(stepId);
          if (
            queuedPosition?.expectedCanvasX === position.canvasX &&
            queuedPosition.expectedCanvasY === position.canvasY
          ) {
            pendingPositionUpdateRef.current.delete(stepId);
            if (targetsSameCanvasPosition(protectedPositionUpdateRef.current.get(stepId), {
              x: queuedPosition.canvasX,
              y: queuedPosition.canvasY
            })) {
              protectedPositionUpdateRef.current.delete(stepId);
            }
          }
          const protectedTarget = protectedPositionUpdateRef.current.get(stepId);
          if (targetsSameCanvasPosition(protectedTarget, {
            x: position.canvasX,
            y: position.canvasY
          })) {
            protectedPositionUpdateRef.current.delete(stepId);
          }
        }
        setMoveMessage(result.error);
      }
    } finally {
      for (const [stepId, position] of entries) {
        if (inFlightPositionUpdateRef.current.get(stepId) === position) {
          inFlightPositionUpdateRef.current.delete(stepId);
        }
      }
      positionFlushInFlightRef.current = false;
      if (pendingPositionUpdateRef.current.size > 0) {
        schedulePositionFlush(0);
      }
    }
  }, [isOptimisticStep, onUpdateStepPositions, schedulePositionFlush]);

  useEffect(() => {
    flushPendingPositionUpdatesRef.current = flushPendingPositionUpdates;
  }, [flushPendingPositionUpdates]);

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
        canvasY,
        parametersSchema: payload.fallbackNode.parametersSchema as Record<string, Json | undefined>
      });

      if (!result.ok) {
        setMoveMessage(result.error);
        setNodes((currentNodes) => currentNodes.filter((node) => node.id !== temporaryStepId));
        setEdges((currentEdges) => normalizeFlowEdges([
          ...currentEdges.filter((edge) => edge.from !== temporaryStepId && edge.to !== temporaryStepId),
          ...(payload.edgeToSplit ? [payload.edgeToSplit] : [])
        ]));
        if (payload.edgeToSplit?.id.startsWith(EDGE_ID_PREFIX)) {
          pendingTransitionCreateRef.current.set(payload.edgeToSplit.id, {
            id: payload.edgeToSplit.id,
            fromStepId: payload.edgeToSplit.from,
            toStepId: payload.edgeToSplit.to,
            edgeType: payload.edgeToSplit.kind,
            priority: payload.edgeToSplitPriority
          });
        }
        clearQueuedStep(temporaryStepId);
        setStepTemplateDraft(payload.creationDraft);
        setStepTemplateError(result.error);
        if (editingNodeId === temporaryStepId) {
          setEditingNode(null);
        }
        continue;
      }

      replaceOptimisticStepId(temporaryStepId, result.data);
      if (payload.edgeToSplit && !payload.edgeToSplit.id.startsWith(EDGE_ID_PREFIX) && onDeleteTransitions) {
        const deleteResult = await onDeleteTransitions({ transitionIds: [payload.edgeToSplit.id] });
        if (!deleteResult.ok && !isAlreadyDeletedTransitionError(deleteResult.error)) {
          for (const transitionId of payload.splitTransitionIds) {
            pendingTransitionCreateRef.current.delete(transitionId);
          }
          setEdges((currentEdges) => normalizeFlowEdges([
            ...currentEdges.filter((edge) => !payload.splitTransitionIds.includes(edge.id)),
            payload.edgeToSplit!
          ]));
          setMoveMessage(`Created ${result.data.name}, but the existing transition could not be split. ${deleteResult.error}`);
        }
      }
    }

    if (pendingTransitionCreateRef.current.size > 0) {
      scheduleTransitionFlush(0);
    }

    if (pendingPositionUpdateRef.current.size > 0) {
      schedulePositionFlush(0);
    }

    if (pendingNameUpdateRef.current.size > 0) {
      schedulePending(pendingNameTimerRef, flushPendingNameUpdates, 0);
    }
  }, [
    editingNodeId,
    flushPendingNameUpdates,
    getLatestNode,
    onCreateStep,
    onDeleteTransitions,
    processTemplateId,
    replaceOptimisticStepId,
    schedulePending,
    schedulePositionFlush,
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
    const expectedPosition = getExpectedCanvasPosition({
      queued: pendingPositionUpdateRef.current.get(stepId),
      inFlight: inFlightPositionUpdateRef.current.get(stepId),
      server: {
        x: persistedNode?.x ?? canvasX,
        y: persistedNode?.y ?? canvasY
      }
    });
    pendingPositionUpdateRef.current.set(stepId, {
      canvasX,
      canvasY,
      expectedCanvasX: expectedPosition.x,
      expectedCanvasY: expectedPosition.y
    });
    protectedPositionUpdateRef.current.set(stepId, { x: canvasX, y: canvasY });
    if (isOptimisticStep(stepId)) {
      return;
    }

    schedulePositionFlush(POSITION_DEBOUNCE_MS);
  }, [isOptimisticStep, schedulePositionFlush, serverGraph.nodes]);

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
  }, [canEdit, clearEditingNode, nodeById, queueNodeNamePersist]);

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

    if (!frame || !anchor) {
      setScale(boundedScale);
      scaleRef.current = boundedScale;
      return;
    }

    const nextZoomAnchor = stableSceneAnchor
      ? { ...stableSceneAnchor, paneX: anchor.paneX, paneY: anchor.paneY }
      : getStableZoomAnchor(
          currentScale,
          frame.scrollLeft,
          frame.scrollTop,
          anchor,
          pendingZoomAnchorRef.current
        );

    if (boundedScale === currentScale) {
      const scrollPosition = getZoomScrollPosition(nextZoomAnchor, boundedScale);
      frame.scrollLeft = scrollPosition.scrollLeft;
      frame.scrollTop = scrollPosition.scrollTop;
      return;
    }

    pendingZoomAnchorRef.current = nextZoomAnchor;

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
    scheduleProcessFlowViewportPersist();
  }, [scheduleProcessFlowViewportPersist]);

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

    const targetCenter = getStableLayoutCenter(displayNodes, getCanvasSceneCenter());
    const nextNodes = autoLayoutNodes(displayNodes, edges, targetCenter);
    const currentNodeById = new Map(displayNodes.map((node) => [node.id, node]));
    const changedNodes = nextNodes.filter((node) =>
      hasCanvasPositionChanged(currentNodeById.get(node.id), node)
    );
    setNodes(nextNodes);
    setSelectedNodeIds(new Set());
    setRoleMenu(null);
    centerView(nextNodes, targetCenter);
    changedNodes.forEach((node) => {
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

        setNodes((currentNodes) =>
          currentNodes.map((node) =>
            node.id === startNode.id
              ? {
                  ...node,
                  wafers: node.wafers.map((wafer) =>
                    wafer.assignmentId === temporaryAssignmentId
                      ? reconcileCreatedWaferPin(wafer, result.data)
                      : wafer
                  )
                }
              : node
          )
        );

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

  const confirmDiscardSelectionParameters = useCallback((message: string) => {
    if (!selectionParameterDirtyRef.current) return true;
    if (!window.confirm(message)) return false;
    selectionParameterDirtyRef.current = false;
    return true;
  }, []);

  const selectWafer = useCallback((nodeId: string, wafer: WaferPin) => {
    if (waferDragRef.current?.hasMoved) {
      return;
    }
    if (!confirmDiscardSelectionParameters("Discard the unsaved parameter changes before changing this selection?")) {
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
  }, [confirmDiscardSelectionParameters]);

  const clearWaferSelectionFromInspector = useCallback(() => {
    if (!confirmDiscardSelectionParameters("Discard the unsaved parameter changes and clear this selection?")) {
      return;
    }
    setSelectedWafers([]);
  }, [confirmDiscardSelectionParameters]);

  const removeWaferFromInspector = useCallback((assignmentId: string) => {
    if (!confirmDiscardSelectionParameters("Discard the unsaved parameter changes before changing this selection?")) {
      return;
    }
    setSelectedWafers((current) => current.filter((selection) => selection.assignmentId !== assignmentId));
  }, [confirmDiscardSelectionParameters]);

  const activateWaferInInspector = useCallback((assignmentId: string) => {
    setSelectedWafers((current) => {
      const active = current.find((selection) => selection.assignmentId === assignmentId);
      return active
        ? [...current.filter((selection) => selection.assignmentId !== assignmentId), active]
        : current;
    });
  }, []);

  const handleSelectionParameterDirtyChange = useCallback((isDirty: boolean) => {
    selectionParameterDirtyRef.current = isDirty;
  }, []);

  const prefetchWaferDetails = useCallback((wafer: WaferPin) => {
    if (!wafer.waferId) return;
    const href = getWaferDetailsPrefetchHref({
      processTemplateId,
      waferId: wafer.waferId,
      dieLabel: wafer.dieLabel,
      detailTab: "history"
    });
    if (!href || prefetchedWaferDetailsRef.current.has(href)) {
      return;
    }

    prefetchedWaferDetailsRef.current.add(href);
    setWaferDetailsFullPrefetchHref(href);
  }, [processTemplateId]);

  const openWaferDetails = useCallback((wafer: WaferPin) => {
    const href = getWaferDetailsHref({
      processTemplateId,
      waferId: wafer.waferId,
      dieLabel: wafer.dieLabel,
      detailTab: "history"
    });
    if (!href) {
      return;
    }

    setOpeningWaferDetailsLabel(getWaferChipLabel(wafer));
    router.push(href);
  }, [processTemplateId, router]);

  const openStepParameters = useCallback((stepId: string) => {
    const node = getLatestNode(stepId);
    if (!node) return;
    const activeElement = document.activeElement;
    stepTemplateRestoreFocusRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
      ? activeElement
      : document.querySelector<SVGElement>(`[data-node-id="${CSS.escape(stepId)}"]`);
    setRoleMenu(null);
    setStepTemplateError(null);
    setStepTemplateDraft({
      mode: "edit",
      name: node.label,
      processArea: node.subLabel,
      parametersSchema: node.parametersSchema,
      canEdit: Boolean(canEdit && onUpdateStepTemplate && !node.isOptimistic),
      stepId: node.id,
      expectedRevision: node.revision
    });
  }, [canEdit, getLatestNode, onUpdateStepTemplate]);

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

  const mergeServerGraphIntoLocal = useCallback((graph: { nodes: FlowNode[]; edges: FlowEdge[] }) => {
    const serverNodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const serverEdgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));

    setNodes((currentNodes) => {
      const nextNodes: FlowNode[] = [];
      const seenNodeIds = new Set<string>();

      for (const node of currentNodes) {
        const serverNode = serverNodeById.get(node.id);

        if (!serverNode) {
          if (node.isOptimistic || pendingStepCreateRef.current.has(node.id)) {
            nextNodes.push(node);
          }
          continue;
        }

        seenNodeIds.add(node.id);
        const hasPendingName = pendingNameUpdateRef.current.has(node.id) || editingNodeId === node.id;
        const protectedTarget = protectedPositionUpdateRef.current.get(node.id);
        const resolvedPosition = resolveCanvasPosition({
          local: node,
          server: serverNode,
          protectedTarget
        });
        if (resolvedPosition.settled) {
          protectedPositionUpdateRef.current.delete(node.id);
        }
        nextNodes.push({
          ...serverNode,
          label: hasPendingName ? node.label : serverNode.label,
          x: resolvedPosition.position.x,
          y: resolvedPosition.position.y,
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
        if (!serverEdge) continue;

        seenServerEdgeIds.add(edge.id);
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

    setNodes(serverGraph.nodes);
    setEdges(normalizeFlowEdges(serverGraph.edges));
    setConnectionDraft(null);
    setPendingConnectionStart(null);
    nodeDragRef.current = null;
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
    const savedViewport = processTemplateId
      ? readProcessFlowViewport(window.localStorage, processTemplateId)
      : null;
    pendingViewportRestoreRef.current = savedViewport;
    viewportReadyProcessIdRef.current = processTemplateId ?? null;
    if (savedViewport) {
      lastViewportSnapshotRef.current = {
        processId: processTemplateId!,
        snapshot: savedViewport
      };
      scaleRef.current = savedViewport.scale;
      window.queueMicrotask(() => {
        setScale(savedViewport.scale);
        setViewportRestoreToken((current) => current + 1);
      });
    } else {
      centerView(serverGraph.nodes);
    }
  }, [centerView, clearQueuedStepMaps, clearTimers, graphSeedKey, mergeServerGraphIntoLocal, processTemplateId, serverGraph]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const savedViewport = pendingViewportRestoreRef.current;
    if (!frame || !savedViewport || scale !== savedViewport.scale) return;

    const scrollPosition = getProcessFlowViewportScrollPosition({
      snapshot: savedViewport,
      clientWidth: frame.clientWidth,
      clientHeight: frame.clientHeight,
      sceneWidth: sceneBounds.width,
      sceneHeight: sceneBounds.height
    });
    frame.scrollLeft = scrollPosition.scrollLeft;
    frame.scrollTop = scrollPosition.scrollTop;
    pendingViewportRestoreRef.current = null;
    scheduleProcessFlowViewportPersist();
  }, [scale, scaledHeight, scaledWidth, sceneBounds.height, sceneBounds.width, scheduleProcessFlowViewportPersist, viewportRestoreToken]);

  useEffect(() => {
    if (!pendingViewportRestoreRef.current) {
      scheduleProcessFlowViewportPersist();
    }
  }, [scale, scheduleProcessFlowViewportPersist]);

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

    if ((!isMiddleMousePan && !isModifiedLeftPan) || connectionDraft || nodeDragRef.current || waferDrag) {
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
      if (!pointerPinchRef.current.active) {
        pinchSceneAnchorRef.current = null;
      }
    });
  }, [applyScaleAtAnchor]);

  const cancelItemDragForPinch = () => {
    const activeNodeDrag = nodeDragRef.current;
    if (activeNodeDrag) {
      const originalPositions = new Map(
        activeNodeDrag.nodeStartPositions.map((position) => [position.nodeId, position])
      );
      setNodes((currentNodes) => currentNodes.map((node) => {
        const original = originalPositions.get(node.id);
        return original ? { ...node, x: original.x, y: original.y } : node;
      }));
      nodeDragRef.current = null;
      setNodeDrag(null);
      setSnapGuides([]);
    }

    if (waferDragRef.current) {
      waferDragRef.current = null;
      waferDropTargetRef.current = null;
      waferDragRenderQueueRef.current?.clear();
      setWaferDrag(null);
      setWaferDropTarget(null);
      setIsArchiveDropActive(false);
      setIsArchiveDropEligible(false);
    }

    pendingTouchNodeRef.current = null;
    pendingTouchStepWaferRef.current = null;
    touchItemOwnerRef.current = null;
  };

  const beginTouchGesture = (event: PointerEvent<HTMLDivElement>) => {
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
    if (pointers.length === 1) {
      touchPanRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startScrollLeft: frame.scrollLeft,
        startScrollTop: frame.scrollTop,
        hasMoved: false
      };
      event.preventDefault();
      return;
    }

    const distance = getTouchDistance(pointers[0][1], pointers[1][1]);
    if (distance <= 0) {
      return;
    }

    cancelItemDragForPinch();
    touchPanRef.current = null;

    pointerPinchRef.current = {
      active: true,
      lastDistance: distance,
      rawScale: scaleRef.current
    };
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

  const updateTouchGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !touchPointersRef.current.has(event.pointerId)) {
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

    const pinch = pointerPinchRef.current;
    const pointers = Array.from(touchPointersRef.current.values()).slice(0, 2);
    if (pinch.active && pointers.length >= 2) {
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
      return;
    }

    const pan = touchPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId || touchItemOwnerRef.current === event.pointerId) {
      return;
    }

    const hasMoved = pan.hasMoved || !isTouchTapWithinThreshold(
      pan.startClientX,
      pan.startClientY,
      event.clientX,
      event.clientY
    );
    if (hasMoved && !pan.hasMoved) {
      pendingTouchNodeRef.current = null;
      if (waferDragRef.current && !waferDragRef.current.canMove) {
        waferDragRef.current = null;
        waferDragRenderQueueRef.current?.clear();
      }
      setIsPanning(true);
    }

    touchPanRef.current = { ...pan, hasMoved };
    const scrollPosition = getPanScrollPosition({
      startScrollLeft: pan.startScrollLeft,
      startScrollTop: pan.startScrollTop,
      startClientX: pan.startClientX,
      startClientY: pan.startClientY,
      clientX: event.clientX,
      clientY: event.clientY
    });
    frame.scrollLeft = scrollPosition.scrollLeft;
    frame.scrollTop = scrollPosition.scrollTop;
    event.preventDefault();
    event.stopPropagation();
  };

  const endTouchGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !touchPointersRef.current.has(event.pointerId)) {
      return;
    }

    const frame = frameRef.current;
    const wasPinching = pointerPinchRef.current.active;
    const finishedPan = touchPanRef.current?.pointerId === event.pointerId
      ? touchPanRef.current
      : null;
    touchPointersRef.current.delete(event.pointerId);
    if (frame) {
      safelyReleasePointerCapture(frame, event.pointerId);
    }

    if (touchPointersRef.current.size < 2) {
      pointerPinchRef.current = { active: false, lastDistance: 1, rawScale: scaleRef.current };
      if (pinchAnimationFrameRef.current === null) {
        pinchSceneAnchorRef.current = null;
      }
    }

    if (finishedPan) {
      touchPanRef.current = null;
      setIsPanning(false);
    }
    if (touchItemOwnerRef.current === event.pointerId) {
      touchItemOwnerRef.current = null;
    }

    if (wasPinching || finishedPan?.hasMoved) {
      pendingTouchNodeRef.current = null;
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const updatePan = (event: PointerEvent<HTMLDivElement>) => {
    lastZoomPanePointRef.current = getPanePoint(event.clientX, event.clientY);
    if (event.pointerType === "touch") {
      if (waferDragRef.current?.canMove) {
        updateWaferDrag(event as unknown as PointerEvent<Element>);
      } else if (nodeDragRef.current) {
        updateNodeDrag(event as unknown as PointerEvent<SVGGElement>);
      }
      return;
    }

    if (waferDragRef.current) {
      updateWaferDrag(event as unknown as PointerEvent<Element>);
      return;
    }

    if (!isPanning || !panStateRef.current || connectionDraft || nodeDragRef.current || waferDrag) {
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
    if (event.pointerType === "touch" && nodeDragRef.current) {
      finishNodeDrag(event as unknown as PointerEvent<SVGGElement>);
      return;
    }

    if (waferDragRef.current) {
      if (shouldEndWaferDragFromFrameEvent(event.type)) {
        finishWaferDrag(event as unknown as PointerEvent<Element>);
      }
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

    const canvasX = Math.max(24, Math.round(point.x - NODE_WIDTH / 2));
    const canvasY = Math.max(24, Math.round(point.y - NODE_HEIGHT / 2));
    setRoleMenu(null);
    setSelectedWafers([]);
    setStepTemplateError(null);
    setStepTemplateDraft({
      mode: "create",
      name: "",
      processArea: "Process step",
      parametersSchema: { version: 1, fields: [] },
      canEdit: true,
      canvasX,
      canvasY,
      edgeToSplit
    });
  };

  const commitStepCreate = (
    draft: PendingStepTemplateDialog,
    template: PreparedStepTemplate
  ) => {
    const canvasX = draft.canvasX;
    const canvasY = draft.canvasY;
    if (canvasX === undefined || canvasY === undefined) return;
    const edgeToSplit = draft.edgeToSplit ?? null;
    const temporaryStepId = `${NODE_ID_PREFIX}${Math.random().toString(36).slice(2, 10)}`;
    const splitEdges = edgeToSplit ? splitEdgeWithNode(edgeToSplit, temporaryStepId) : [];
    const fallbackNode: FlowNode = {
      id: temporaryStepId,
      label: template.name,
      subLabel: template.processArea,
      wafers: [],
      x: canvasX,
      y: canvasY,
      width: NODE_WIDTH,
      height: getNodeHeightForWaferCount(0),
      role: "normal",
      executionMode: "main",
      order: displayNodes.length + 1,
      parametersSchema: template.parametersSchema,
      revision: 0,
      isOptimistic: true
    };

    setRoleMenu(null);
    setSelectedWafers([]);
    setStepTemplateDraft(null);
    setStepTemplateError(null);
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
    }
    setSelectedNodeIds(new Set([temporaryStepId]));
    setMoveMessage(edgeToSplit ? "Inserted step into transition locally." : "Added step locally.");
    queueStepPersist(temporaryStepId, {
      canvasX,
      canvasY,
      fallbackNode,
      stepArea: template.processArea,
      nodeType: "procedure",
      creationDraft: {
        ...draft,
        name: template.name,
        processArea: template.processArea,
        parametersSchema: template.parametersSchema
      },
      edgeToSplit,
      edgeToSplitPriority: edgeToSplit ? Math.max(0, edges.findIndex((edge) => edge.id === edgeToSplit.id)) * 10 : 0,
      splitTransitionIds: splitEdges.map((edge) => edge.id)
    });
  };

  const submitStepTemplate = (template: PreparedStepTemplate) => {
    const draft = stepTemplateDraft;
    if (!draft) return;
    if (draft.mode === "create") {
      commitStepCreate(draft, template);
      return;
    }
    if (!draft.stepId || draft.expectedRevision === undefined || !onUpdateStepTemplate) {
      setStepTemplateError("This step template is read-only.");
      return;
    }

    setStepTemplateError(null);
    startStepTemplateTransition(() => {
      void (async () => {
        const result = await onUpdateStepTemplate({
          stepId: draft.stepId!,
          expectedRevision: draft.expectedRevision!,
          parametersSchema: template.parametersSchema
        });
        if (!result.ok) {
          setStepTemplateError(result.error);
          return;
        }
        setNodes((currentNodes) => currentNodes.map((node) => node.id === result.data.id
          ? {
              ...node,
              parametersSchema: result.data.parameters_schema,
              revision: result.data.revision
            }
          : node));
        setStepTemplateDraft(null);
        setMoveMessage(`Saved ${result.data.name} template.`);
        scheduleBackgroundRefresh();
      })();
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
    const isSelected = canMoveSelectedProcessStep(selectedNodeIds.has(node.id));
    if (event.pointerType === "touch" && getTouchGestureOwner("step", isSelected) === "viewport") {
      pendingTouchNodeRef.current = {
        nodeId: node.id,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY
      };
      return;
    }

    if (!isSelected) {
      setRoleMenu(null);
      setSelectedWafers([]);
      setSelectedNodeIds(new Set([node.id]));
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

    const nextNodeDrag = {
      nodeId: node.id,
      pointerId: event.pointerId,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
      startX: node.x,
      startY: node.y,
      nodeStartPositions
    };
    nodeDragRef.current = nextNodeDrag;
    setNodeDrag(nextNodeDrag);
    if (event.pointerType === "touch") {
      touchItemOwnerRef.current = event.pointerId;
    }
    if (getStepDragCaptureTarget(event.pointerType) === "source") {
      safelySetPointerCapture(event.currentTarget, event.pointerId);
    }
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

    const activeNodeDrag = nodeDragRef.current;
    if (!activeNodeDrag || activeNodeDrag.pointerId !== event.pointerId) {
      return;
    }
    if (event.pointerType === "touch") {
      event.stopPropagation();
    }

    const point = getScenePoint(event);
    const draggedNode = nodesRef.current.find((node) => node.id === activeNodeDrag.nodeId);
    if (!draggedNode) {
      setSnapGuides([]);
      return;
    }

    const unselectedNodes = nodesRef.current.filter((node) => (
      !activeNodeDrag.nodeStartPositions.some((position) => position.nodeId === node.id)
    ));
    const snapped = getSnappedNodePosition(
      draggedNode,
      Math.round(point.x - activeNodeDrag.offsetX),
      Math.round(point.y - activeNodeDrag.offsetY),
      unselectedNodes
    );
    const deltaX = snapped.x - activeNodeDrag.startX;
    const deltaY = snapped.y - activeNodeDrag.startY;
    const nextPositions = activeNodeDrag.nodeStartPositions.map((position) => ({
      nodeId: position.nodeId,
      x: Math.max(24, Math.round(position.x + deltaX)),
      y: Math.max(24, Math.round(position.y + deltaY))
    }));
    const draggedPositions = new Map(nextPositions.map((position) => [position.nodeId, position]));
    const applyDraggedPositions = (currentNodes: FlowNode[]) => currentNodes.map((node) => {
      const nextPosition = draggedPositions.get(node.id);
      return nextPosition ? { ...node, x: nextPosition.x, y: nextPosition.y } : node;
    });

    nodesRef.current = applyDraggedPositions(nodesRef.current);
    setNodes(applyDraggedPositions);
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

    const activeNodeDrag = nodeDragRef.current;
    if (!activeNodeDrag || activeNodeDrag.pointerId !== event.pointerId) {
      return;
    }

    safelyReleasePointerCapture(event.currentTarget, event.pointerId);
    if (touchItemOwnerRef.current === event.pointerId) {
      touchItemOwnerRef.current = null;
    }
    const finishedDrag = activeNodeDrag;
    nodeDragRef.current = null;
    setNodeDrag(null);
    setSnapGuides([]);

    const nodeStartPositions = new Map(finishedDrag.nodeStartPositions.map((position) => [position.nodeId, position]));
    const movedNodes = nodesRef.current.filter((node) => {
      const startPosition = nodeStartPositions.get(node.id);
      return startPosition && (node.x !== startPosition.x || node.y !== startPosition.y);
    });

    const pendingWaferTap = pendingTouchStepWaferRef.current?.pointerId === event.pointerId
      ? pendingTouchStepWaferRef.current
      : null;
    if (pendingWaferTap) {
      pendingTouchStepWaferRef.current = null;
    }

    if (movedNodes.length === 0) {
      if (event.type === "pointerup" && pendingWaferTap) {
        const wafer = nodeById.get(pendingWaferTap.nodeId)?.wafers.find(
          (candidate) => candidate.assignmentId === pendingWaferTap.assignmentId
        );
        if (wafer) {
          selectWafer(pendingWaferTap.nodeId, wafer);
        }
      }
      return;
    }

    movedNodes.forEach((node) => queueNodePositionPersist(node.id, node.x, node.y));
  };

  const beginWaferDrag = (event: PointerEvent<SVGGElement>, node: FlowNode, wafer: WaferPin) => {
    prefetchWaferDetails(wafer);
    if (event.pointerType === "touch" && pointerPinchRef.current.active) {
      return;
    }
    if (!canEdit || (!onSubmitCheckpoint && !onMoveApprovedWafer && !onRouteCheckpoint && !onArchiveWafers) || event.button !== 0 || mutationQueue.lockedAssignmentIds.has(wafer.assignmentId)) {
      return;
    }

    event.stopPropagation();
    waferDragRenderQueueRef.current?.clear();
    setIsArchiveDropActive(false);
    setIsArchiveDropEligible(false);
    setRoleMenu(null);
    setMoveMessage(null);

    const isSelectedForMove = activeSelectedWafers.some(
      (selection) => selection.assignmentId === wafer.assignmentId
    );
    if (event.pointerType === "touch" && getNestedWaferTouchOwner({
      isStepSelected: selectedNodeIds.has(node.id),
      isWaferSelected: isSelectedForMove
    }) === "step") {
      pendingTouchStepWaferRef.current = {
        nodeId: node.id,
        assignmentId: wafer.assignmentId,
        pointerId: event.pointerId
      };
      beginNodeDrag(event, node);
      return;
    }
    if (event.pointerType === "touch" && getTouchGestureOwner("wafer", isSelectedForMove) === "item") {
      touchItemOwnerRef.current = event.pointerId;
    }
    const draggedSelection = isSelectedForMove
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
      canMove: canMoveSelectedWafer(isSelectedForMove),
      hasMoved: false
    };
    waferDragRef.current = nextDrag;
    // iPhone Safari does not reliably retain capture on an SVG <g>. Capture
    // on the stable HTML frame before the first movement reaches the 10px
    // threshold, so the drag continues even after leaving the tiny chip.
    const captureTarget = getWaferDragCaptureTarget(event.pointerType) === "frame"
      ? frameRef.current
      : event.currentTarget;
    if (captureTarget) {
      safelySetPointerCapture(captureTarget, event.pointerId);
    }
  };

  const updateWaferDrag = (event: PointerEvent<Element>) => {
    const currentDrag = waferDragRef.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) {
      return;
    }

    event.stopPropagation();
    if (!currentDrag.canMove) {
      return;
    }
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

  const clearWaferDragState = () => {
    waferDragRef.current = null;
    waferDropTargetRef.current = null;
    waferDragRenderQueueRef.current?.clear();
    setWaferDrag(null);
    setWaferDropTarget(null);
    setIsArchiveDropActive(false);
    setIsArchiveDropEligible(false);
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
      setArchiveMessage("Only wafers and dies with a completed current step can be archived.");
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
    targetStepId: string,
    collectDetails = false
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
        canCorrectCheckpointRoute: wafer.canCorrectCheckpointRoute,
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
      batchId: crypto.randomUUID(),
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
    if (collectDetails) {
      setPendingWaferMove(move);
      return;
    }
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
    if (!eligible.length) {
      setMoveMessage("Only work on the Beginning side can be submitted for checkpoint review.");
      return;
    }
    if (eligible.some((wafer) => !wafer.currentStepExecutionId)) {
      setMoveMessage("This wafer is still being created. It will be ready in a moment.");
      return;
    }
    if (!eligible.every(canSubmitWaferCheckpoint)) {
      setMoveMessage("Only work on the Beginning side can be submitted for checkpoint review.");
      return;
    }
    setPendingWaferMove({
      kind: "submit",
      batchId: crypto.randomUUID(),
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
      if (event.type === "pointerup" && !finishedDrag.hasMoved) {
        const sourcePin = nodeById.get(finishedDrag.sourceStepId)?.wafers.find(
          (wafer) => wafer.assignmentId === finishedDrag.assignmentId
        );
        if (sourcePin) {
          selectWafer(finishedDrag.sourceStepId, sourcePin);
        }
      }
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

  const appendPendingWaferMoveFiles = async (files: readonly File[]) => {
    await prepareNoteAttachmentFiles(files);
    setPendingWaferMoveFiles((current) => {
      const merged = mergeNoteAttachmentFiles(current, files);
      setPendingWaferMoveFileError(getNoteAttachmentMergeError(merged));
      return merged.files;
    });
  };

  const pastePendingWaferMoveImages = (event: ClipboardEvent<HTMLElement>) => {
    const images = getClipboardImageFiles(event.clipboardData);
    if (!images.length) {
      return;
    }

    event.preventDefault();
    void appendPendingWaferMoveFiles(images);
  };

  const cancelPendingWaferMove = () => {
    if (pendingWaferMove?.wafers.some((wafer) => mutationQueue.lockedAssignmentIds.has(wafer.assignmentId))) {
      return;
    }

    setPendingWaferMove(null);
    setPendingWaferMoveNote("");
    setPendingWaferMoveFiles([]);
    setPendingWaferMoveFileError(null);
  };

  function submitPendingWaferMove(
    moveOverride?: PendingWaferMove,
    noteOverride?: string,
    filesOverride?: readonly File[]
  ) {
    const activeMove = moveOverride ?? pendingWaferMove;
    if (!activeMove || activeMove.wafers.some((wafer) => mutationQueue.lockedAssignmentIds.has(wafer.assignmentId)) || (
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
    const files = filesOverride ?? (moveOverride ? [] : pendingWaferMoveFiles);
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
    const parameterDraftId = `movement:${move.wafers.map((wafer) => wafer.mutationId).join(":")}`;
    const checkpointRouteSourceStepId = movingWafers.find(
      (wafer) => wafer.canCorrectCheckpointRoute
    )?.checkpointRouteSourceStepId;
    const routeSourceNode = checkpointRouteSourceStepId
      ? previousNodes.find((node) => node.id === checkpointRouteSourceStepId) ?? sourceNode
      : sourceNode;
    const destinationStatus = routeSourceNode && targetNode && getReviewerRouteDecision(
      routeSourceNode.order,
      targetNode.order,
      routeSourceNode.executionMode,
      targetNode.executionMode
    ) === "redo"
      ? "redo_required" as const
      : "queued" as const;

    if (move.kind === "move" && onSaveStepParameters && targetNode) {
      setPendingStepParameterEntries((current) => mergePendingStepParameterEntries(
        current,
        move.wafers.map((wafer) => ({
          assignmentId: wafer.assignmentId,
          draftId: parameterDraftId,
          movementMutationId: wafer.mutationId,
          waferLabel: wafer.waferLabel,
          stepId: move.targetStepId,
          stepName: move.targetLabel,
          parametersSchema: targetNode.parametersSchema,
          persistenceStatus: "persisting" as const
        }))
      ));
    }

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
    mutationQueue.upsert(move.wafers.map((wafer) => ({
      assignmentId: wafer.assignmentId,
      label: wafer.waferLabel,
      mutationId: wafer.mutationId,
      state: "saving_move" as const
    })));

    startMoveTransition(() => {
      void (async () => {
        const mutationRequests = move.wafers.map((waferMove): ProcessFlowMutationRequest => {
          const movingWafer = movingWafersByAssignmentId.get(waferMove.assignmentId) ?? null;
          const shouldRoute = Boolean(movingWafer && canReviewerRouteCheckpoint({
            attemptId: movingWafer.latestStepAttemptId,
            canReview: movingWafer.canReview,
            currentUserId,
            requiredReviewerId: movingWafer.requiredReviewerId,
            status: movingWafer.currentStepStatus
          }));

          if (move.kind === "submit") {
            return {
              kind: "submit",
              assignmentId: waferMove.assignmentId,
              stepExecutionId: movingWafer?.currentStepExecutionId ?? "",
              mutationId: waferMove.mutationId,
              batchId: move.batchId!,
              notes: actionNote,
              evidence: {}
            };
          }
          if (shouldRoute) {
            return {
              kind: "route",
              batchId: move.batchId!,
              assignmentId: waferMove.assignmentId,
              attemptId: movingWafer!.latestStepAttemptId!,
              targetStepId: move.targetStepId,
              decisionMutationId: waferMove.checkpointMutationId,
              movementMutationId: waferMove.mutationId,
              note: actionNote
            };
          }
          return {
            kind: "move",
            batchId: move.batchId!,
            mutationId: waferMove.mutationId,
            assignmentId: waferMove.assignmentId,
            sourceStepId: move.sourceStepId,
            targetStepId: move.targetStepId,
            note: actionNote,
            correctCheckpointRoute: movingWafer?.canCorrectCheckpointRoute === true &&
              sourceNode?.executionMode === "main" &&
              targetNode?.executionMode === "main"
          };
        });

        const coreResults = onPersistMutationsBatch
          ? await (async () => {
              const batchResult = await onPersistMutationsBatch({ mutations: mutationRequests });
              if (!batchResult.ok) {
                return move.wafers.map((waferMove) => ({
                  waferMove,
                  result: { ok: false as const, error: batchResult.error }
                }));
              }
              const outcomesById = new Map(batchResult.data.map((outcome) => [outcome.operationId, outcome]));
              return move.wafers.map((waferMove) => {
                const outcome = outcomesById.get(waferMove.mutationId);
                return {
                  waferMove,
                  result: outcome?.ok
                    ? { ok: true as const, data: outcome.data }
                    : { ok: false as const, error: outcome?.error ?? "The wafer move failed." }
                };
              });
            })()
          : await Promise.all(move.wafers.map(async (waferMove, index) => {
              const request = mutationRequests[index];
              try {
                const result = request.kind === "submit"
                  ? await onSubmitCheckpoint!(request)
                  : request.kind === "route"
                    ? await onRouteCheckpoint!(request)
                    : await onMoveApprovedWafer!(request);
                return { waferMove, result };
              } catch (error) {
                return {
                  waferMove,
                  result: {
                    ok: false as const,
                    error: error instanceof Error ? error.message : "The wafer move failed."
                  }
                };
              }
            }));

        const outcomes = coreResults;

        const failedOutcomes = outcomes.filter((outcome) => !outcome.result.ok);
        const successfulOutcomes = outcomes.filter((outcome) => outcome.result.ok);
        const successfulAssignmentIdsList = successfulOutcomes.map((outcome) => outcome.waferMove.assignmentId);
        const requiresParameters = move.kind === "move" && Boolean(onSaveStepParameters && targetNode);
        mutationQueue.setState(
          successfulAssignmentIdsList,
          requiresParameters ? "awaiting_parameters" : files.length ? "uploading_files" : "synced"
        );

        if (move.kind === "move" && onSaveStepParameters && targetNode) {
          setPendingStepParameterEntries((current) => settlePendingStepParameterEntries(
            current,
            new Set(successfulOutcomes.map((outcome) => outcome.waferMove.mutationId)),
            new Set(failedOutcomes.map((outcome) => outcome.waferMove.mutationId))
          ));
        }

        const attachmentOutcomes = files.length ? successfulOutcomes.flatMap(({ waferMove, result }) => {
          const movingWafer = movingWafersByAssignmentId.get(waferMove.assignmentId) ?? null;
          if (!movingWafer?.projectId || !movingWafer.waferId) return [];
          const payload = result.ok ? result.data as {
            id?: string;
            step_execution_id?: string;
            metadata?: Record<string, unknown> | null;
          } : null;
          const stepExecutionId = move.kind === "submit"
            ? movingWafer.currentStepExecutionId ?? null
            : payload?.id ?? payload?.step_execution_id ?? null;
          return [{
            waferMove,
            input: {
              projectId: movingWafer.projectId,
              waferId: movingWafer.waferId,
              dieLabel: movingWafer.dieLabel || movingWafer.waferCode,
              stepId: move.kind === "submit" ? move.sourceStepId : move.targetStepId,
              stepName: move.kind === "submit" ? move.sourceLabel : move.targetLabel,
              stepExecutionId,
              noteId: `execution-note:${stepExecutionId ?? waferMove.mutationId}`,
              authorId: typeof payload?.metadata?.note_author_id === "string"
                ? payload.metadata.note_author_id
                : currentUserId ?? null,
              author: typeof payload?.metadata?.note_author_name === "string"
                ? payload.metadata.note_author_name
                : currentUserName?.trim() || "Unknown user",
              body: actionNote,
              files
            }
          }];
        }) : [];
        if (attachmentOutcomes.length) {
          const attachmentAssignmentIds = attachmentOutcomes.map(({ waferMove }) => waferMove.assignmentId);
          const uploadAttachments = () => {
            mutationQueue.setState(attachmentAssignmentIds, "uploading_files");
            void persistWaferStepNoteAttachmentsBatch(
              attachmentOutcomes.map(({ input }) => input)
            ).then(() => {
              mutationQueue.setState(
                attachmentAssignmentIds,
                requiresParameters ? "awaiting_parameters" : "synced"
              );
            }).catch((error) => {
              attachmentOutcomes.forEach(({ waferMove }) => mutationQueue.upsert([{
                assignmentId: waferMove.assignmentId,
                label: waferMove.waferLabel,
                mutationId: waferMove.mutationId,
                state: "failed",
                detail: error instanceof Error ? error.message : "The attachments could not be uploaded.",
                retry: uploadAttachments
              }]));
            });
          };
          uploadAttachments();
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
            setPendingWaferMoveFiles([...files]);
          }
          const firstFailure = failedOutcomes[0];
          const failureMessage = firstFailure && !firstFailure.result.ok
            ? firstFailure.result.error
            : "The selected dies could not be moved.";
          failedOutcomes.forEach((outcome) => mutationQueue.upsert([{
            assignmentId: outcome.waferMove.assignmentId,
            label: outcome.waferMove.waferLabel,
            mutationId: outcome.waferMove.mutationId,
            state: "failed",
            detail: failureMessage,
            retry: () => submitPendingWaferMove({
              ...move,
              wafers: [outcome.waferMove],
              waferLabel: outcome.waferMove.waferLabel
            }, actionNote, files)
          }]));
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

        const successMessage = move.kind === "submit"
          ? `Submitted ${move.waferLabel} for checkpoint review.`
          : `Moved ${move.waferLabel} to ${move.targetLabel}.`;
        setMoveMessage(successMessage);
        scheduleBackgroundRefresh();

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

    const label = uniqueNodeIds.length === 1
      ? nodeById.get(uniqueNodeIds[0])?.label ?? "selected step"
      : `${uniqueNodeIds.length} selected steps`;
    const previousNodes = nodesRef.current;
    const previousEdges = edgesRef.current;
    const deletedIds = new Set(uniqueNodeIds);

    setNodes((currentNodes) => currentNodes.filter((node) => !deletedIds.has(node.id)));
    setEdges((currentEdges) => normalizeFlowEdges(currentEdges.filter((edge) => !deletedIds.has(edge.from) && !deletedIds.has(edge.to))));
    setConnectionDraft((draft) => (draft && deletedIds.has(draft.from) ? null : draft));
    if (nodeDragRef.current && deletedIds.has(nodeDragRef.current.nodeId)) {
      nodeDragRef.current = null;
    }
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
          setMoveMessage(result.error);
          return;
        }

        setMoveMessage(`Deleted ${label}.`);
      })();
    });
  }, [canEdit, nodeById, onDeleteSteps]);

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
  }, [canEdit, edges, onDeleteTransitions]);

  const canUndoSelectedDieHistory = Boolean(
    canEdit &&
    onUndoDieProcessHistory &&
    activeSelectedWafers.length === 1 &&
    selectedWafer?.isDie &&
    selectedWaferPin?.canUndoHistory &&
    selectedWaferPin?.currentStepStatus &&
    ["queued", "running", "blocked", "awaiting_checkpoint", "ready_to_move", "redo_required", "completed"].includes(
      selectedWaferPin.currentStepStatus
    )
  );

  const undoSelectedDieHistory = useCallback(() => {
    if (
      !canUndoSelectedDieHistory ||
      !onUndoDieProcessHistory ||
      !selectedWafer ||
      !selectedWaferPin?.currentStepStatus ||
      isWaferMutationPending
    ) {
      return;
    }
    if (!confirmDiscardSelectionParameters("Discard the unsaved parameter changes before undoing this movement?")) {
      return;
    }

    const expectedStepStatus = selectedWaferPin.currentStepStatus as Exclude<
      typeof selectedWaferPin.currentStepStatus,
      "pending" | "skipped" | "failed" | null
    >;
    startWaferMutationTransition(() => {
      void onUndoDieProcessHistory({
        mutationId: crypto.randomUUID(),
        assignmentId: selectedWafer.assignmentId,
        expectedStepId: selectedWafer.nodeId,
        expectedStepStatus
      }).then((result) => {
        if (!result.ok) {
          setMoveMessage(result.error);
          return;
        }

        setMoveMessage(`Undid ${selectedWafer.label} to its previous process state.`);
        router.refresh();
      }).catch((error: unknown) => {
        setMoveMessage(error instanceof Error ? error.message : "The die history could not be undone.");
      });
    });
  }, [
    canUndoSelectedDieHistory,
    confirmDiscardSelectionParameters,
    isWaferMutationPending,
    onUndoDieProcessHistory,
    router,
    selectedWafer,
    selectedWaferPin
  ]);

  useEffect(() => {
    const onGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isTextInputTarget(event.target)) {
        return;
      }

      const isUndoShortcut = (event.key === "z" || event.key === "Z") && (event.ctrlKey || event.metaKey) && !event.shiftKey;
      if (isUndoShortcut) {
        if (!canUndoSelectedDieHistory) {
          return;
        }

        event.preventDefault();
        undoSelectedDieHistory();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!canEdit) {
          return;
        }

        if (selectedWafer && activeSelectedWafers.length === 1) {
          event.preventDefault();
          deleteSelectedWafer();
        } else if (selectedWafer) {
          event.preventDefault();
          setMoveMessage("Delete is available only when one wafer or die is selected.");
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
  }, [
    canEdit,
    activeSelectedWafers.length,
    canUndoSelectedDieHistory,
    deleteEdge,
    deleteSelectedNodes,
    deleteSelectedWafer,
    selectedEdgeId,
    selectedNodeIds,
    selectedWafer,
    undoSelectedDieHistory
  ]);

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

    frame.addEventListener("wheel", handleWheelFallback, { passive: false });

    return () => {
      frame.removeEventListener("wheel", handleWheelFallback);
      if (pinchAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(pinchAnimationFrameRef.current);
        pinchAnimationFrameRef.current = null;
      }
    };
  }, [applyScaleAtAnchor, getPanePoint, queuePinchScale]);

  const pendingParameterDrafts = groupPendingStepParameterEntries(pendingStepParameterEntries);
  const activeParameterDraft = pendingParameterDrafts[0] ?? null;
  const isPendingWaferMoveLocked = pendingWaferMove?.wafers.some(
    (wafer) => mutationQueue.lockedAssignmentIds.has(wafer.assignmentId)
  ) ?? false;

  return (
    <section className="flow-map-shell">
      {waferDetailsFullPrefetchHref ? (
        <Link
          key={waferDetailsFullPrefetchHref}
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
          href={waferDetailsFullPrefetchHref}
          prefetch={true}
          tabIndex={-1}
        />
      ) : null}
      <ProcessFlowMutationStatus items={mutationQueue.items} onDismiss={mutationQueue.dismiss} />
      {moveMessage ? (
        <div className="process-flow-live-message" aria-live="polite" data-testid="process-flow-live-message" role="status">
          <span>{moveMessage}</span>
          <button type="button" aria-label="Dismiss status" onClick={() => setMoveMessage(null)}>Dismiss</button>
        </div>
      ) : null}
      {openingWaferDetailsLabel ? (
        <div className="flow-wafer-move-dialog-backdrop" data-testid="wafer-details-loading">
          <section className="flow-wafer-move-dialog" aria-live="polite" role="status">
            <div className="flow-wafer-move-dialog__header">
              <h2>Opening {openingWaferDetailsLabel}</h2>
              <p>Loading wafer and die status…</p>
            </div>
            <div className="grid gap-3" aria-hidden>
              <div className="h-4 w-2/3 animate-pulse rounded bg-[#e8e9e5]" />
              <div className="h-24 animate-pulse rounded-lg bg-[#f2f2ee]" />
            </div>
          </section>
        </div>
      ) : null}
      {!pendingWaferMove && activeParameterDraft && onSaveStepParameters ? (
        <StepParameterEntryDialog
          key={activeParameterDraft.draftId}
          entries={activeParameterDraft.entries}
          onSave={onSaveStepParameters}
          onSaveBatch={onSaveStepParametersBatch}
          draftPosition={1}
          draftCount={pendingParameterDrafts.length}
          currentUserName={currentUserName}
          onPersistAttachment={persistWaferStepNoteAttachments}
          onPersistAttachmentBatch={persistWaferStepNoteAttachmentsBatch}
          onSaveStarted={(entries) => mutationQueue.setState(
            entries.map((entry) => entry.assignmentId),
            "saving_parameters"
          )}
          onSaveFailed={(entries, error) => mutationQueue.setState(
            entries.map((entry) => entry.assignmentId),
            "failed",
            error
          )}
          onAttachmentState={(entries, state, detail, retry) => {
            if (state === "failed" && retry) {
              mutationQueue.upsert(entries.map((entry) => ({
                assignmentId: entry.assignmentId,
                label: entry.waferLabel,
                mutationId: entry.movementMutationId,
                state,
                detail,
                retry
              })));
              return;
            }
            mutationQueue.setState(entries.map((entry) => entry.assignmentId), state, detail);
          }}
          onComplete={(message, hasBackgroundAttachments) => {
            const completedMutationIds = new Set(
              activeParameterDraft.entries.map((entry) => entry.movementMutationId)
            );
            setPendingStepParameterEntries((current) => current.filter(
              (entry) => !completedMutationIds.has(entry.movementMutationId)
            ));
            if (!hasBackgroundAttachments) {
              mutationQueue.setState(
                activeParameterDraft.entries.map((entry) => entry.assignmentId),
                "synced"
              );
            }
            setMoveMessage(message);
            scheduleBackgroundRefresh();
          }}
          onSkipAll={() => {
            const skippedMutationIds = new Set(activeParameterDraft.entries.map((entry) => entry.movementMutationId));
            setPendingStepParameterEntries((current) => current.filter(
              (entry) => !skippedMutationIds.has(entry.movementMutationId)
            ));
            mutationQueue.setState(
              activeParameterDraft.entries.map((entry) => entry.assignmentId),
              "synced"
            );
          }}
        />
      ) : null}
      {stepTemplateDraft ? (
        <StepTemplateDialog
          draft={stepTemplateDraft}
          errorMessage={stepTemplateError}
          isPending={isStepTemplatePending}
          returnFocusTo={stepTemplateRestoreFocusRef.current}
          onCancel={() => {
            setStepTemplateDraft(null);
            setStepTemplateError(null);
          }}
          onChange={(draft) => {
            setStepTemplateDraft((current) => current ? { ...current, ...draft } : current);
            setStepTemplateError(null);
          }}
          onSubmit={submitStepTemplate}
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
        <div
          className="flow-wafer-move-dialog-backdrop flow-wafer-move-dialog-backdrop--keyboard-aware"
          style={{ "--flow-wafer-move-dialog-keyboard-inset": `${keyboardInset}px` } as CSSProperties}
        >
          <section
            aria-labelledby="flow-wafer-move-title"
            aria-modal="true"
            className="flow-wafer-move-dialog flow-wafer-move-dialog--keyboard-aware"
            onPaste={pastePendingWaferMoveImages}
            role="dialog"
          >
            <div className="flow-wafer-move-dialog__content">
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
                <span>
                  {pendingWaferMove.kind === "submit" ? "Required note" : "Movement note"}
                  {pendingWaferMove.kind === "move" ? <small> Optional</small> : null}
                </span>
                <textarea
                  autoFocus
                  disabled={isPendingWaferMoveLocked}
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
                disabled={isPendingWaferMoveLocked}
                error={pendingWaferMoveFileError}
                description={pendingWaferMove.wafers.length > 1
                  ? "Drop files here, paste images, or attach files for all selected dies."
                  : "Drop files here, paste images, or attach files for this step note."}
                mobileDescription={pendingWaferMove.wafers.length > 1
                  ? "Photos and files apply to all selected dies."
                  : "Photos and files save with this movement note."}
                onAddFiles={appendPendingWaferMoveFiles}
                onRemoveFile={(file) => setPendingWaferMoveFiles((current) => current.filter((candidate) => candidate !== file))}
              />
            </div>
            <div className="flow-wafer-move-dialog__actions">
              <button
                className="button ghost-button"
                disabled={isPendingWaferMoveLocked}
                onClick={cancelPendingWaferMove}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button primary-button"
                disabled={isPendingWaferMoveLocked || (pendingWaferMove.kind === "submit" && !pendingWaferMoveNote.trim())}
                onClick={() => submitPendingWaferMove()}
                type="button"
              >
                {isPendingWaferMoveLocked
                  ? "Saving…"
                  : pendingWaferMove.kind === "submit" ? "Submit for review" : "Create planned batch"}
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
        onUndo={onUndoDieProcessHistory ? undoSelectedDieHistory : undefined}
        canUndo={canUndoSelectedDieHistory}
        isUndoPending={isWaferMutationPending}
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
      {selectedWafer && selectedWaferPin && selectionInspectorItems.length > 0 ? (
        <ProcessFlowSelectionInspector
          items={selectionInspectorItems}
          moveTargets={mobileWaferMoveTargets}
          canEdit={canEdit}
          canDelete={Boolean(canEdit && onDeleteWafer && activeSelectedWafers.length === 1)}
          canUndoMovement={canUndoSelectedDieHistory}
          isPending={activeSelectedWafers.some((wafer) => mutationQueue.lockedAssignmentIds.has(wafer.assignmentId))}
          onActivate={activateWaferInInspector}
          onClear={clearWaferSelectionFromInspector}
          onDelete={deleteSelectedWafer}
          onRemove={removeWaferFromInspector}
          onOpenFullRecord={() => openWaferDetails(selectedWaferPin)}
          onParameterDirtyChange={handleSelectionParameterDirtyChange}
          onUndoMovement={undoSelectedDieHistory}
        />
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
          {selectedNodeIds.size === 1 ? (
            <button
              className="button button-secondary"
              onClick={() => openStepParameters([...selectedNodeIds][0])}
              type="button"
            >
              {canEdit ? "Edit template" : "View template"}
            </button>
          ) : null}
          {canEdit ? (
            <button
              className="button button-secondary"
              disabled={isGraphPending}
              onClick={deleteSelectedNodes}
              type="button"
            >
              {selectedNodeIds.size === 1 ? "Delete step" : "Delete steps"}
            </button>
          ) : null}
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
        syncStateByAssignmentId={mutationQueue.syncStateByAssignmentId}
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
        onFrameTouchPointerDownCapture={beginTouchGesture}
        onFrameTouchPointerMoveCapture={updateTouchGesture}
        onFrameTouchPointerEndCapture={endTouchGesture}
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
        onPrefetchWaferDetails={prefetchWaferDetails}
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
