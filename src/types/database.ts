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
  | "completed"
  | "skipped"
  | "failed";
export type ToolStatus = "available" | "maintenance" | "offline" | "reserved";
export type ReservationStatus = "scheduled" | "cancelled" | "completed";
export type IssueSeverity = "low" | "medium" | "high" | "critical";
export type IssueStatus = "open" | "investigating" | "resolved" | "closed";

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
  expected_duration_minutes: number | null;
  queue_target_minutes: number | null;
  required_tool_type: string | null;
  requires_recipe: boolean;
  instructions: string | null;
  parameters_schema: Json;
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
  location: string;
  starts_at: string;
  ends_at: string;
  process_step_id: string | null;
  manual_action: string | null;
  description: string | null;
  created_by: string | null;
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
      fabrication_tools: Row<FabricationTool>;
      recipes: Row<Recipe>;
      wafer_lots: Row<WaferLot>;
      wafers: Row<Wafer>;
      wafer_process_assignments: Row<WaferProcessAssignment>;
      step_executions: Row<StepExecution>;
      tool_reservations: Row<ToolReservation>;
      process_people: Row<ProcessPerson>;
      process_calendar_events: Row<ProcessCalendarEvent>;
      process_calendar_event_people: Row<ProcessCalendarEventPerson>;
      measurements: Row<Measurement>;
      attachments: Row<Attachment>;
      process_issues: Row<ProcessIssue>;
      process_events: Row<ProcessEvent>;
      audit_events: Row<AuditEvent>;
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
    };
    CompositeTypes: Record<string, never>;
  };
}
