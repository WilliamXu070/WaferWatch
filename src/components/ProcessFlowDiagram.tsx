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
  WHEEL_ZOOM_STEP
} from "./process-flow/constants";
import { getGraphBounds, getSnappedNodePosition, nodeContainsPoint } from "./process-flow/geometry";
import {
  clampScale,
  getWaferChipLabel,
  isTextInputTarget,
  toProcessStepNodeType
} from "./process-flow/labels";
import { autoLayoutNodes } from "./process-flow/layout";
import { getGraphSignature, getInitialGraph } from "./process-flow/graphSeed";
import type {
  ConnectionDraft,
  CreateProcessFlowStepAction,
  CreateProcessStepTransitionAction,
  DeleteProcessStepsAction,
  DiagramStep,
  DiagramTransition,
  FlowEdge,
  FlowNode,
  FlowNodeRole,
  GraphViewportFit,
  MoveWaferToProcessStepAction,
  NodeDrag,
  PanePoint,
  PersistedStepPayload,
  RoleMenu,
  ScenePoint,
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

export function ProcessFlowDiagram({
  steps,
  transitions = [],
  processTemplateId,
  onCreateStep,
  onUpdateStepPositions,
  onUpdateStepName,
  onUpdateStepNodeType,
  onCreateTransition,
  onDeleteSteps,
  onMoveWafer
}: {
  steps: DiagramStep[];
  transitions?: DiagramTransition[];
  processTemplateId?: string;
  onCreateStep?: CreateProcessFlowStepAction;
  onUpdateStepPositions?: UpdateProcessStepPositionsAction;
  onUpdateStepName?: UpdateProcessStepNameAction;
  onUpdateStepNodeType?: UpdateProcessStepNodeTypeAction;
  onCreateTransition?: CreateProcessStepTransitionAction;
  onDeleteSteps?: DeleteProcessStepsAction;
  onMoveWafer?: MoveWaferToProcessStepAction;
}) {

  const router = useRouter();
  const [scale, setScale] = useState(1);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [nodeDrag, setNodeDrag] = useState<NodeDrag | null>(null);
  const [waferDrag, setWaferDrag] = useState<WaferDrag | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [roleMenu, setRoleMenu] = useState<RoleMenu | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [moveMessage, setMoveMessage] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeLabel, setEditingNodeLabel] = useState("");
  const editingInputRef = useRef<HTMLInputElement | null>(null);
  const [isMovePending, startMoveTransition] = useTransition();
  const [isGraphPending, startGraphTransition] = useTransition();
  const scaleRef = useRef(1);
  const pinchBaseScaleRef = useRef(1);
  const pendingZoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const pendingGraphFitRef = useRef<GraphViewportFit | null>(null);
  const pendingStepCreateRef = useRef<Map<string, QueuedStepCreate>>(new Map());
  const pendingTransitionCreateRef = useRef<Map<string, QueuedTransition>>(new Map());
  const pendingPositionUpdateRef = useRef<Map<string, { canvasX: number; canvasY: number }>>(new Map());
  const pendingNameUpdateRef = useRef<Map<string, string>>(new Map());
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
  const graphSignature = useMemo(() => getGraphSignature(steps, transitions), [steps, transitions]);
  const seededSignatureRef = useRef<string | null>(null);

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
  const selectedNodeCount = selectedNodeIds.size;
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
      currentEdges.map((edge) => ({
        ...edge,
        from: edge.from === temporaryStepId ? persistedStep.id : edge.from,
        to: edge.to === temporaryStepId ? persistedStep.id : edge.to
      }))
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
          setEdges((current) => current.filter((edge) => edge.id !== localId));
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
        setEdges((current) => current.filter((edge) => edge.id !== localId));
        continue;
      }

      const persisted = result.data;
      setEdges((currentEdges) =>
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
        setEdges((currentEdges) => currentEdges.filter((edge) => edge.from !== temporaryStepId && edge.to !== temporaryStepId));
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
  }, [clearEditingNode, nodeById, queueNodeNamePersist]);

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
  const getVisibleSceneCenter = () => {
    const frame = frameRef.current;
    if (!frame) {
      return { x: sceneBounds.width / 2, y: sceneBounds.height / 2 };
    }

    return {
      x: (frame.scrollLeft + frame.clientWidth / 2) / scaleRef.current,
      y: (frame.scrollTop + frame.clientHeight / 2) / scaleRef.current
    };
  };

  const applyGraphFit = useCallback((fit: GraphViewportFit) => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    frame.scrollLeft = Math.max(0, Math.round(fit.centerX * fit.scale - frame.clientWidth / 2));
    frame.scrollTop = Math.max(0, Math.round(fit.centerY * fit.scale - frame.clientHeight / 2));
  }, []);

  const centerView = useCallback((targetNodes: FlowNode[] = nodes) => {
    const frame = frameRef.current;
    const bounds = getGraphBounds(targetNodes);
    if (!frame || !bounds) {
      return;
    }

    const availableWidth = Math.max(1, frame.clientWidth - FIT_VIEW_PADDING);
    const availableHeight = Math.max(1, frame.clientHeight - FIT_VIEW_PADDING);
    const nextScale = clampScale(Math.min(MAX_SCALE, availableWidth / bounds.width, availableHeight / bounds.height));
    const fit = {
      centerX: bounds.centerX,
      centerY: bounds.centerY,
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
  }, [applyGraphFit, nodes]);

  const organizeCanvas = () => {
    if (nodes.length < 2) {
      return;
    }

    if (!onUpdateStepPositions) {
      setMoveMessage("Graph position persistence is not available for this process view.");
      return;
    }

    const targetCenter = getVisibleSceneCenter();
    const nextNodes = autoLayoutNodes(nodes, edges, targetCenter);
    setNodes(nextNodes);
    setSelectedNodeIds(new Set());
    setRoleMenu(null);
    setMoveMessage("Organized process flow.");
    centerView(nextNodes);
    nextNodes.forEach((node) => {
      queueNodePositionPersist(node.id, node.x, node.y);
    });
  };

  useEffect(() => {
    if (seededSignatureRef.current === graphSignature) {
      return;
    }

    const graph = getInitialGraph(steps, transitions);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setConnectionDraft(null);
    setNodeDrag(null);
    setWaferDrag(null);
    setSnapGuides([]);
    setRoleMenu(null);
    setSelectedNodeIds(new Set());
    setMoveMessage(null);
    setEditingNode(null);
    clearQueuedStepMaps();
    clearTimers();
    seededSignatureRef.current = graphSignature;
    centerView(graph.nodes);
  }, [clearQueuedStepMaps, centerView, clearTimers, graphSignature, steps, transitions]);

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

  const clearSelectionIfOffNode = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as EventTarget | null;
    const hasNodeTarget = target instanceof Element && target.closest(".flow-node") !== null;
    if (hasNodeTarget) {
      return;
    }

    setRoleMenu(null);
    setSelectedNodeIds(new Set());
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
      height: NODE_HEIGHT,
      role: "normal",
      order: nodes.length + 1,
      isOptimistic: true
    };

    setRoleMenu(null);
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

  const beginConnection = (event: PointerEvent<SVGGElement>, nodeId: string) => {
    if (event.button !== 0 || !event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setRoleMenu(null);
    setSelectedNodeIds(new Set([nodeId]));

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
    event.stopPropagation();
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      setRoleMenu(null);
      setSelectedNodeIds((current) => {
        const next = new Set(current);
        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }
        return next;
      });
      return;
    }

    if (event.shiftKey) {
      beginConnection(event, node.id);
      return;
    }

    setSelectedNodeIds(new Set([node.id]));
    beginNodeDrag(event, node);
  };

  const beginNodeDrag = (event: PointerEvent<SVGGElement>, node: FlowNode) => {
    if (event.button !== 0 || connectionDraft) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setRoleMenu(null);
    setSelectedNodeIds((current) => current.has(node.id) ? current : new Set([node.id]));

    const point = getScenePoint(event);
    setNodeDrag({
      nodeId: node.id,
      pointerId: event.pointerId,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
      startX: node.x,
      startY: node.y
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
    const finishedDrag = nodeDrag;
    setNodeDrag(null);
    setSnapGuides([]);

    const draggedNode = nodes.find((node) => node.id === finishedDrag.nodeId);
    if (!draggedNode || (draggedNode.x === finishedDrag.startX && draggedNode.y === finishedDrag.startY)) {
      return;
    }

    queueNodePositionPersist(draggedNode.id, draggedNode.x, draggedNode.y);
  };

  const beginWaferDrag = (event: PointerEvent<SVGGElement>, node: FlowNode, wafer: WaferPin) => {
    if (!onMoveWafer || event.button !== 0 || isMovePending) {
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
    const completeSourceStep = Boolean(sourceNode && target.order > sourceNode.order);

    setMoveMessage(
      completeSourceStep
        ? `Completing ${sourceNode?.label ?? "source step"} and moving ${finishedDrag.waferLabel} to ${target.label}...`
        : `Moving ${finishedDrag.waferLabel} to ${target.label}...`
    );
    startMoveTransition(() => {
      void (async () => {
        const result = await onMoveWafer({
          assignmentId: finishedDrag.assignmentId,
          targetStepId: target.id,
          note: `Moved from process flow wireframe to ${target.label}.`,
          completeSourceStep
        });

        if (result.ok) {
          setMoveMessage(
            completeSourceStep
              ? `Completed source step and moved ${finishedDrag.waferLabel} to ${target.label}.`
              : `Moved ${finishedDrag.waferLabel} to ${target.label}.`
          );
          router.refresh();
          return;
        }

        setMoveMessage(result.error);
      })();
    });
  };

  const updateConnection = (event: PointerEvent<SVGSVGElement>) => {
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

  const finishConnection = (event: PointerEvent<SVGSVGElement>) => {
    if (waferDrag) {
      finishWaferDrag(event);
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

    setEdges((currentEdges) => [
      ...currentEdges,
      {
        id: temporaryTransitionId,
        from: finishedDraft.from,
        to: target.id,
        kind: edgeType
      }
    ]);
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

  const setNodeRole = (nodeId: string, role: FlowNodeRole) => {
    setRoleMenu(null);
    if (!onUpdateStepNodeType) {
      setMoveMessage("Graph node type persistence is not available for this process view.");
      return;
    }

    const node = nodeById.get(nodeId);
    setMoveMessage(`Saving ${node?.label ?? "step"} role...`);

    startGraphTransition(() => {
      void (async () => {
        const result = await onUpdateStepNodeType({
          stepId: nodeId,
          nodeType: toProcessStepNodeType(role)
        });

        if (!result.ok) {
          setMoveMessage(result.error);
          return;
        }

        setNodes((currentNodes) =>
          currentNodes.map((currentNode) => {
            if (currentNode.id === nodeId) {
              return { ...currentNode, role };
            }

            if (role !== "normal" && currentNode.role === role) {
              return { ...currentNode, role: "normal" };
            }

            return currentNode;
          })
        );
        setMoveMessage(`Saved ${node?.label ?? "step"} role.`);
        router.refresh();
      })();
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

    const label = uniqueNodeIds.length === 1
      ? nodeById.get(uniqueNodeIds[0])?.label ?? "selected step"
      : `${uniqueNodeIds.length} selected steps`;
    setMoveMessage(`Deleting ${label}...`);

    startGraphTransition(() => {
      void (async () => {
        const result = await onDeleteSteps({ stepIds: uniqueNodeIds });

        if (!result.ok) {
          setMoveMessage(result.error);
          return;
        }

        const deletedIds = new Set(uniqueNodeIds);
        setNodes((currentNodes) => currentNodes.filter((node) => !deletedIds.has(node.id)));
        setEdges((currentEdges) => currentEdges.filter((edge) => !deletedIds.has(edge.from) && !deletedIds.has(edge.to)));
        setConnectionDraft((draft) => (draft && deletedIds.has(draft.from) ? null : draft));
        setNodeDrag((drag) => (drag && deletedIds.has(drag.nodeId) ? null : drag));
        setWaferDrag((drag) => (drag && deletedIds.has(drag.sourceStepId) ? null : drag));
        setSelectedNodeIds(new Set());
        setSnapGuides([]);
        setRoleMenu(null);
        setMoveMessage(`Deleted ${label}.`);
        router.refresh();
      })();
    });
  }, [nodeById, onDeleteSteps, router]);

  const deleteSelectedNodes = useCallback(() => {
    deleteNodes([...selectedNodeIds]);
  }, [deleteNodes, selectedNodeIds]);

  useEffect(() => {
    const onGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isTextInputTarget(event.target)) {
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedNodeIds.size > 0) {
        event.preventDefault();
        deleteSelectedNodes();
      }
    };

    window.addEventListener("keydown", onGlobalKeyDown);

    return () => {
      window.removeEventListener("keydown", onGlobalKeyDown);
    };
  }, [deleteSelectedNodes, selectedNodeIds]);

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
      <ProcessFlowToolbar
        nodesCount={nodes.length}
        edgesCount={edges.length}
        selectedNodeCount={selectedNodeCount}
        moveMessage={moveMessage}
        zoomPercent={Math.round(s * 100)}
        isGraphPending={isGraphPending}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onCenterView={() => centerView()}
        onOrganize={organizeCanvas}
      />
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
        nodeDrag={nodeDrag}
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
          setWaferDrag(null);
        }}
        onCanvasPointerDown={clearSelectionIfOffNode}
        onCanvasDoubleClick={createNode}
        onCanvasContextMenu={(event) => {
          event.preventDefault();
          setRoleMenu(null);
          setSelectedNodeIds(new Set());
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
        onSetNodeRole={setNodeRole}
        onDeleteNodes={(nodeIds) => deleteNodes(nodeIds)}
      />
    </section>
  );
}
