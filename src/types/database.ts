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
export type ProcessTemplateLifecycleStatus = "draft" | "published";
export type CheckpointDecisionValue = "approved" | "redo";

type Row<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

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
  starts_at: string;
  ends_at: string;
  process_step_id: string | null;
  process_step_name_snapshot: string | null;
  manual_action: string | null;
  description: string | null;
  created_by: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
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

export interface Database {
  public: {
    Tables: {
      profiles: Row<Profile>;
      projects: Row<Project>;
      project_members: Row<ProjectMember>;
      process_templates: Row<ProcessTemplate>;
      process_steps: Row<ProcessStep>;
      process_step_transitions: Row<ProcessStepTransition>;
      fabrication_tools: Row<FabricationTool>;
      recipes: Row<Recipe>;
      wafer_lots: Row<WaferLot>;
      wafers: Row<Wafer>;
      wafer_process_assignments: Row<WaferProcessAssignment>;
      step_executions: Row<StepExecution>;
      step_parameter_records: Row<StepParameterRecord>;
      process_step_attempts: Row<ProcessStepAttempt>;
      checkpoint_decisions: Row<CheckpointDecision>;
      checkpoint_submission_withdrawals: Row<CheckpointSubmissionWithdrawal>;
      checkpoint_reviewer_reassignments: Row<CheckpointReviewerReassignment>;
      tool_reservations: Row<ToolReservation>;
      process_people: Row<ProcessPerson>;
      process_calendar_events: Row<ProcessCalendarEvent>;
      process_calendar_event_people: Row<ProcessCalendarEventPerson>;
      measurements: Row<Measurement>;
      attachments: Row<Attachment>;
      die_inspections: Row<DieInspection>;
      text_surfaces: Row<TextSurface>;
      process_issues: Row<ProcessIssue>;
      process_events: Row<ProcessEvent>;
      audit_events: Row<AuditEvent>;
      team_messages: Row<TeamMessage>;
    };
    Views: {
      vw_wafer_cycle_time: { Row: WaferCycleTimeMetric; Relationships: [] };
      vw_step_cycle_metrics: { Row: StepCycleMetric; Relationships: [] };
      vw_wip_by_stage: { Row: WipByStageMetric; Relationships: [] };
      vw_tool_utilization_daily: { Row: ToolUtilizationMetric; Relationships: [] };
    };
    Functions: {
      can_access_project: {
        Args: { target_project_id: string | null };
        Returns: boolean;
      };
      can_edit_project: {
        Args: { target_project_id: string | null };
        Returns: boolean;
      };
      can_access_wafer: {
        Args: { target_wafer_id: string | null };
        Returns: boolean;
      };
      can_access_step_execution: {
        Args: { target_step_execution_id: string | null };
        Returns: boolean;
      };
      claim_wafer_assignment_move: {
        Args: {
          target_assignment_id: string;
          expected_source_step_id: string;
          next_step_id: string;
        };
        Returns: WaferProcessAssignment;
      };
      upsert_text_surface_versioned: {
        Args: {
          target_project_id: string;
          target_scope_type: string;
          target_scope_key: string;
          target_field_key: string;
          next_value: string;
          expected_version?: number | null;
        };
        Returns: TextSurface;
      };
      mutate_text_surface_json_array: {
        Args: {
          target_project_id: string;
          target_scope_type: string;
          target_scope_key: string;
          target_field_key: string;
          operation: "add" | "update" | "delete";
          item_id: string;
          item?: Json | null;
        };
        Returns: TextSurface;
      };
      patch_wafer_die_poling_parameters: {
        Args: {
          target_wafer_id: string;
          target_die_code: string;
          updates: Json;
        };
        Returns: Wafer;
      };
      update_process_step_positions_versioned: {
        Args: { position_updates: Json };
        Returns: ProcessStep[];
      };
      duplicate_process_template_version: {
        Args: { source_template_id: string; next_version: string; next_name?: string | null };
        Returns: ProcessTemplate;
      };
      publish_process_template_version: {
        Args: { target_template_id: string };
        Returns: ProcessTemplate;
      };
      normalize_draft_process_step_order: {
        Args: { target_template_id: string; moved_step_id: string; target_position: number };
        Returns: ProcessStep[];
      };
      create_ordered_draft_process_step: {
        Args: {
          target_template_id: string;
          target_position: number;
          step_name: string;
          step_slug: string;
          step_process_area: string;
          reviewer_id?: string | null;
          step_expected_duration_minutes?: number | null;
          step_queue_target_minutes?: number | null;
          step_required_tool_type?: string | null;
          step_requires_recipe?: boolean;
          step_instructions?: string | null;
          step_parameters_schema?: Json;
          step_canvas_x?: number | null;
          step_canvas_y?: number | null;
        };
        Returns: ProcessStep;
      };
      archive_draft_process_step: {
        Args: { target_step_id: string };
        Returns: ProcessStep;
      };
      assign_draft_process_step_reviewer: {
        Args: { target_step_id: string; reviewer_id: string | null };
        Returns: ProcessStep;
      };
      submit_step_checkpoint: {
        Args: {
          target_step_execution_id: string;
          mutation_id: string;
          notes?: string | null;
          evidence?: Json;
        };
        Returns: ProcessStepAttempt;
      };
      withdraw_step_checkpoint_submission: {
        Args: { target_attempt_id: string; mutation_id: string; reason?: string | null };
        Returns: CheckpointSubmissionWithdrawal;
      };
      review_step_checkpoint: {
        Args: {
          target_attempt_id: string;
          review_decision: CheckpointDecisionValue;
          mutation_id: string;
          notes?: string | null;
          redo_target_step_id?: string | null;
        };
        Returns: CheckpointDecision;
      };
      review_dicing_step_checkpoint: {
        Args: {
          target_attempt_id: string;
          mutation_id: string;
          notes?: string | null;
          child_specs?: Json;
        };
        Returns: CheckpointDecision;
      };
      reconcile_dicing_checkpoint_split: {
        Args: {
          target_decision_id: string;
          target_child_wafer_ids: string[];
        };
        Returns: Json;
      };
      reassign_unavailable_checkpoint_reviewer: {
        Args: {
          target_step_id: string;
          replacement_reviewer_id: string;
          mutation_id: string;
          reason: string;
        };
        Returns: CheckpointReviewerReassignment;
      };
      assign_process_step_checkpoint_reviewer: {
        Args: { target_step_id: string; reviewer_id: string | null };
        Returns: ProcessStep;
      };
      move_approved_checkpoint_assignment: {
        Args: {
          target_assignment_id: string;
          target_step_id: string;
          mutation_id: string;
          notes: string;
        };
        Returns: Json;
      };
      route_checkpoint_submission: {
        Args: {
          target_attempt_id: string;
          target_step_id: string;
          decision_mutation_id: string;
          movement_mutation_id: string;
          notes: string;
          child_specs?: Json;
        };
        Returns: Json;
      };
      soft_delete_process_flow_wafer_family: {
        Args: {
          target_project_id: string;
          target_wafer_ids: string[];
        };
        Returns: { wafer_id: string }[];
      };
      archive_completed_wafer_assignments: {
        Args: {
          target_assignment_ids: string[];
          mutation_ids: string[];
        };
        Returns: Array<{
          assignment_id: string;
          wafer_id: string;
          archived_at: string;
        }>;
      };
      restore_archived_wafer_to_step: {
        Args: {
          target_wafer_id: string;
          archived_assignment_id: string;
          target_step_id: string;
          mutation_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      user_role: UserRole;
      project_member_role: ProjectMemberRole;
      project_status: ProjectStatus;
      project_visibility: ProjectVisibility;
      fabrication_status: FabricationStatus;
      step_status: StepStatus;
      tool_status: ToolStatus;
      reservation_status: ReservationStatus;
      issue_severity: IssueSeverity;
      issue_status: IssueStatus;
      process_step_node_type: ProcessStepNodeType;
      process_step_transition_type: ProcessStepTransitionType;
    };
    CompositeTypes: Record<string, never>;
  };
}
