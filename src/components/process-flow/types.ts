import type { ActionResult } from "@/lib/action-result";
import type { ProcessStepNodeType, ProcessStepTransitionType, StepStatus } from "@/types/database";

export type WaferPin = {
  assignmentId: string;
  waferId?: string;
  projectId?: string;
  currentStepExecutionId?: string | null;
  waferCode: string;
  dieLabel: string | null;
  currentStepStatus: StepStatus | null;
  currentHandlerName?: string | null;
  latestStepAttemptId?: string | null;
  latestStepAttemptSubmittedById?: string | null;
  latestStepAttemptNotes?: string | null;
  requiredReviewerId?: string | null;
  requiredReviewerName?: string | null;
  canReview?: boolean;
  canWithdraw?: boolean;
};

export type DiagramStep = {
  id: string;
  name: string;
  process_area: string;
  step_order: number;
  node_type?: ProcessStepNodeType;
  canvas_x?: number | null;
  canvas_y?: number | null;
  required_reviewer_id?: string | null;
  required_reviewer_name?: string | null;
  wafers: WaferPin[];
};

export type DiagramTransition = {
  id: string;
  from_step_id: string;
  to_step_id: string;
  edge_type: ProcessStepTransitionType;
  label: string | null;
  priority: number;
};

export type PersistedStepPayload = {
  id: string;
  name: string;
  process_area: string;
  step_order: number;
  node_type: ProcessStepNodeType;
  canvas_x: number | null;
  canvas_y: number | null;
};

export type PersistedTransitionPayload = {
  id: string;
  from_step_id: string;
  to_step_id: string;
  edge_type: ProcessStepTransitionType;
  label: string | null;
  priority: number;
};

export type FlowNodeRole = "normal" | "start" | "end";

export type FlowNode = {
  id: string;
  label: string;
  subLabel: string;
  wafers: WaferPin[];
  x: number;
  y: number;
  width: number;
  height: number;
  role: FlowNodeRole;
  order: number;
  requiredReviewerId?: string | null;
  requiredReviewerName?: string | null;
  isOptimistic?: boolean;
};

export type CheckpointReviewerOption = {
  id: string;
  name: string;
};

export type FlowEdge = {
  id: string;
  from: string;
  to: string;
  kind: "flow" | "return";
};

export type ConnectionDraft = {
  from: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  hasMoved: boolean;
};

export type NodeDrag = {
  nodeId: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  nodeStartPositions: Array<{
    nodeId: string;
    x: number;
    y: number;
  }>;
};

export type SelectionBox = {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  additive: boolean;
  hasMoved: boolean;
  baseSelectedNodeIds: string[];
};

export type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WaferDrag = {
  assignmentId: string;
  sourceStepId: string;
  waferLabel: string;
  wafers: Array<{
    assignmentId: string;
    waferLabel: string;
    isDie: boolean;
  }>;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  hasMoved: boolean;
};

export type PendingWaferMove = {
  kind: "submit" | "move";
  wafers: Array<{
    mutationId: string;
    assignmentId: string;
    waferLabel: string;
    isDie: boolean;
  }>;
  sourceStepId: string;
  sourceLabel: string;
  targetStepId: string;
  targetLabel: string;
  waferLabel: string;
  completeSourceStep: boolean;
  revertToPriorStep: boolean;
};

export type SnapGuide = {
  id: string;
  orientation: "horizontal" | "vertical";
  value: number;
  start: number;
  end: number;
};

export type RoleMenu = {
  nodeId: string;
  paneX: number;
  paneY: number;
};

export type ScenePoint = {
  x: number;
  y: number;
};

export type PanePoint = {
  paneX: number;
  paneY: number;
};

export type ZoomAnchor = {
  paneX: number;
  paneY: number;
  sceneX: number;
  sceneY: number;
};

export type GraphViewportFit = {
  centerX: number;
  centerY: number;
  scale: number;
};

export type MoveWaferToProcessStepAction = (input: {
  mutationId: string;
  assignmentId: string;
  sourceStepId: string;
  targetStepId: string;
  note: string;
  completeSourceStep?: boolean;
  revertToPriorStep?: boolean;
}) => Promise<ActionResult<unknown>>;

export type SubmitStepCheckpointAction = (input: {
  stepExecutionId: string;
  mutationId: string;
  notes?: string | null;
  evidence?: Record<string, unknown>;
}) => Promise<ActionResult<unknown>>;

export type WithdrawStepCheckpointAction = (input: {
  attemptId: string;
  mutationId: string;
  reason?: string | null;
}) => Promise<ActionResult<unknown>>;

export type ReviewStepCheckpointAction = (input: {
  attemptId: string;
  decision: "approved" | "redo";
  mutationId: string;
  notes?: string | null;
  redoTargetStepId?: string | null;
}) => Promise<ActionResult<unknown>>;

export type MoveApprovedCheckpointAction = (input: {
  mutationId: string;
  assignmentId: string;
  sourceStepId: string;
  targetStepId: string;
  note: string;
}) => Promise<ActionResult<unknown>>;

export type UpdateStepCheckpointReviewerAction = (input: {
  stepId: string;
  reviewerId: string | null;
}) => Promise<ActionResult<unknown>>;

export type CreateWaferAtProcessStartAction = (input: {
  templateId: string;
  waferCode: string;
  dieCount: number;
}) => Promise<ActionResult<unknown>>;

export type DeleteProcessFlowWaferAction = (input: {
  assignmentId: string;
}) => Promise<ActionResult<unknown>>;

export type CreateProcessFlowStepAction = (input: {
  templateId: string;
  name: string;
  processArea: string;
  nodeType: ProcessStepNodeType;
  canvasX: number;
  canvasY: number;
}) => Promise<ActionResult<PersistedStepPayload>>;

export type UpdateProcessStepPositionsAction = (input: {
  positions: Array<{
    stepId: string;
    canvasX: number;
    canvasY: number;
    expectedCanvasX: number;
    expectedCanvasY: number;
  }>;
}) => Promise<ActionResult<unknown>>;

export type UpdateProcessStepNameAction = (input: {
  stepId: string;
  name: string;
  expectedName: string;
}) => Promise<ActionResult<PersistedStepPayload>>;

export type UpdateProcessStepNodeTypeAction = (input: {
  stepId: string;
  nodeType: ProcessStepNodeType;
}) => Promise<ActionResult<PersistedStepPayload>>;

export type CreateProcessStepTransitionAction = (input: {
  templateId: string;
  fromStepId: string;
  toStepId: string;
  edgeType: ProcessStepTransitionType;
  label?: string | null;
  priority?: number;
}) => Promise<ActionResult<PersistedTransitionPayload>>;

export type DeleteProcessStepsAction = (input: {
  stepIds: string[];
}) => Promise<ActionResult<unknown>>;

export type DeleteProcessTransitionsAction = (input: {
  transitionIds: string[];
}) => Promise<ActionResult<unknown>>;
