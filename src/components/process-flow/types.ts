import type { ActionResult } from "@/lib/action-result";
import type { Json, ProcessStepExecutionMode, ProcessStepNodeType, ProcessStepTransitionType, StepStatus, StepParameterRecord } from "@/types/database";

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
  canUndoHistory?: boolean;
  historyCorrectionCount?: number;
  canCorrectCheckpointRoute?: boolean;
  checkpointRouteSourceStepId?: string | null;
  isArchivable?: boolean;
  anytimeReturnStepId?: string | null;
  anytimeReturnStepName?: string | null;
};

export type ProcessArchiveItem = {
  assignmentId: string;
  waferId: string;
  waferCode: string;
  dieLabel: string | null;
  archivedAt: string;
  archivedByName: string | null;
  completedAt: string | null;
};

export type DiagramStep = {
  id: string;
  name: string;
  process_area: string;
  step_order: number;
  node_type?: ProcessStepNodeType;
  execution_mode?: ProcessStepExecutionMode;
  canvas_x?: number | null;
  canvas_y?: number | null;
  required_reviewer_id?: string | null;
  required_reviewer_name?: string | null;
  parameters_schema?: Json;
  revision: number;
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
  execution_mode: ProcessStepExecutionMode;
  canvas_x: number | null;
  canvas_y: number | null;
  parameters_schema: Json;
  revision: number;
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
  executionMode: ProcessStepExecutionMode;
  order: number;
  requiredReviewerId?: string | null;
  requiredReviewerName?: string | null;
  parametersSchema: Json;
  revision: number;
  isOptimistic?: boolean;
};

export type SaveStepParameterRecordAction = (input: {
  assignmentId: string;
  stepId: string;
  movementMutationId: string;
  globalValues: Record<string, string | number | boolean | null>;
  notes: string | null;
  localParameters: Array<{
    id: string;
    key: string;
    label: string;
    type: "text" | "number" | "boolean" | "select";
    unit: string;
    value: string | number | boolean | null;
    notes: string;
    scope: "local" | "global";
  }>;
}) => Promise<ActionResult<StepParameterRecord>>;

export type SaveStepParameterRecordsBatchAction = (input: {
  entries: Array<{
    assignmentId: string;
    stepId: string;
    movementMutationId: string;
  }>;
  globalValues: Record<string, string | number | boolean | null>;
  notes: string | null;
  localParameters: Array<{
    id: string;
    key: string;
    label: string;
    type: "text" | "number" | "boolean" | "select";
    unit: string;
    value: string | number | boolean | null;
    notes: string;
    scope: "local" | "global";
  }>;
}) => Promise<ActionResult<StepParameterRecord[]>>;

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
  clientX: number;
  clientY: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  canMove: boolean;
  hasMoved: boolean;
};

export type PendingWaferMove = {
  kind: "submit" | "move";
  batchId: string | null;
  wafers: Array<{
    mutationId: string;
    checkpointMutationId: string;
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
  batchId: string;
  notes?: string | null;
  evidence?: Record<string, unknown>;
}) => Promise<ActionResult<unknown>>;

export type RouteCheckpointAction = (input: {
  batchId: string;
  attemptId: string;
  targetStepId: string;
  decisionMutationId: string;
  movementMutationId: string;
  note: string;
}) => Promise<ActionResult<unknown>>;

export type MoveApprovedCheckpointAction = (input: {
  batchId: string;
  mutationId: string;
  assignmentId: string;
  sourceStepId: string;
  targetStepId: string;
  note: string;
  correctCheckpointRoute?: boolean;
}) => Promise<ActionResult<unknown>>;

export type ProcessFlowMutationRequest =
  | ({
      kind: "submit";
      assignmentId: string;
    } & Parameters<SubmitStepCheckpointAction>[0])
  | ({ kind: "move" } & Parameters<MoveApprovedCheckpointAction>[0])
  | ({
      kind: "route";
      assignmentId: string;
    } & Parameters<RouteCheckpointAction>[0]);

export type ProcessFlowMutationOutcome = {
  operationId: string;
  assignmentId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
};

export type PersistProcessFlowMutationsBatchAction = (input: {
  mutations: ProcessFlowMutationRequest[];
}) => Promise<ActionResult<ProcessFlowMutationOutcome[]>>;

export type ProcessFlowSyncState =
  | "saving_move"
  | "awaiting_parameters"
  | "saving_parameters"
  | "uploading_files"
  | "synced"
  | "failed";

export type UndoDieProcessHistoryAction = (input: {
  mutationId: string;
  assignmentId: string;
  expectedStepId: string;
  expectedStepStatus: Exclude<StepStatus, "pending" | "skipped" | "failed">;
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

export type ArchiveCompletedProcessWafersAction = (input: {
  templateId: string;
  items: Array<{
    assignmentId: string;
    mutationId: string;
  }>;
}) => Promise<ActionResult<unknown>>;

export type RestoreArchivedProcessWaferAction = (input: {
  templateId: string;
  waferId: string;
  archivedAssignmentId: string;
  targetStepId: string;
  mutationId: string;
}) => Promise<ActionResult<unknown>>;

export type CreateProcessFlowStepAction = (input: {
  templateId: string;
  name: string;
  processArea: string;
  nodeType: ProcessStepNodeType;
  canvasX: number;
  canvasY: number;
  parametersSchema: Record<string, Json | undefined>;
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

export type UpdateProcessStepExecutionModeAction = (input: {
  stepId: string;
  executionMode: ProcessStepExecutionMode;
}) => Promise<ActionResult<PersistedStepPayload>>;

export type UpdateProcessStepTemplateAction = (input: {
  stepId: string;
  expectedRevision: number;
  parametersSchema: Record<string, Json | undefined>;
}) => Promise<ActionResult<PersistedStepPayload>>;

export type ProcessFlowActions = {
  createStep?: CreateProcessFlowStepAction;
  createWafer?: CreateWaferAtProcessStartAction;
  updatePositions?: UpdateProcessStepPositionsAction;
  updateName?: UpdateProcessStepNameAction;
  updateExecutionMode?: UpdateProcessStepExecutionModeAction;
  updateStepTemplate?: UpdateProcessStepTemplateAction;
  createTransition?: CreateProcessStepTransitionAction;
  deleteSteps?: DeleteProcessStepsAction;
  deleteTransitions?: DeleteProcessTransitionsAction;
  deleteWafer?: DeleteProcessFlowWaferAction;
  archiveWafers?: ArchiveCompletedProcessWafersAction;
  restoreWafer?: RestoreArchivedProcessWaferAction;
  submitCheckpoint?: SubmitStepCheckpointAction;
  routeCheckpoint?: RouteCheckpointAction;
  moveApprovedWafer?: MoveApprovedCheckpointAction;
  persistMutationsBatch?: PersistProcessFlowMutationsBatchAction;
  undoHistory?: UndoDieProcessHistoryAction;
  saveParameters?: SaveStepParameterRecordAction;
  saveParameterRecordsBatch?: SaveStepParameterRecordsBatchAction;
  updateReviewer?: UpdateStepCheckpointReviewerAction;
};

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
