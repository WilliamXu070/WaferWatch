import type { Database as GeneratedDatabase } from "./database.generated";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = "admin" | "process_engineer" | "researcher" | "viewer";
export type ProjectMemberRole = "owner" | "editor" | "viewer";
export type ProjectStatus = "active" | "archived";
export type ProjectVisibility = "private" | "group";
export type FabricationStatus =
  | "planned"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "scrapped";
export type StepStatus =
  | "pending"
  | "queued"
  | "running"
  | "blocked"
  | "awaiting_checkpoint"
  | "ready_to_move"
  | "redo_required"
  | "completed"
  | "skipped"
  | "failed";
export type ToolStatus = "available" | "maintenance" | "offline" | "reserved";
export type ReservationStatus = "scheduled" | "cancelled" | "completed";
export type IssueSeverity = "low" | "medium" | "high" | "critical";
export type IssueStatus = "open" | "investigating" | "resolved" | "closed";
export type ProcessStepNodeType = "start" | "procedure" | "end";
export type ProcessStepTransitionType = "flow" | "return";
export type ProcessStepExecutionMode = "main" | "anytime";
export type ProcessTemplateLifecycleStatus = "draft" | "published";
export type CheckpointDecisionValue = "approved" | "redo";
export type PlanRevisionStatus = "draft" | "published" | "superseded";
export type OperationRunKind = "normal" | "redo" | "rework" | "restore" | "ad_hoc";
export type OperationRunStatus =
  | "queued"
  | "running"
  | "blocked"
  | "completed"
  | "awaiting_review"
  | "redo_required"
  | "failed"
  | "cancelled";
export type OperationRunMemberStatus =
  | "queued"
  | "running"
  | "blocked"
  | "completed"
  | "awaiting_review"
  | "redo_required"
  | "rejected"
  | "failed"
  | "skipped"
  | "cancelled";
export type OperationResourceKind = "person" | "tool" | "recipe" | "location";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  lab_group: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  visibility: ProjectVisibility;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
};

export type ProjectMember = {
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  created_at: string;
};

export type ProcessTemplate = {
  id: string;
  owner_project_id: string | null;
  name: string;
  version: string;
  description: string | null;
  is_active: boolean;
  lifecycle_status: ProcessTemplateLifecycleStatus;
  source_template_id: string | null;
  published_at: string | null;
  published_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProcessStep = {
  id: string;
  template_id: string;
  step_order: number;
  name: string;
  slug: string;
  process_area: string;
  node_type: ProcessStepNodeType;
  execution_mode: ProcessStepExecutionMode;
  canvas_x: number | null;
  canvas_y: number | null;
  expected_duration_minutes: number | null;
  queue_target_minutes: number | null;
  required_tool_type: string | null;
  requires_recipe: boolean;
  instructions: string | null;
  parameters_schema: Json;
  required_reviewer_id: string | null;
  archived_at: string | null;
  stage_id: string;
  stage_step_order: number;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type ProcessStepTransition = {
  id: string;
  template_id: string;
  from_step_id: string;
  to_step_id: string;
  edge_type: ProcessStepTransitionType;
  label: string | null;
  condition: Json;
  priority: number;
  created_at: string;
  updated_at: string;
};

export type FabricationTool = {
  id: string;
  name: string;
  tool_type: string;
  location: string | null;
  status: ToolStatus;
  owner_profile_id: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type Recipe = {
  id: string;
  tool_id: string | null;
  process_step_id: string | null;
  name: string;
  version: string;
  parameters: Json;
  file_path: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WaferLot = {
  id: string;
  project_id: string;
  lot_code: string;
  substrate_material: string | null;
  wafer_size_mm: number | null;
  status: FabricationStatus;
  started_at: string | null;
  target_completion_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type Wafer = {
  id: string;
  project_id: string;
  lot_id: string | null;
  wafer_code: string;
  item_type: "wafer" | "die";
  parent_wafer_id: string | null;
  die_label: string | null;
  wafer_family: string;
  die_count: number | null;
  material_stack: string | null;
  diameter_mm: number | null;
  status: FabricationStatus;
  notes: string | null;
  metadata: Json;
  archived_at: string | null;
  archived_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WaferProcessAssignment = {
  id: string;
  wafer_id: string;
  template_id: string;
  assigned_by: string | null;
  status: FabricationStatus;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  current_step_id: string | null;
  anytime_return_step_id: string | null;
  current_operation_run_member_id: string | null;
  archived_at: string | null;
  archived_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  revision: number;
};

export type StepExecution = {
  id: string;
  assignment_id: string;
  wafer_id: string;
  process_step_id: string;
  recipe_id: string | null;
  tool_id: string | null;
  status: StepStatus;
  planned_start_at: string | null;
  planned_end_at: string | null;
  queue_started_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  completed_by: string | null;
  operator_id: string | null;
  run_notes: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type StepParameterRecord = {
  id: string;
  project_id: string;
  wafer_id: string;
  assignment_id: string;
  process_step_id: string;
  step_execution_id: string | null;
  process_event_id: string;
  movement_mutation_id: string;
  schema_snapshot: Json;
  global_values: Json;
  local_parameters: Json;
  notes: string | null;
  recorded_by: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type ProcessStepAttempt = {
  id: string;
  assignment_id: string;
  wafer_id: string;
  template_id: string;
  process_step_id: string;
  step_execution_id: string;
  attempt_number: number;
  submitted_by: string | null;
  submitted_at: string;
  started_at_snapshot: string | null;
  submission_notes: string | null;
  evidence_snapshot: Json;
  batch_id: string | null;
  operation_run_member_id: string | null;
  submission_group_id: string | null;
  wafer_code_snapshot: string;
  template_name_snapshot: string;
  template_version_snapshot: string;
  process_step_name_snapshot: string;
  process_step_order_snapshot: number;
  reviewer_id_snapshot: string | null;
  reviewer_name_snapshot: string;
  submitted_by_name_snapshot: string;
  prior_step_status: StepStatus;
  client_mutation_id: string;
  created_at: string;
};

export type ProcessBatchHistoryView = {
  id: string;
  batch_id: string | null;
  template_id: string;
  process_step_id: string;
  process_name: string;
  submitted_at: string;
  operator_name: string;
  note: string | null;
  status: string;
  sample_count: number;
  samples: Json;
};

export type CheckpointDecision = {
  id: string;
  attempt_id: string;
  assignment_id: string;
  wafer_id: string;
  template_id: string;
  process_step_id: string;
  step_execution_id: string;
  decision: CheckpointDecisionValue;
  decided_by: string | null;
  decided_at: string;
  decision_notes: string | null;
  target_step_id: string | null;
  wafer_code_snapshot: string;
  process_step_name_snapshot: string;
  process_step_order_snapshot: number;
  target_step_name_snapshot: string | null;
  target_step_order_snapshot: number | null;
  decided_by_name_snapshot: string;
  client_mutation_id: string;
  created_at: string;
};

export type CheckpointSubmissionWithdrawal = {
  id: string;
  attempt_id: string;
  assignment_id: string;
  wafer_id: string;
  template_id: string;
  process_step_id: string;
  step_execution_id: string;
  withdrawn_by: string | null;
  withdrawn_at: string;
  withdrawal_reason: string | null;
  wafer_code_snapshot: string;
  process_step_name_snapshot: string;
  withdrawn_by_name_snapshot: string;
  client_mutation_id: string;
  created_at: string;
};

export type CheckpointReviewerReassignment = {
  id: string;
  template_id: string;
  process_step_id: string;
  previous_reviewer_id: string | null;
  new_reviewer_id: string;
  changed_by: string;
  transaction_id: number;
  reason: string;
  previous_reviewer_name_snapshot: string;
  new_reviewer_name_snapshot: string;
  changed_by_name_snapshot: string;
  client_mutation_id: string;
  changed_at: string;
};

export type ToolReservation = {
  id: string;
  project_id: string;
  tool_id: string;
  step_execution_id: string | null;
  reserved_by: string | null;
  starts_at: string;
  ends_at: string;
  status: ReservationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProcessPerson = {
  id: string;
  display_name: string;
  profile_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProcessCalendarEvent = {
  id: string;
  process_template_id: string;
  wafer_id: string | null;
  location: string;
  location_id: string | null;
  starts_at: string;
  ends_at: string;
  process_step_id: string | null;
  batch_id: string | null;
  process_step_name_snapshot: string | null;
  manual_action: string | null;
  description: string | null;
  created_by: string | null;
  revision: number;
  client_mutation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProcessBatch = {
  id: string;
  template_id: string;
  process_step_id: string;
  created_by: string | null;
  created_at: string;
  note: string | null;
  origin: "arrival" | "legacy_active" | "split" | "merge" | "restore";
};

export type ProcessBatchMember = {
  id: string;
  batch_id: string;
  assignment_id: string;
  wafer_id: string;
  process_step_id: string;
  step_execution_id: string;
  created_at: string;
};

export type ProcessBatchLink = {
  id: string;
  parent_batch_id: string;
  child_batch_id: string;
  link_kind: "successor" | "split" | "merge" | "restore";
  created_at: string;
};

export type ProcessCalendarEventPerson = {
  event_id: string;
  person_id: string;
  created_at: string;
};

export type Measurement = {
  id: string;
  project_id: string;
  wafer_id: string;
  step_execution_id: string | null;
  measured_by: string | null;
  measurement_type: string;
  metric_name: string;
  metric_value: number | null;
  metric_unit: string | null;
  measured_at: string;
  data: Json;
  file_path: string | null;
  created_at: string;
};

export type Attachment = {
  id: string;
  project_id: string;
  wafer_id: string | null;
  step_execution_id: string | null;
  measurement_id: string | null;
  bucket_name: string;
  object_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

export type DieInspection = {
  id: string;
  project_id: string;
  wafer_id: string;
  die_code: string;
  pattern_row: number;
  pattern_column: number;
  x_ratio: number;
  y_ratio: number;
  image_bucket: string;
  image_path: string;
  image_mime_type: string;
  image_size_bytes: number;
  image_file_name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TextSurface = {
  id: string;
  project_id: string;
  scope_type: string;
  scope_key: string;
  field_key: string;
  value: string;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProcessIssue = {
  id: string;
  project_id: string;
  wafer_id: string | null;
  step_execution_id: string | null;
  reported_by: string | null;
  assigned_to: string | null;
  severity: IssueSeverity;
  status: IssueStatus;
  title: string;
  description: string | null;
  resolution: string | null;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
};

export type ProcessEvent = {
  id: string;
  project_id: string;
  wafer_id: string | null;
  step_execution_id: string | null;
  actor_id: string | null;
  event_type: string;
  event_at: string;
  notes: string | null;
  metadata: Json;
  client_mutation_id: string | null;
  operation_run_id: string | null;
  operation_run_member_id: string | null;
  process_plan_revision_id: string | null;
  planned_operation_id: string | null;
};

export type ProcessStage = {
  id: string;
  template_id: string;
  name: string;
  slug: string;
  stage_order: number;
  canvas_x: number | null;
  canvas_y: number | null;
  revision: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FabricationLocation = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  travel_group: string | null;
  is_active: boolean;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type ProcessPlan = {
  id: string;
  project_id: string;
  template_id: string;
  name: string;
  is_active: boolean;
  shared_draft_revision_id: string | null;
  current_published_revision_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProcessPlanRevision = {
  id: string;
  plan_id: string;
  revision_number: number;
  status: PlanRevisionStatus;
  based_on_revision_id: string | null;
  planning_starts_at: string;
  planning_ends_at: string;
  row_version: number;
  created_by: string | null;
  created_at: string;
  published_by: string | null;
  published_at: string | null;
  superseded_at: string | null;
};

export type PlannedBatch = {
  id: string;
  revision_id: string;
  logical_id: string;
  name: string;
  note: string | null;
  row_version: number;
  user_pinned: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PlannedBatchMember = {
  id: string;
  planned_batch_id: string;
  assignment_id: string;
  added_by: string | null;
  created_at: string;
};

export type PlannedOperation = {
  id: string;
  revision_id: string;
  logical_id: string;
  process_step_id: string;
  planned_batch_id: string | null;
  name: string;
  description: string | null;
  scheduled_start_at: string;
  scheduled_end_at: string;
  status: "planned" | "ready" | "cancelled";
  user_pinned: boolean;
  row_version: number;
  legacy_calendar_event_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PlannedOperationDependency = {
  id: string;
  revision_id: string;
  predecessor_operation_id: string;
  successor_operation_id: string;
  dependency_kind: "finish_to_start";
  lag_minutes: number;
  created_at: string;
};

export type PlannedOperationParameter = {
  id: string;
  planned_operation_id: string;
  assignment_id: string | null;
  parameter_key: string;
  scope: "global" | "member";
  value: Json;
  schema_snapshot: Json;
  row_version: number;
  created_at: string;
  updated_at: string;
};

export type PlannedOperationResource = {
  id: string;
  planned_operation_id: string;
  resource_kind: OperationResourceKind;
  person_id: string | null;
  tool_id: string | null;
  recipe_id: string | null;
  location_id: string | null;
  quantity: number;
  row_version: number;
  created_at: string;
  updated_at: string;
};

export type OperationRun = {
  id: string;
  template_id: string;
  process_step_id: string;
  planned_operation_id: string | null;
  run_kind: OperationRunKind;
  status: OperationRunStatus;
  reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  revision: number;
  client_mutation_id: string | null;
  legacy_batch_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OperationRunMember = {
  id: string;
  operation_run_id: string;
  assignment_id: string;
  wafer_id: string;
  status: OperationRunMemberStatus;
  note: string | null;
  started_at: string | null;
  completed_at: string | null;
  revision: number;
  legacy_step_execution_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OperationRunLink = {
  id: string;
  parent_run_id: string;
  child_run_id: string;
  link_kind: "successor" | "redo" | "split" | "merge" | "restore";
  created_at: string;
};

export type OperationRunParameterRecord = {
  id: string;
  operation_run_id: string;
  operation_run_member_id: string | null;
  scope: "global" | "member";
  schema_snapshot: Json;
  values: Json;
  recorded_by: string | null;
  recorded_at: string;
  supersedes_record_id: string | null;
  correction_reason: string | null;
  client_mutation_id: string | null;
};

export type OperationRunNote = {
  id: string;
  operation_run_id: string;
  operation_run_member_id: string | null;
  note_kind: "general" | "completion" | "error" | "redo" | "correction";
  body: string;
  created_by: string | null;
  created_at: string;
  supersedes_note_id: string | null;
  correction_reason: string | null;
  client_mutation_id: string | null;
};

export type OperationRunResource = {
  id: string;
  operation_run_id: string;
  operation_run_member_id: string | null;
  resource_kind: OperationResourceKind;
  person_id: string | null;
  tool_id: string | null;
  recipe_id: string | null;
  location_id: string | null;
  resource_snapshot: Json;
  recorded_by: string | null;
  recorded_at: string;
};

export type WorkflowRevision = {
  template_id: string;
  current_revision: number;
  updated_at: string;
};

export type WorkflowChangeLog = {
  id: string;
  template_id: string;
  revision: number;
  client_mutation_id: string;
  mutation_kind: string;
  changed_entities: Json;
  actor_id: string | null;
  committed_at: string;
};

export type PlanReplanRequest = {
  id: string;
  plan_id: string;
  draft_revision_id: string;
  source_run_id: string | null;
  request_kind: "redo" | "delay" | "resource_change" | "manual";
  requested_change: Json;
  status: "pending" | "processing" | "proposed" | "failed" | "applied" | "dismissed";
  requested_by: string | null;
  requested_at: string;
  processed_at: string | null;
  client_mutation_id: string;
};

export type PlanAdjustmentProposal = {
  id: string;
  request_id: string;
  plan_id: string;
  draft_revision_id: string;
  base_draft_row_version: number;
  status: "ready" | "applied" | "stale" | "dismissed";
  moved_operations: Json;
  unresolved_conflicts: Json;
  scheduler_version: string;
  generated_at: string;
  applied_by: string | null;
  applied_at: string | null;
};

export type ProcessCurrentStateView = {
  assignment_id: string;
  project_id: string;
  template_id: string;
  wafer_id: string;
  wafer_code: string;
  item_type: "wafer" | "die";
  parent_wafer_id: string | null;
  die_label: string | null;
  wafer_family: string;
  die_count: number | null;
  wafer_notes: string | null;
  wafer_created_at: string;
  wafer_metadata: Json;
  wafer_status: FabricationStatus;
  assignment_status: FabricationStatus;
  assignment_revision: number;
  current_step_id: string | null;
  anytime_return_step_id: string | null;
  current_step_name: string | null;
  current_step_slug: string | null;
  current_step_order: number | null;
  current_stage_id: string | null;
  current_stage_name: string | null;
  current_stage_slug: string | null;
  current_stage_order: number | null;
  current_operation_run_member_id: string | null;
  current_operation_run_id: string | null;
  current_member_status: OperationRunMemberStatus | null;
  current_member_revision: number | null;
  current_run_kind: OperationRunKind | null;
  current_run_status: OperationRunStatus | null;
  current_run_revision: number | null;
  planned_operation_id: string | null;
  legacy_step_execution_id: string | null;
  current_tool_id: string | null;
  current_handler_id: string | null;
  current_handler_name: string | null;
  required_reviewer_id: string | null;
  required_reviewer_name: string | null;
  latest_attempt_id: string | null;
  latest_attempt_submitted_by: string | null;
  latest_attempt_notes: string | null;
  latest_submitted_at: string | null;
  latest_review_status: string | null;
  next_step_name: string | null;
  checkpoint_route_source_step_id: string | null;
  can_correct_checkpoint_route: boolean;
  stage_progress: Json;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
};

export type OperationRunHistoryView = Record<string, Json | undefined> & {
  operation_run_member_id: string;
  operation_run_id: string;
  template_id: string;
  project_id: string;
  assignment_id: string;
  wafer_id: string;
  process_step_id: string;
  member_status: OperationRunMemberStatus;
  run_status: OperationRunStatus;
  created_at: string;
};

export type BatchRunStateView = Record<string, Json | undefined> & {
  operation_run_id: string;
  template_id: string;
  process_step_id: string;
  run_status: OperationRunStatus;
  member_status: string;
  member_count: number;
  members: Json;
  created_at: string;
};

export type PlanCurrentStateView = Record<string, Json | undefined> & {
  plan_id: string;
  project_id: string;
  template_id: string;
  plan_revision_id: string;
  revision_status: PlanRevisionStatus;
  is_shared_draft: boolean;
  is_current_published: boolean;
  planned_operation_id: string;
  process_step_id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  operation_row_version: number;
};

export type AuditEvent = {
  id: string;
  actor_id: string | null;
  entity_table: string;
  entity_id: string;
  action: string;
  before_state: Json | null;
  after_state: Json | null;
  created_at: string;
};

export type TeamMessage = {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export type WaferCycleTimeMetric = {
  assignment_id: string;
  wafer_id: string;
  wafer_code: string;
  project_id: string;
  template_id: string;
  status: FabricationStatus;
  started_at: string | null;
  completed_at: string | null;
  total_cycle_hours: number | null;
  completed_steps: number;
  total_steps: number;
};

export type StepCycleMetric = {
  step_execution_id: string;
  project_id: string;
  wafer_id: string;
  wafer_code: string;
  step_name: string;
  process_area: string;
  status: StepStatus;
  queue_minutes: number | null;
  run_minutes: number | null;
  expected_duration_minutes: number | null;
  completed_at: string | null;
};

export type WipByStageMetric = {
  project_id: string;
  template_id: string;
  process_area: string;
  step_name: string;
  status: StepStatus;
  wafer_count: number;
};

export type ToolUtilizationMetric = {
  tool_id: string;
  tool_name: string;
  utilization_day: string;
  reserved_minutes: number;
  completed_run_minutes: number;
};

type GeneratedPublic = GeneratedDatabase["public"];
type GeneratedTables = GeneratedPublic["Tables"];
type GeneratedViews = GeneratedPublic["Views"];
type GeneratedFunctions = GeneratedPublic["Functions"];
type WithArgs<FunctionContract, Args> = Omit<FunctionContract, "Args"> & { Args: Args };
type NullableArgs<Args, Keys extends keyof Args> = Omit<Args, Keys> & {
  [Key in Keys]: Args[Key] | null;
};

type ProcessStepInsert = Omit<
  GeneratedTables["process_steps"]["Insert"],
  "stage_id" | "stage_step_order" | "node_type" | "execution_mode"
> & {
  stage_id?: string;
  stage_step_order?: number;
  node_type?: ProcessStepNodeType;
  execution_mode?: ProcessStepExecutionMode;
};

type RuntimeTables = Omit<GeneratedTables, "process_templates" | "process_steps" | "process_step_transitions"> & {
  process_templates: Omit<GeneratedTables["process_templates"], "Row" | "Insert" | "Update"> & {
    Row: ProcessTemplate;
    Insert: Omit<GeneratedTables["process_templates"]["Insert"], "lifecycle_status"> & {
      lifecycle_status?: ProcessTemplateLifecycleStatus;
    };
    Update: Omit<GeneratedTables["process_templates"]["Update"], "lifecycle_status"> & {
      lifecycle_status?: ProcessTemplateLifecycleStatus;
    };
  };
  process_steps: Omit<GeneratedTables["process_steps"], "Row" | "Insert" | "Update"> & {
    Row: ProcessStep;
    Insert: ProcessStepInsert;
    Update: Partial<ProcessStepInsert>;
  };
  process_step_transitions: Omit<GeneratedTables["process_step_transitions"], "Row"> & {
    Row: ProcessStepTransition;
  };
};

type RuntimeFunctions = Omit<
  GeneratedFunctions,
  | "assign_process_step_checkpoint_reviewer"
  | "correct_wafer_process_history"
  | "create_calendar_schedule_item"
  | "create_plan_replan_request"
  | "create_planned_batch"
  | "create_planned_operation"
  | "save_operation_parameter_records_batch"
  | "start_operation_run"
  | "update_calendar_schedule_item"
  | "upsert_text_surface_versioned"
> & {
  assign_process_step_checkpoint_reviewer: WithArgs<
    Omit<GeneratedFunctions["assign_process_step_checkpoint_reviewer"], "Returns"> & { Returns: ProcessStep },
    NullableArgs<GeneratedFunctions["assign_process_step_checkpoint_reviewer"]["Args"], "reviewer_id">
  >;
  correct_wafer_process_history: WithArgs<
    GeneratedFunctions["correct_wafer_process_history"],
    NullableArgs<
      GeneratedFunctions["correct_wafer_process_history"]["Args"],
      "anchor_visit_id" | "completed_at" | "placement" | "target_step_id"
    >
  >;
  create_calendar_schedule_item: WithArgs<
    GeneratedFunctions["create_calendar_schedule_item"],
    NullableArgs<
      GeneratedFunctions["create_calendar_schedule_item"]["Args"],
      "description" | "manual_action" | "target_step_id" | "target_wafer_id"
    >
  >;
  create_plan_replan_request: WithArgs<
    GeneratedFunctions["create_plan_replan_request"],
    NullableArgs<GeneratedFunctions["create_plan_replan_request"]["Args"], "source_run_id">
  >;
  create_planned_batch: WithArgs<
    GeneratedFunctions["create_planned_batch"],
    NullableArgs<GeneratedFunctions["create_planned_batch"]["Args"], "batch_note">
  >;
  create_planned_operation: WithArgs<
    GeneratedFunctions["create_planned_operation"],
    NullableArgs<GeneratedFunctions["create_planned_operation"]["Args"], "target_batch_id">
  >;
  save_operation_parameter_records_batch: WithArgs<
    GeneratedFunctions["save_operation_parameter_records_batch"],
    Omit<GeneratedFunctions["save_operation_parameter_records_batch"]["Args"], "notes"> & { notes?: string | null }
  >;
  start_operation_run: WithArgs<
    GeneratedFunctions["start_operation_run"],
    NullableArgs<GeneratedFunctions["start_operation_run"]["Args"], "planned_operation_id" | "reason">
  >;
  update_calendar_schedule_item: WithArgs<
    GeneratedFunctions["update_calendar_schedule_item"],
    NullableArgs<
      GeneratedFunctions["update_calendar_schedule_item"]["Args"],
      "description" | "manual_action" | "target_step_id" | "target_wafer_id"
    >
  >;
  upsert_text_surface_versioned: WithArgs<
    GeneratedFunctions["upsert_text_surface_versioned"],
    Omit<GeneratedFunctions["upsert_text_surface_versioned"]["Args"], "expected_version"> & {
      expected_version?: number | null;
    }
  >;
};

type RuntimeViews = Omit<GeneratedViews, "vw_process_current_state"> & {
  vw_process_current_state: Omit<GeneratedViews["vw_process_current_state"], "Row"> & {
    Row: ProcessCurrentStateView;
  };
};

// The linked-Supabase output is authoritative. These narrow overrides express
// check-constrained text values, nullable RPC inputs, and the stage trigger's
// optional insert fields that PostgreSQL introspection cannot infer.
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedPublic, "Tables" | "Views" | "Functions"> & {
    Tables: RuntimeTables;
    Views: RuntimeViews;
    Functions: RuntimeFunctions;
  };
};
