"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { useRouter } from "next/navigation";
import type { ProcessStepNodeType, ProcessStepTransitionType } from "@/types/database";
import { ProcessFlowCanvas } from "./process-flow/ProcessFlowCanvas";
import { ProcessFlowToolbar } from "./process-flow/ProcessFlowToolbar";
import {
  BUTTON_ZOOM_STEP,
  EDGE_ID_PREFIX,
  FIT_VIEW_PADDING,
  MAX_SCALE,
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
  WHEEL_ZOOM_STEP,
  getNodeHeightForWaferCount
} from "./process-flow/constants";
import { getGraphBounds, getSnappedNodePosition, nodeContainsPoint } from "./process-flow/geometry";
import {
  clampScale,
  getWaferChipLabel,
  isTextInputTarget
} from "./process-flow/labels";
import { autoLayoutNodes } from "./process-flow/layout";
import { getInitialGraph } from "./process-flow/graphSeed";
import type {
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
  MoveWaferToProcessStepAction,
  NodeDrag,
  PanePoint,
  PendingWaferMove,
  PersistedStepPayload,
  RoleMenu,
  ScenePoint,
  SelectionBox,
  SelectionRect,
  SnapGuide,
  UpdateProcessStepNameAction,
  UpdateProcessStepNodeTypeAction,
  UpdateProcessStepPositionsAction,
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

const MAX_UNDO_STACK = 30;

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

export function ProcessFlowDiagram({
  steps,
  transitions = [],
  processTemplateId,
  onCreateStep,
  onCreateWaferAtProcessStart,
  onUpdateStepPositions,
  onUpdateStepName,
  onCreateTransition,
  onDeleteSteps,
  onDeleteTransitions,
  onDeleteWafer,
  onMoveWafer
}: {
  steps: DiagramStep[];
  transitions?: DiagramTransition[];
  processTemplateId?: string;
  onCreateStep?: CreateProcessFlowStepAction;
  onCreateWaferAtProcessStart?: CreateWaferAtProcessStartAction;
  onUpdateStepPositions?: UpdateProcessStepPositionsAction;
  onUpdateStepName?: UpdateProcessStepNameAction;
  onUpdateStepNodeType?: UpdateProcessStepNodeTypeAction;
  onCreateTransition?: CreateProcessStepTransitionAction;
  onDeleteSteps?: DeleteProcessStepsAction;
  onDeleteTransitions?: DeleteProcessTransitionsAction;
  onDeleteWafer?: DeleteProcessFlowWaferAction;
  onMoveWafer?: MoveWaferToProcessStepAction;
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
  const [pendingWaferMove, setPendingWaferMove] = useState<PendingWaferMove | null>(null);
  const [pendingWaferMoveNote, setPendingWaferMoveNote] = useState("");
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [roleMenu, setRoleMenu] = useState<RoleMenu | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedWafer, setSelectedWafer] = useState<{
    assignmentId: string;
    nodeId: string;
    label: string;
  } | null>(null);
  const [undoStepsCount, setUndoStepsCount] = useState(0);
  const setMoveMessage = (msg: string | null) => { if (msg) console.warn("[ProcessFlow]", msg); };
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeLabel, setEditingNodeLabel] = useState("");
  const editingInputRef = useRef<HTMLInputElement | null>(null);
  const [isMovePending, startMoveTransition] = useTransition();
  const [isGraphPending, startGraphTransition] = useTransition();
  const [isWaferMutationPending, startWaferMutationTransition] = useTransition();
  const scaleRef = useRef(1);
  const pinchBaseScaleRef = useRef(1);
  const pendingZoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const pendingGraphFitRef = useRef<GraphViewportFit | null>(null);
  const pendingStepCreateRef = useRef<Map<string, QueuedStepCreate>>(new Map());
  const pendingTransitionCreateRef = useRef<Map<string, QueuedTransition>>(new Map());
  const pendingPositionUpdateRef = useRef<Map<string, { canvasX: number; canvasY: number }>>(new Map());
  const pendingNameUpdateRef = useRef<Map<string, string>>(new Map());
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
  const selectedWaferAssignmentId = useMemo(() => {
    if (!selectedWafer) {
      return null;
    }

    return nodes.some((node) =>
      node.wafers.some((wafer) => wafer.assignmentId === selectedWafer.assignmentId)
    )
      ? selectedWafer.assignmentId
      : null;
  }, [nodes, selectedWafer]);
  const directedEdgeByNodePair = useMemo(() => {
    const map = new Map<string, FlowEdge>();
    for (const edge of edges) {
      map.set(`${edge.from}:${edge.to}`, edge);
    }
    return map;
  }, [edges]);
  const selectedWaferSourceNode = useMemo(() => {
    if (!selectedWafer) {
      return null;
    }

    return nodeById.get(selectedWafer.nodeId) ?? null;
  }, [nodeById, selectedWafer]);
  const selectedWaferMoveTargets = useMemo(() => {
    if (!selectedWaferSourceNode) {
      return [];
    }

    return edges
      .filter((edge) => edge.from === selectedWaferSourceNode.id)
      .map((edge) => {
        const targetNode = nodeById.get(edge.to);
        if (!targetNode || targetNode.role !== "normal") {
          return null;
        }

        return {
          edge,
          node: targetNode
        };
      })
      .filter((target): target is { edge: FlowEdge; node: FlowNode } => Boolean(target));
  }, [edges, nodeById, selectedWaferSourceNode]);
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
  }, [clearEditingNode, nodeById, pushUndoSnapshot, queueNodeNamePersist]);

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
    if (nodes.length < 2) {
      return;
    }

    if (!onUpdateStepPositions) {
      setMoveMessage("Graph position persistence is not available for this process view.");
      return;
    }

    pushUndoSnapshot();

    const targetCenter = getCanvasSceneCenter();
    const nextNodes = autoLayoutNodes(nodes, edges, targetCenter);
    setNodes(nextNodes);
    setSelectedNodeIds(new Set());
    setRoleMenu(null);
    setMoveMessage("Organized process flow.");
    centerView(nextNodes, targetCenter);
    nextNodes.forEach((node) => {
      queueNodePositionPersist(node.id, node.x, node.y);
    });
  };

  const addWaferAtStart = useCallback(() => {
    if (!processTemplateId || !onCreateWaferAtProcessStart || isWaferMutationPending) {
      return;
    }

    setMoveMessage("Adding next wafer...");
    startWaferMutationTransition(() => {
      void (async () => {
        const result = await onCreateWaferAtProcessStart({
          templateId: processTemplateId
        });

        if (!result.ok) {
          setMoveMessage(result.error);
          return;
        }

        setMoveMessage("Added wafer.");
        router.refresh();
      })();
    });
  }, [isWaferMutationPending, onCreateWaferAtProcessStart, processTemplateId, router]);

  const selectWafer = useCallback((nodeId: string, wafer: WaferPin) => {
    setSelectedNodeIds(new Set());
    setSelectedEdgeId(null);
    setRoleMenu(null);
    setSelectedWafer({
      assignmentId: wafer.assignmentId,
      nodeId,
      label: getWaferChipLabel(wafer)
    });
  }, []);

  const deleteSelectedWafer = useCallback(() => {
    if (!selectedWafer || isWaferMutationPending) {
      return;
    }

    if (!onDeleteWafer) {
      setMoveMessage("Wafer deletion is not available for this process view.");
      return;
    }

    const wafer = selectedWafer;
    const previousNodes = nodesRef.current;
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
    setSelectedWafer(null);
    setMoveMessage(`Deleting ${wafer.label}...`);

    startWaferMutationTransition(() => {
      void (async () => {
        const result = await onDeleteWafer({ assignmentId: wafer.assignmentId });

        if (!result.ok) {
          setNodes(previousNodes);
          setSelectedWafer(wafer);
          setMoveMessage(result.error);
          return;
        }

        setMoveMessage(`Deleted ${wafer.label}.`);
        router.refresh();
      })();
    });
  }, [isWaferMutationPending, onDeleteWafer, router, selectedWafer]);

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
        nextNodes.push({
          ...node,
          wafers: serverNode.wafers,
          height: getNodeHeightForWaferCount(serverNode.wafers.length),
          subLabel: serverNode.subLabel,
          order: serverNode.order,
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
  }, []);

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
    setSelectedWafer(null);
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
    setSelectedWafer(null);

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

  const beginCanvasSelection = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (event.pointerType === "touch") {
      return;
    }

    const target = event.target as EventTarget | null;
    const hasNodeTarget = target instanceof Element && target.closest(".flow-node") !== null;
    const hasEdgeTarget = target instanceof Element && target.closest(".flow-edge-group") !== null;
    if (hasNodeTarget || hasEdgeTarget) {
      return;
    }

    commitActiveNodeLabel();
    event.preventDefault();
    setRoleMenu(null);
    setSelectedEdgeId(null);
    setSelectedWafer(null);
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
    event.currentTarget.setPointerCapture(event.pointerId);
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

    event.currentTarget.releasePointerCapture(event.pointerId);
    setSelectionBox(null);
    return true;
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

    pushUndoSnapshot();

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
      height: getNodeHeightForWaferCount(0),
      role: "normal",
      order: nodes.length + 1,
      isOptimistic: true
    };

    setRoleMenu(null);
    setSelectedWafer(null);
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

  const beginPendingConnection = (event: PointerEvent<SVGGElement>, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setRoleMenu(null);
    setSelectedWafer(null);

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
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleNodePointerDown = (event: PointerEvent<SVGGElement>, node: FlowNode) => {
    event.stopPropagation();
    if (editingNodeId && editingNodeId !== node.id) {
      commitActiveNodeLabel();
    }

    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      event.preventDefault();
      setRoleMenu(null);
      setSelectedWafer(null);
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
    setSelectedWafer(null);
    if (event.pointerType === "touch") {
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
    setSelectedWafer(null);
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
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateNodeDrag = (event: PointerEvent<SVGGElement>) => {
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
    if (pendingConnectionStart && pendingConnectionStart.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setPendingConnectionStart(null);
      return;
    }

    if (connectionDraft && connectionDraft.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      finishConnection(event);
      return;
    }

    if (!nodeDrag || nodeDrag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
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
    if (!onMoveWafer || event.button !== 0 || isMovePending) {
      return;
    }

    if (event.pointerType === "touch") {
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
    if (!sourceNode) {
      return;
    }

    const directedEdge = directedEdgeByNodePair.get(`${finishedDrag.sourceStepId}:${target.id}`);
    if (!directedEdge) {
      setMoveMessage(`No direct process path from ${sourceNode.label} to ${target.label}.`);
      return;
    }

    setPendingWaferMove({
      assignmentId: finishedDrag.assignmentId,
      sourceStepId: finishedDrag.sourceStepId,
      sourceLabel: sourceNode.label,
      targetStepId: target.id,
      targetLabel: target.label,
      waferLabel: finishedDrag.waferLabel,
      completeSourceStep: directedEdge.kind === "flow"
    });
    setPendingWaferMoveNote("");
  };

  const cancelPendingWaferMove = () => {
    if (isMovePending) {
      return;
    }

    setPendingWaferMove(null);
    setPendingWaferMoveNote("");
  };

  const submitPendingWaferMove = () => {
    if (!pendingWaferMove || !onMoveWafer || isMovePending) {
      return;
    }

    const note = pendingWaferMoveNote.trim();
    if (!note) {
      setMoveMessage("Add a process note before moving this wafer.");
      return;
    }

    const move = pendingWaferMove;
    setMoveMessage(
      move.completeSourceStep
        ? `Completing ${move.sourceLabel} and moving ${move.waferLabel} to ${move.targetLabel}...`
        : `Moving ${move.waferLabel} to ${move.targetLabel}...`
    );
    startMoveTransition(() => {
      void (async () => {
        const result = await onMoveWafer({
          assignmentId: move.assignmentId,
          sourceStepId: move.sourceStepId,
          targetStepId: move.targetStepId,
          note,
          completeSourceStep: move.completeSourceStep
        });

        if (result.ok) {
          setPendingWaferMove(null);
          setPendingWaferMoveNote("");
          setMoveMessage(
            move.completeSourceStep
              ? `Completed source step and moved ${move.waferLabel} to ${move.targetLabel}.`
              : `Moved ${move.waferLabel} to ${move.targetLabel}.`
          );
          return;
        }

        setMoveMessage(result.error);
      })();
    });
  };

  const beginSelectedWaferMove = (target: { edge: FlowEdge; node: FlowNode }) => {
    if (!selectedWafer || !selectedWaferSourceNode || !onMoveWafer || isMovePending) {
      return;
    }

    setPendingWaferMove({
      assignmentId: selectedWafer.assignmentId,
      sourceStepId: selectedWaferSourceNode.id,
      sourceLabel: selectedWaferSourceNode.label,
      targetStepId: target.node.id,
      targetLabel: target.node.label,
      waferLabel: selectedWafer.label,
      completeSourceStep: target.edge.kind === "flow"
    });
    setPendingWaferMoveNote("");
  };

  const updateConnection = (event: PointerEvent<SVGSVGElement>) => {
    if (updateCanvasSelection(event)) {
      return;
    }

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

  const finishConnection = (event: PointerEvent<SVGSVGElement | SVGGElement>) => {
    if (event.currentTarget instanceof SVGSVGElement && finishCanvasSelection(event as PointerEvent<SVGSVGElement>)) {
      return;
    }

    if (waferDrag) {
      finishWaferDrag(event as PointerEvent<SVGSVGElement>);
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
  }, [nodeById, onDeleteSteps, pushUndoSnapshot]);

  const deleteSelectedNodes = useCallback(() => {
    deleteNodes([...selectedNodeIds]);
  }, [deleteNodes, selectedNodeIds]);

  const deleteEdge = useCallback((edgeId: string) => {
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
  }, [edges, onDeleteTransitions, pushUndoSnapshot]);

  useEffect(() => {
    const onGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isTextInputTarget(event.target)) {
        return;
      }

      const isUndoShortcut = (event.key === "z" || event.key === "Z") && (event.ctrlKey || event.metaKey) && !event.shiftKey;
      if (isUndoShortcut) {
        event.preventDefault();
        undoLastEdit();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
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
  }, [deleteEdge, deleteSelectedNodes, deleteSelectedWafer, selectedEdgeId, selectedNodeIds, selectedWafer, undoLastEdit]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const handleWheelFallback = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const absDeltaX = Math.abs(event.deltaX);
      const absDeltaY = Math.abs(event.deltaY);
      const hasPreciseTrackpadDeltas =
        event.deltaMode === WheelEvent.DOM_DELTA_PIXEL &&
        (absDeltaX > 0 || (absDeltaY > 0 && absDeltaY < 50));

      if (!event.ctrlKey && !event.metaKey && hasPreciseTrackpadDeltas) {
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

  return (
    <section className="flow-map-shell">
      {pendingWaferMove ? (
        <div className="flow-wafer-move-dialog-backdrop">
          <section
            aria-labelledby="flow-wafer-move-title"
            aria-modal="true"
            className="flow-wafer-move-dialog"
            role="dialog"
          >
            <div className="flow-wafer-move-dialog__header">
              <p className="eyebrow">Process note required</p>
              <h2 id="flow-wafer-move-title">Move wafer</h2>
              <p>
                Add a note before moving {pendingWaferMove.waferLabel} from{" "}
                {pendingWaferMove.sourceLabel} to {pendingWaferMove.targetLabel}.
              </p>
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
              <span>Process note</span>
              <textarea
                autoFocus
                disabled={isMovePending}
                maxLength={4000}
                onChange={(event) => setPendingWaferMoveNote(event.currentTarget.value)}
                placeholder="What changed, what was observed, or why this wafer is moving now?"
                rows={5}
                value={pendingWaferMoveNote}
              />
            </label>
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
                onClick={submitPendingWaferMove}
                type="button"
              >
                {isMovePending ? "Moving..." : "Move wafer"}
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
        onAddWafer={addWaferAtStart}
        onUndo={undoLastEdit}
        canUndo={undoStepsCount > 0}
        canAddWafer={Boolean(processTemplateId && onCreateWaferAtProcessStart)}
      />
      {selectedWafer ? (
        <div className="flow-selected-wafer-actions" aria-label={`${selectedWafer.label} actions`}>
          <div className="flow-selected-wafer-actions__summary">
            <span>Selected wafer</span>
            <strong>{selectedWafer.label}</strong>
            {selectedWaferSourceNode ? <em>{selectedWaferSourceNode.label}</em> : null}
          </div>
          <div className="flow-selected-wafer-actions__buttons">
            {selectedWaferMoveTargets.length > 0 ? (
              selectedWaferMoveTargets.map((target) => (
                <button
                  key={target.edge.id}
                  type="button"
                  className="button button-secondary flow-selected-wafer-actions__move"
                  onClick={() => beginSelectedWaferMove(target)}
                  disabled={!onMoveWafer || isMovePending}
                >
                  Move to {target.node.label}
                </button>
              ))
            ) : (
              <span className="flow-selected-wafer-actions__empty">No direct next step</span>
            )}
            <button
              type="button"
              className="button button-danger flow-selected-wafer-actions__delete"
              onClick={deleteSelectedWafer}
              disabled={!onDeleteWafer || isWaferMutationPending}
            >
              Delete
            </button>
          </div>
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
        nodes={nodes}
        nodeById={nodeById}
        connectionDraft={connectionDraft}
        connectionNodeId={connectionDraft?.from ?? null}
        waferDrag={waferDrag}
        edges={edges}
        selectedNodeIds={selectedNodeIds}
        selectedEdgeId={selectedEdgeId}
        selectedWaferAssignmentId={selectedWaferAssignmentId}
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
        onCanvasPointerMove={updateConnection}
        onCanvasPointerUp={finishConnection}
        onCanvasPointerCancel={() => {
          setConnectionDraft(null);
          setPendingConnectionStart(null);
          setSelectionBox(null);
          setWaferDrag(null);
        }}
        onCanvasPointerDown={beginCanvasSelection}
        onCanvasDoubleClick={createNode}
        onCanvasContextMenu={(event) => {
          event.preventDefault();
          setRoleMenu(null);
          setSelectionBox(null);
          setSelectedNodeIds(new Set());
          setSelectedWafer(null);
        }}
        onNodePointerDown={handleNodePointerDown}
        onNodePointerMove={updateNodeDrag}
        onNodePointerUp={finishNodeDrag}
        onNodePointerCancel={finishNodeDrag}
        onNodeContextMenu={openRoleMenu}
        onBeginLabelEdit={beginNodeLabelEdit}
        onEditingLabelChange={(event) => setEditingNodeLabel(event.currentTarget.value)}
        onCommitLabel={commitNodeLabel}
        onCancelLabelEdit={cancelNodeLabelEdit}
        onBeginWaferDrag={beginWaferDrag}
        onSelectWafer={selectWafer}
        onDeleteNodes={(nodeIds) => deleteNodes(nodeIds)}
        onEdgeClick={(edgeId) => { setSelectedNodeIds(new Set()); setSelectedWafer(null); setSelectedEdgeId(edgeId); }}
      />
    </section>
  );
}
