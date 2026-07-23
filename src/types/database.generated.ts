export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          bucket_name: string
          created_at: string
          file_name: string
          id: string
          measurement_id: string | null
          mime_type: string | null
          object_path: string
          project_id: string
          size_bytes: number | null
          step_execution_id: string | null
          uploaded_by: string | null
          wafer_id: string | null
        }
        Insert: {
          bucket_name: string
          created_at?: string
          file_name: string
          id?: string
          measurement_id?: string | null
          mime_type?: string | null
          object_path: string
          project_id: string
          size_bytes?: number | null
          step_execution_id?: string | null
          uploaded_by?: string | null
          wafer_id?: string | null
        }
        Update: {
          bucket_name?: string
          created_at?: string
          file_name?: string
          id?: string
          measurement_id?: string | null
          mime_type?: string | null
          object_path?: string
          project_id?: string
          size_bytes?: number | null
          step_execution_id?: string | null
          uploaded_by?: string | null
          wafer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "step_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["step_execution_id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "attachments_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "attachments_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "attachments_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string
          entity_table: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id: string
          entity_table: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string
          entity_table?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoint_decisions: {
        Row: {
          assignment_id: string
          attempt_id: string
          client_mutation_id: string
          created_at: string
          decided_at: string
          decided_by: string | null
          decided_by_name_snapshot: string
          decision: string
          decision_notes: string | null
          id: string
          process_step_id: string
          process_step_name_snapshot: string
          process_step_order_snapshot: number
          step_execution_id: string
          target_step_id: string | null
          target_step_name_snapshot: string | null
          target_step_order_snapshot: number | null
          template_id: string
          wafer_code_snapshot: string
          wafer_id: string
        }
        Insert: {
          assignment_id: string
          attempt_id: string
          client_mutation_id: string
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decided_by_name_snapshot: string
          decision: string
          decision_notes?: string | null
          id?: string
          process_step_id: string
          process_step_name_snapshot: string
          process_step_order_snapshot: number
          step_execution_id: string
          target_step_id?: string | null
          target_step_name_snapshot?: string | null
          target_step_order_snapshot?: number | null
          template_id: string
          wafer_code_snapshot: string
          wafer_id: string
        }
        Update: {
          assignment_id?: string
          attempt_id?: string
          client_mutation_id?: string
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decided_by_name_snapshot?: string
          decision?: string
          decision_notes?: string | null
          id?: string
          process_step_id?: string
          process_step_name_snapshot?: string
          process_step_order_snapshot?: number
          step_execution_id?: string
          target_step_id?: string | null
          target_step_name_snapshot?: string | null
          target_step_order_snapshot?: number | null
          template_id?: string
          wafer_code_snapshot?: string
          wafer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_decisions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "wafer_process_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "process_step_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["latest_attempt_id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["latest_attempt_id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "step_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["step_execution_id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_target_step_id_fkey"
            columns: ["target_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "checkpoint_decisions_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoint_reviewer_reassignments: {
        Row: {
          changed_at: string
          changed_by: string
          changed_by_name_snapshot: string
          client_mutation_id: string
          id: string
          new_reviewer_id: string
          new_reviewer_name_snapshot: string
          previous_reviewer_id: string | null
          previous_reviewer_name_snapshot: string
          process_step_id: string
          reason: string
          template_id: string
          transaction_id: number
        }
        Insert: {
          changed_at?: string
          changed_by: string
          changed_by_name_snapshot: string
          client_mutation_id: string
          id?: string
          new_reviewer_id: string
          new_reviewer_name_snapshot: string
          previous_reviewer_id?: string | null
          previous_reviewer_name_snapshot: string
          process_step_id: string
          reason: string
          template_id: string
          transaction_id?: number
        }
        Update: {
          changed_at?: string
          changed_by?: string
          changed_by_name_snapshot?: string
          client_mutation_id?: string
          id?: string
          new_reviewer_id?: string
          new_reviewer_name_snapshot?: string
          previous_reviewer_id?: string | null
          previous_reviewer_name_snapshot?: string
          process_step_id?: string
          reason?: string
          template_id?: string
          transaction_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_reviewer_reassignments_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_reviewer_reassignments_new_reviewer_id_fkey"
            columns: ["new_reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_reviewer_reassignments_previous_reviewer_id_fkey"
            columns: ["previous_reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_reviewer_reassignments_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_reviewer_reassignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoint_submission_withdrawals: {
        Row: {
          assignment_id: string
          attempt_id: string
          client_mutation_id: string
          created_at: string
          id: string
          process_step_id: string
          process_step_name_snapshot: string
          step_execution_id: string
          template_id: string
          wafer_code_snapshot: string
          wafer_id: string
          withdrawal_reason: string | null
          withdrawn_at: string
          withdrawn_by: string | null
          withdrawn_by_name_snapshot: string
        }
        Insert: {
          assignment_id: string
          attempt_id: string
          client_mutation_id: string
          created_at?: string
          id?: string
          process_step_id: string
          process_step_name_snapshot: string
          step_execution_id: string
          template_id: string
          wafer_code_snapshot: string
          wafer_id: string
          withdrawal_reason?: string | null
          withdrawn_at?: string
          withdrawn_by?: string | null
          withdrawn_by_name_snapshot: string
        }
        Update: {
          assignment_id?: string
          attempt_id?: string
          client_mutation_id?: string
          created_at?: string
          id?: string
          process_step_id?: string
          process_step_name_snapshot?: string
          step_execution_id?: string
          template_id?: string
          wafer_code_snapshot?: string
          wafer_id?: string
          withdrawal_reason?: string | null
          withdrawn_at?: string
          withdrawn_by?: string | null
          withdrawn_by_name_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_submission_withdrawals_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "checkpoint_submission_withdrawals_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "checkpoint_submission_withdrawals_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "wafer_process_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_submission_withdrawals_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "process_step_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_submission_withdrawals_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["latest_attempt_id"]
          },
          {
            foreignKeyName: "checkpoint_submission_withdrawals_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["latest_attempt_id"]
          },
          {
            foreignKeyName: "checkpoint_submission_withdrawals_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_submission_withdrawals_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "step_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_submission_withdrawals_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["step_execution_id"]
          },
          {
            foreignKeyName: "checkpoint_submission_withdrawals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_submission_withdrawals_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "checkpoint_submission_withdrawals_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "checkpoint_submission_withdrawals_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "checkpoint_submission_withdrawals_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_submission_withdrawals_withdrawn_by_fkey"
            columns: ["withdrawn_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      die_inspections: {
        Row: {
          created_at: string
          created_by: string | null
          die_code: string
          id: string
          image_bucket: string
          image_file_name: string
          image_mime_type: string
          image_path: string
          image_size_bytes: number
          pattern_column: number
          pattern_row: number
          project_id: string
          updated_at: string
          wafer_id: string
          x_ratio: number
          y_ratio: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          die_code: string
          id?: string
          image_bucket?: string
          image_file_name: string
          image_mime_type: string
          image_path: string
          image_size_bytes: number
          pattern_column?: number
          pattern_row?: number
          project_id: string
          updated_at?: string
          wafer_id: string
          x_ratio: number
          y_ratio: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          die_code?: string
          id?: string
          image_bucket?: string
          image_file_name?: string
          image_mime_type?: string
          image_path?: string
          image_size_bytes?: number
          pattern_column?: number
          pattern_row?: number
          project_id?: string
          updated_at?: string
          wafer_id?: string
          x_ratio?: number
          y_ratio?: number
        }
        Relationships: [
          {
            foreignKeyName: "die_inspections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "die_inspections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "die_inspections_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "die_inspections_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "die_inspections_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "die_inspections_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
        ]
      }
      fabrication_locations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          slug: string
          timezone: string
          travel_group: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          slug: string
          timezone?: string
          travel_group?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          slug?: string
          timezone?: string
          travel_group?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fabrication_tools: {
        Row: {
          created_at: string
          id: string
          location: string | null
          metadata: Json
          name: string
          owner_profile_id: string | null
          status: Database["public"]["Enums"]["tool_status"]
          tool_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          metadata?: Json
          name: string
          owner_profile_id?: string | null
          status?: Database["public"]["Enums"]["tool_status"]
          tool_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          metadata?: Json
          name?: string
          owner_profile_id?: string | null
          status?: Database["public"]["Enums"]["tool_status"]
          tool_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fabrication_tools_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      measurements: {
        Row: {
          created_at: string
          data: Json
          file_path: string | null
          id: string
          measured_at: string
          measured_by: string | null
          measurement_type: string
          metric_name: string
          metric_unit: string | null
          metric_value: number | null
          project_id: string
          step_execution_id: string | null
          wafer_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          file_path?: string | null
          id?: string
          measured_at?: string
          measured_by?: string | null
          measurement_type: string
          metric_name: string
          metric_unit?: string | null
          metric_value?: number | null
          project_id: string
          step_execution_id?: string | null
          wafer_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          file_path?: string | null
          id?: string
          measured_at?: string
          measured_by?: string | null
          measurement_type?: string
          metric_name?: string
          metric_unit?: string | null
          metric_value?: number | null
          project_id?: string
          step_execution_id?: string | null
          wafer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurements_measured_by_fkey"
            columns: ["measured_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "step_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["step_execution_id"]
          },
          {
            foreignKeyName: "measurements_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "measurements_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "measurements_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "measurements_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_run_links: {
        Row: {
          child_run_id: string
          created_at: string
          id: string
          link_kind: string
          parent_run_id: string
        }
        Insert: {
          child_run_id: string
          created_at?: string
          id?: string
          link_kind: string
          parent_run_id: string
        }
        Update: {
          child_run_id?: string
          created_at?: string
          id?: string
          link_kind?: string
          parent_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_run_links_child_run_id_fkey"
            columns: ["child_run_id"]
            isOneToOne: false
            referencedRelation: "operation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_links_child_run_id_fkey"
            columns: ["child_run_id"]
            isOneToOne: false
            referencedRelation: "vw_batch_run_state"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "operation_run_links_child_run_id_fkey"
            columns: ["child_run_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "operation_run_links_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "operation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_links_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "vw_batch_run_state"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "operation_run_links_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_id"]
          },
        ]
      }
      operation_run_members: {
        Row: {
          assignment_id: string
          completed_at: string | null
          created_at: string
          history_effective: boolean
          history_suppression_reason: string | null
          id: string
          legacy_step_execution_id: string | null
          note: string | null
          operation_run_id: string
          revision: number
          started_at: string | null
          status: string
          updated_at: string
          wafer_id: string
        }
        Insert: {
          assignment_id: string
          completed_at?: string | null
          created_at?: string
          history_effective?: boolean
          history_suppression_reason?: string | null
          id?: string
          legacy_step_execution_id?: string | null
          note?: string | null
          operation_run_id: string
          revision?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          wafer_id: string
        }
        Update: {
          assignment_id?: string
          completed_at?: string | null
          created_at?: string
          history_effective?: boolean
          history_suppression_reason?: string | null
          id?: string
          legacy_step_execution_id?: string | null
          note?: string | null
          operation_run_id?: string
          revision?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          wafer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_run_members_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "operation_run_members_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "operation_run_members_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "wafer_process_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_members_legacy_step_execution_id_fkey"
            columns: ["legacy_step_execution_id"]
            isOneToOne: false
            referencedRelation: "step_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_members_legacy_step_execution_id_fkey"
            columns: ["legacy_step_execution_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["step_execution_id"]
          },
          {
            foreignKeyName: "operation_run_members_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "operation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_members_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "vw_batch_run_state"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "operation_run_members_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "operation_run_members_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "operation_run_members_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "operation_run_members_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "operation_run_members_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_run_notes: {
        Row: {
          body: string
          client_mutation_id: string | null
          correction_reason: string | null
          created_at: string
          created_by: string | null
          id: string
          note_kind: string
          operation_run_id: string
          operation_run_member_id: string | null
          supersedes_note_id: string | null
        }
        Insert: {
          body: string
          client_mutation_id?: string | null
          correction_reason?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note_kind?: string
          operation_run_id: string
          operation_run_member_id?: string | null
          supersedes_note_id?: string | null
        }
        Update: {
          body?: string
          client_mutation_id?: string | null
          correction_reason?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note_kind?: string
          operation_run_id?: string
          operation_run_member_id?: string | null
          supersedes_note_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_run_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_notes_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "operation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_notes_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "vw_batch_run_state"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "operation_run_notes_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "operation_run_notes_operation_run_member_id_fkey"
            columns: ["operation_run_member_id"]
            isOneToOne: false
            referencedRelation: "operation_run_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_notes_operation_run_member_id_fkey"
            columns: ["operation_run_member_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_member_id"]
          },
          {
            foreignKeyName: "operation_run_notes_supersedes_note_id_fkey"
            columns: ["supersedes_note_id"]
            isOneToOne: false
            referencedRelation: "operation_run_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_run_parameter_records: {
        Row: {
          client_mutation_id: string | null
          correction_reason: string | null
          id: string
          operation_run_id: string
          operation_run_member_id: string | null
          recorded_at: string
          recorded_by: string | null
          schema_snapshot: Json
          scope: string
          supersedes_record_id: string | null
          values: Json
        }
        Insert: {
          client_mutation_id?: string | null
          correction_reason?: string | null
          id?: string
          operation_run_id: string
          operation_run_member_id?: string | null
          recorded_at?: string
          recorded_by?: string | null
          schema_snapshot?: Json
          scope?: string
          supersedes_record_id?: string | null
          values?: Json
        }
        Update: {
          client_mutation_id?: string | null
          correction_reason?: string | null
          id?: string
          operation_run_id?: string
          operation_run_member_id?: string | null
          recorded_at?: string
          recorded_by?: string | null
          schema_snapshot?: Json
          scope?: string
          supersedes_record_id?: string | null
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "operation_run_parameter_records_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "operation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_parameter_records_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "vw_batch_run_state"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "operation_run_parameter_records_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "operation_run_parameter_records_operation_run_member_id_fkey"
            columns: ["operation_run_member_id"]
            isOneToOne: false
            referencedRelation: "operation_run_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_parameter_records_operation_run_member_id_fkey"
            columns: ["operation_run_member_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_member_id"]
          },
          {
            foreignKeyName: "operation_run_parameter_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_parameter_records_supersedes_record_id_fkey"
            columns: ["supersedes_record_id"]
            isOneToOne: false
            referencedRelation: "operation_run_parameter_records"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_run_resources: {
        Row: {
          id: string
          location_id: string | null
          operation_run_id: string
          operation_run_member_id: string | null
          person_id: string | null
          recipe_id: string | null
          recorded_at: string
          recorded_by: string | null
          resource_kind: string
          resource_snapshot: Json
          tool_id: string | null
        }
        Insert: {
          id?: string
          location_id?: string | null
          operation_run_id: string
          operation_run_member_id?: string | null
          person_id?: string | null
          recipe_id?: string | null
          recorded_at?: string
          recorded_by?: string | null
          resource_kind: string
          resource_snapshot?: Json
          tool_id?: string | null
        }
        Update: {
          id?: string
          location_id?: string | null
          operation_run_id?: string
          operation_run_member_id?: string | null
          person_id?: string | null
          recipe_id?: string | null
          recorded_at?: string
          recorded_by?: string | null
          resource_kind?: string
          resource_snapshot?: Json
          tool_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_run_resources_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "fabrication_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_resources_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "operation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_resources_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "vw_batch_run_state"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "operation_run_resources_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "operation_run_resources_operation_run_member_id_fkey"
            columns: ["operation_run_member_id"]
            isOneToOne: false
            referencedRelation: "operation_run_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_resources_operation_run_member_id_fkey"
            columns: ["operation_run_member_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_member_id"]
          },
          {
            foreignKeyName: "operation_run_resources_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "process_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_resources_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_resources_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_resources_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "fabrication_tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_resources_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "vw_tool_utilization_daily"
            referencedColumns: ["tool_id"]
          },
        ]
      }
      operation_runs: {
        Row: {
          client_mutation_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          legacy_batch_id: string | null
          planned_operation_id: string | null
          process_step_id: string
          reason: string | null
          revision: number
          run_kind: string
          started_at: string | null
          status: string
          template_id: string
          updated_at: string
        }
        Insert: {
          client_mutation_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_batch_id?: string | null
          planned_operation_id?: string | null
          process_step_id: string
          reason?: string | null
          revision?: number
          run_kind?: string
          started_at?: string | null
          status?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          client_mutation_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_batch_id?: string | null
          planned_operation_id?: string | null
          process_step_id?: string
          reason?: string | null
          revision?: number
          run_kind?: string
          started_at?: string | null
          status?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_runs_legacy_batch_id_fkey"
            columns: ["legacy_batch_id"]
            isOneToOne: false
            referencedRelation: "process_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_runs_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "planned_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_runs_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "operation_runs_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "operation_runs_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_runs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_adjustment_proposals: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          base_draft_row_version: number
          draft_revision_id: string
          generated_at: string
          id: string
          moved_operations: Json
          plan_id: string
          request_id: string
          scheduler_version: string
          status: string
          unresolved_conflicts: Json
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          base_draft_row_version: number
          draft_revision_id: string
          generated_at?: string
          id?: string
          moved_operations?: Json
          plan_id: string
          request_id: string
          scheduler_version?: string
          status?: string
          unresolved_conflicts?: Json
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          base_draft_row_version?: number
          draft_revision_id?: string
          generated_at?: string
          id?: string
          moved_operations?: Json
          plan_id?: string
          request_id?: string
          scheduler_version?: string
          status?: string
          unresolved_conflicts?: Json
        }
        Relationships: [
          {
            foreignKeyName: "plan_adjustment_proposals_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_adjustment_proposals_draft_revision_id_fkey"
            columns: ["draft_revision_id"]
            isOneToOne: false
            referencedRelation: "process_plan_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_adjustment_proposals_draft_revision_id_fkey"
            columns: ["draft_revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "plan_adjustment_proposals_draft_revision_id_fkey"
            columns: ["draft_revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "plan_adjustment_proposals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "process_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_adjustment_proposals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_adjustment_proposals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_adjustment_proposals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "plan_replan_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_replan_requests: {
        Row: {
          client_mutation_id: string
          draft_revision_id: string
          id: string
          plan_id: string
          processed_at: string | null
          request_kind: string
          requested_at: string
          requested_by: string | null
          requested_change: Json
          source_run_id: string | null
          status: string
        }
        Insert: {
          client_mutation_id: string
          draft_revision_id: string
          id?: string
          plan_id: string
          processed_at?: string | null
          request_kind: string
          requested_at?: string
          requested_by?: string | null
          requested_change?: Json
          source_run_id?: string | null
          status?: string
        }
        Update: {
          client_mutation_id?: string
          draft_revision_id?: string
          id?: string
          plan_id?: string
          processed_at?: string | null
          request_kind?: string
          requested_at?: string
          requested_by?: string | null
          requested_change?: Json
          source_run_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_replan_requests_draft_revision_id_fkey"
            columns: ["draft_revision_id"]
            isOneToOne: false
            referencedRelation: "process_plan_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_replan_requests_draft_revision_id_fkey"
            columns: ["draft_revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "plan_replan_requests_draft_revision_id_fkey"
            columns: ["draft_revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "plan_replan_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "process_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_replan_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_replan_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_replan_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_replan_requests_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "operation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_replan_requests_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "vw_batch_run_state"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "plan_replan_requests_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_id"]
          },
        ]
      }
      planned_batch_members: {
        Row: {
          added_by: string | null
          assignment_id: string
          created_at: string
          id: string
          planned_batch_id: string
        }
        Insert: {
          added_by?: string | null
          assignment_id: string
          created_at?: string
          id?: string
          planned_batch_id: string
        }
        Update: {
          added_by?: string | null
          assignment_id?: string
          created_at?: string
          id?: string
          planned_batch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_batch_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_batch_members_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "planned_batch_members_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "planned_batch_members_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "wafer_process_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_batch_members_planned_batch_id_fkey"
            columns: ["planned_batch_id"]
            isOneToOne: false
            referencedRelation: "planned_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_batches: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          logical_id: string
          name: string
          note: string | null
          revision_id: string
          row_version: number
          updated_at: string
          user_pinned: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          logical_id: string
          name: string
          note?: string | null
          revision_id: string
          row_version?: number
          updated_at?: string
          user_pinned?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          logical_id?: string
          name?: string
          note?: string | null
          revision_id?: string
          row_version?: number
          updated_at?: string
          user_pinned?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "planned_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_batches_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "process_plan_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_batches_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "planned_batches_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["plan_revision_id"]
          },
        ]
      }
      planned_operation_dependencies: {
        Row: {
          created_at: string
          dependency_kind: string
          id: string
          lag_minutes: number
          predecessor_operation_id: string
          revision_id: string
          successor_operation_id: string
        }
        Insert: {
          created_at?: string
          dependency_kind?: string
          id?: string
          lag_minutes?: number
          predecessor_operation_id: string
          revision_id: string
          successor_operation_id: string
        }
        Update: {
          created_at?: string
          dependency_kind?: string
          id?: string
          lag_minutes?: number
          predecessor_operation_id?: string
          revision_id?: string
          successor_operation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_operation_dependencies_predecessor_operation_id_fkey"
            columns: ["predecessor_operation_id"]
            isOneToOne: false
            referencedRelation: "planned_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operation_dependencies_predecessor_operation_id_fkey"
            columns: ["predecessor_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "planned_operation_dependencies_predecessor_operation_id_fkey"
            columns: ["predecessor_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "planned_operation_dependencies_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "process_plan_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operation_dependencies_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "planned_operation_dependencies_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "planned_operation_dependencies_successor_operation_id_fkey"
            columns: ["successor_operation_id"]
            isOneToOne: false
            referencedRelation: "planned_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operation_dependencies_successor_operation_id_fkey"
            columns: ["successor_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "planned_operation_dependencies_successor_operation_id_fkey"
            columns: ["successor_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["planned_operation_id"]
          },
        ]
      }
      planned_operation_parameters: {
        Row: {
          assignment_id: string | null
          created_at: string
          id: string
          parameter_key: string
          planned_operation_id: string
          row_version: number
          schema_snapshot: Json
          scope: string
          updated_at: string
          value: Json
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          id?: string
          parameter_key: string
          planned_operation_id: string
          row_version?: number
          schema_snapshot?: Json
          scope?: string
          updated_at?: string
          value?: Json
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          id?: string
          parameter_key?: string
          planned_operation_id?: string
          row_version?: number
          schema_snapshot?: Json
          scope?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "planned_operation_parameters_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "planned_operation_parameters_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "planned_operation_parameters_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "wafer_process_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operation_parameters_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "planned_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operation_parameters_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "planned_operation_parameters_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["planned_operation_id"]
          },
        ]
      }
      planned_operation_resources: {
        Row: {
          created_at: string
          id: string
          location_id: string | null
          person_id: string | null
          planned_operation_id: string
          quantity: number
          recipe_id: string | null
          resource_kind: string
          row_version: number
          tool_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id?: string | null
          person_id?: string | null
          planned_operation_id: string
          quantity?: number
          recipe_id?: string | null
          resource_kind: string
          row_version?: number
          tool_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string | null
          person_id?: string | null
          planned_operation_id?: string
          quantity?: number
          recipe_id?: string | null
          resource_kind?: string
          row_version?: number
          tool_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_operation_resources_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "fabrication_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operation_resources_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "process_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operation_resources_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "planned_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operation_resources_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "planned_operation_resources_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "planned_operation_resources_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operation_resources_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "fabrication_tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operation_resources_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "vw_tool_utilization_daily"
            referencedColumns: ["tool_id"]
          },
        ]
      }
      planned_operations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          legacy_calendar_event_id: string | null
          logical_id: string
          name: string
          planned_batch_id: string | null
          process_step_id: string
          revision_id: string
          row_version: number
          scheduled_end_at: string
          scheduled_start_at: string
          status: string
          updated_at: string
          user_pinned: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          legacy_calendar_event_id?: string | null
          logical_id: string
          name: string
          planned_batch_id?: string | null
          process_step_id: string
          revision_id: string
          row_version?: number
          scheduled_end_at: string
          scheduled_start_at: string
          status?: string
          updated_at?: string
          user_pinned?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          legacy_calendar_event_id?: string | null
          logical_id?: string
          name?: string
          planned_batch_id?: string | null
          process_step_id?: string
          revision_id?: string
          row_version?: number
          scheduled_end_at?: string
          scheduled_start_at?: string
          status?: string
          updated_at?: string
          user_pinned?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "planned_operations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operations_legacy_calendar_event_id_fkey"
            columns: ["legacy_calendar_event_id"]
            isOneToOne: false
            referencedRelation: "process_calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operations_planned_batch_id_fkey"
            columns: ["planned_batch_id"]
            isOneToOne: false
            referencedRelation: "planned_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operations_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operations_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "process_plan_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operations_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "planned_operations_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["plan_revision_id"]
          },
        ]
      }
      process_batch_links: {
        Row: {
          child_batch_id: string
          created_at: string
          id: string
          link_kind: string
          parent_batch_id: string
        }
        Insert: {
          child_batch_id: string
          created_at?: string
          id?: string
          link_kind: string
          parent_batch_id: string
        }
        Update: {
          child_batch_id?: string
          created_at?: string
          id?: string
          link_kind?: string
          parent_batch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_batch_links_child_batch_id_fkey"
            columns: ["child_batch_id"]
            isOneToOne: false
            referencedRelation: "process_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_batch_links_parent_batch_id_fkey"
            columns: ["parent_batch_id"]
            isOneToOne: false
            referencedRelation: "process_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      process_batch_members: {
        Row: {
          assignment_id: string
          batch_id: string
          created_at: string
          id: string
          process_step_id: string
          step_execution_id: string
          wafer_id: string
        }
        Insert: {
          assignment_id: string
          batch_id: string
          created_at?: string
          id?: string
          process_step_id: string
          step_execution_id: string
          wafer_id: string
        }
        Update: {
          assignment_id?: string
          batch_id?: string
          created_at?: string
          id?: string
          process_step_id?: string
          step_execution_id?: string
          wafer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_batch_members_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "process_batch_members_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "process_batch_members_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "wafer_process_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_batch_members_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "process_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_batch_members_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_batch_members_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "step_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_batch_members_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["step_execution_id"]
          },
          {
            foreignKeyName: "process_batch_members_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_batch_members_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_batch_members_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_batch_members_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
        ]
      }
      process_batches: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          origin: string
          process_step_id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id: string
          note?: string | null
          origin?: string
          process_step_id: string
          template_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          origin?: string
          process_step_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_batches_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_batches_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      process_calendar_event_people: {
        Row: {
          created_at: string
          event_id: string
          person_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          person_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_calendar_event_people_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "process_calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_calendar_event_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "process_people"
            referencedColumns: ["id"]
          },
        ]
      }
      process_calendar_events: {
        Row: {
          batch_id: string | null
          client_mutation_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          id: string
          location: string
          location_id: string | null
          manual_action: string | null
          process_step_id: string | null
          process_step_name_snapshot: string | null
          process_template_id: string
          revision: number
          starts_at: string
          updated_at: string
          wafer_id: string | null
        }
        Insert: {
          batch_id?: string | null
          client_mutation_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          id?: string
          location: string
          location_id?: string | null
          manual_action?: string | null
          process_step_id?: string | null
          process_step_name_snapshot?: string | null
          process_template_id: string
          revision?: number
          starts_at: string
          updated_at?: string
          wafer_id?: string | null
        }
        Update: {
          batch_id?: string | null
          client_mutation_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          location?: string
          location_id?: string | null
          manual_action?: string | null
          process_step_id?: string | null
          process_step_name_snapshot?: string | null
          process_template_id?: string
          revision?: number
          starts_at?: string
          updated_at?: string
          wafer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_calendar_events_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "process_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_calendar_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "fabrication_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_calendar_events_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_calendar_events_process_template_id_fkey"
            columns: ["process_template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_calendar_events_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_calendar_events_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_calendar_events_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_calendar_events_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
        ]
      }
      process_events: {
        Row: {
          actor_id: string | null
          client_mutation_id: string | null
          event_at: string
          event_type: string
          id: string
          metadata: Json
          notes: string | null
          operation_run_id: string | null
          operation_run_member_id: string | null
          planned_operation_id: string | null
          process_plan_revision_id: string | null
          project_id: string
          step_execution_id: string | null
          wafer_id: string | null
        }
        Insert: {
          actor_id?: string | null
          client_mutation_id?: string | null
          event_at?: string
          event_type: string
          id?: string
          metadata?: Json
          notes?: string | null
          operation_run_id?: string | null
          operation_run_member_id?: string | null
          planned_operation_id?: string | null
          process_plan_revision_id?: string | null
          project_id: string
          step_execution_id?: string | null
          wafer_id?: string | null
        }
        Update: {
          actor_id?: string | null
          client_mutation_id?: string | null
          event_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          notes?: string | null
          operation_run_id?: string | null
          operation_run_member_id?: string | null
          planned_operation_id?: string | null
          process_plan_revision_id?: string | null
          project_id?: string
          step_execution_id?: string | null
          wafer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_events_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "operation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_events_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "vw_batch_run_state"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "process_events_operation_run_id_fkey"
            columns: ["operation_run_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "process_events_operation_run_member_id_fkey"
            columns: ["operation_run_member_id"]
            isOneToOne: false
            referencedRelation: "operation_run_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_events_operation_run_member_id_fkey"
            columns: ["operation_run_member_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_member_id"]
          },
          {
            foreignKeyName: "process_events_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "planned_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_events_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "process_events_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "process_events_process_plan_revision_id_fkey"
            columns: ["process_plan_revision_id"]
            isOneToOne: false
            referencedRelation: "process_plan_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_events_process_plan_revision_id_fkey"
            columns: ["process_plan_revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "process_events_process_plan_revision_id_fkey"
            columns: ["process_plan_revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "process_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_events_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "step_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_events_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["step_execution_id"]
          },
          {
            foreignKeyName: "process_events_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_events_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_events_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_events_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
        ]
      }
      process_issues: {
        Row: {
          assigned_to: string | null
          closed_at: string | null
          description: string | null
          id: string
          opened_at: string
          project_id: string
          reported_by: string | null
          resolution: string | null
          severity: Database["public"]["Enums"]["issue_severity"]
          status: Database["public"]["Enums"]["issue_status"]
          step_execution_id: string | null
          title: string
          updated_at: string
          wafer_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          closed_at?: string | null
          description?: string | null
          id?: string
          opened_at?: string
          project_id: string
          reported_by?: string | null
          resolution?: string | null
          severity?: Database["public"]["Enums"]["issue_severity"]
          status?: Database["public"]["Enums"]["issue_status"]
          step_execution_id?: string | null
          title: string
          updated_at?: string
          wafer_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          closed_at?: string | null
          description?: string | null
          id?: string
          opened_at?: string
          project_id?: string
          reported_by?: string | null
          resolution?: string | null
          severity?: Database["public"]["Enums"]["issue_severity"]
          status?: Database["public"]["Enums"]["issue_status"]
          step_execution_id?: string | null
          title?: string
          updated_at?: string
          wafer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_issues_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_issues_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_issues_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "step_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_issues_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["step_execution_id"]
          },
          {
            foreignKeyName: "process_issues_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_issues_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_issues_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_issues_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
        ]
      }
      process_people: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_people_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      process_plan_revisions: {
        Row: {
          based_on_revision_id: string | null
          created_at: string
          created_by: string | null
          id: string
          plan_id: string
          planning_ends_at: string
          planning_starts_at: string
          published_at: string | null
          published_by: string | null
          revision_number: number
          row_version: number
          status: string
          superseded_at: string | null
        }
        Insert: {
          based_on_revision_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          plan_id: string
          planning_ends_at: string
          planning_starts_at: string
          published_at?: string | null
          published_by?: string | null
          revision_number: number
          row_version?: number
          status?: string
          superseded_at?: string | null
        }
        Update: {
          based_on_revision_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          plan_id?: string
          planning_ends_at?: string
          planning_starts_at?: string
          published_at?: string | null
          published_by?: string | null
          revision_number?: number
          row_version?: number
          status?: string
          superseded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_plan_revisions_based_on_revision_id_fkey"
            columns: ["based_on_revision_id"]
            isOneToOne: false
            referencedRelation: "process_plan_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_plan_revisions_based_on_revision_id_fkey"
            columns: ["based_on_revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "process_plan_revisions_based_on_revision_id_fkey"
            columns: ["based_on_revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "process_plan_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_plan_revisions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "process_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_plan_revisions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "process_plan_revisions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "process_plan_revisions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      process_plans: {
        Row: {
          created_at: string
          created_by: string | null
          current_published_revision_id: string | null
          id: string
          is_active: boolean
          name: string
          project_id: string
          shared_draft_revision_id: string | null
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_published_revision_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          project_id: string
          shared_draft_revision_id?: string | null
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_published_revision_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          project_id?: string
          shared_draft_revision_id?: string | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_plans_current_published_fk"
            columns: ["current_published_revision_id"]
            isOneToOne: false
            referencedRelation: "process_plan_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_plans_current_published_fk"
            columns: ["current_published_revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "process_plans_current_published_fk"
            columns: ["current_published_revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "process_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_plans_shared_draft_fk"
            columns: ["shared_draft_revision_id"]
            isOneToOne: false
            referencedRelation: "process_plan_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_plans_shared_draft_fk"
            columns: ["shared_draft_revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "process_plans_shared_draft_fk"
            columns: ["shared_draft_revision_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["plan_revision_id"]
          },
          {
            foreignKeyName: "process_plans_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      process_stages: {
        Row: {
          archived_at: string | null
          canvas_x: number | null
          canvas_y: number | null
          created_at: string
          id: string
          name: string
          revision: number
          slug: string
          stage_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          canvas_x?: number | null
          canvas_y?: number | null
          created_at?: string
          id?: string
          name: string
          revision?: number
          slug: string
          stage_order: number
          template_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          canvas_x?: number | null
          canvas_y?: number | null
          created_at?: string
          id?: string
          name?: string
          revision?: number
          slug?: string
          stage_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_stages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      process_step_attempts: {
        Row: {
          assignment_id: string
          attempt_number: number
          batch_id: string | null
          client_mutation_id: string
          created_at: string
          evidence_snapshot: Json
          id: string
          operation_run_member_id: string | null
          prior_step_status: Database["public"]["Enums"]["step_status"]
          process_step_id: string
          process_step_name_snapshot: string
          process_step_order_snapshot: number
          reviewer_id_snapshot: string | null
          reviewer_name_snapshot: string
          started_at_snapshot: string | null
          step_execution_id: string
          submission_group_id: string | null
          submission_notes: string | null
          submitted_at: string
          submitted_by: string | null
          submitted_by_name_snapshot: string
          template_id: string
          template_name_snapshot: string
          template_version_snapshot: string
          wafer_code_snapshot: string
          wafer_id: string
        }
        Insert: {
          assignment_id: string
          attempt_number: number
          batch_id?: string | null
          client_mutation_id: string
          created_at?: string
          evidence_snapshot?: Json
          id?: string
          operation_run_member_id?: string | null
          prior_step_status: Database["public"]["Enums"]["step_status"]
          process_step_id: string
          process_step_name_snapshot: string
          process_step_order_snapshot: number
          reviewer_id_snapshot?: string | null
          reviewer_name_snapshot: string
          started_at_snapshot?: string | null
          step_execution_id: string
          submission_group_id?: string | null
          submission_notes?: string | null
          submitted_at?: string
          submitted_by?: string | null
          submitted_by_name_snapshot: string
          template_id: string
          template_name_snapshot: string
          template_version_snapshot: string
          wafer_code_snapshot: string
          wafer_id: string
        }
        Update: {
          assignment_id?: string
          attempt_number?: number
          batch_id?: string | null
          client_mutation_id?: string
          created_at?: string
          evidence_snapshot?: Json
          id?: string
          operation_run_member_id?: string | null
          prior_step_status?: Database["public"]["Enums"]["step_status"]
          process_step_id?: string
          process_step_name_snapshot?: string
          process_step_order_snapshot?: number
          reviewer_id_snapshot?: string | null
          reviewer_name_snapshot?: string
          started_at_snapshot?: string | null
          step_execution_id?: string
          submission_group_id?: string | null
          submission_notes?: string | null
          submitted_at?: string
          submitted_by?: string | null
          submitted_by_name_snapshot?: string
          template_id?: string
          template_name_snapshot?: string
          template_version_snapshot?: string
          wafer_code_snapshot?: string
          wafer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_step_attempts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "process_step_attempts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "process_step_attempts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "wafer_process_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_step_attempts_operation_run_member_id_fkey"
            columns: ["operation_run_member_id"]
            isOneToOne: false
            referencedRelation: "operation_run_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_step_attempts_operation_run_member_id_fkey"
            columns: ["operation_run_member_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_member_id"]
          },
          {
            foreignKeyName: "process_step_attempts_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_step_attempts_reviewer_id_snapshot_fkey"
            columns: ["reviewer_id_snapshot"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_step_attempts_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "step_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_step_attempts_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["step_execution_id"]
          },
          {
            foreignKeyName: "process_step_attempts_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_step_attempts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_step_attempts_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_step_attempts_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_step_attempts_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "process_step_attempts_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
        ]
      }
      process_step_transitions: {
        Row: {
          condition: Json
          created_at: string
          edge_type: string
          from_step_id: string
          id: string
          label: string | null
          priority: number
          template_id: string
          to_step_id: string
          updated_at: string
        }
        Insert: {
          condition?: Json
          created_at?: string
          edge_type?: string
          from_step_id: string
          id?: string
          label?: string | null
          priority?: number
          template_id: string
          to_step_id: string
          updated_at?: string
        }
        Update: {
          condition?: Json
          created_at?: string
          edge_type?: string
          from_step_id?: string
          id?: string
          label?: string | null
          priority?: number
          template_id?: string
          to_step_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_step_transitions_from_step_id_fkey"
            columns: ["from_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_step_transitions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_step_transitions_to_step_id_fkey"
            columns: ["to_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      process_steps: {
        Row: {
          archived_at: string | null
          canvas_x: number | null
          canvas_y: number | null
          created_at: string
          execution_mode: string
          expected_duration_minutes: number | null
          id: string
          instructions: string | null
          name: string
          node_type: string
          parameters_schema: Json
          process_area: string
          queue_target_minutes: number | null
          required_reviewer_id: string | null
          required_tool_type: string | null
          requires_recipe: boolean
          revision: number
          slug: string
          stage_id: string
          stage_step_order: number
          step_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          canvas_x?: number | null
          canvas_y?: number | null
          created_at?: string
          execution_mode?: string
          expected_duration_minutes?: number | null
          id?: string
          instructions?: string | null
          name: string
          node_type?: string
          parameters_schema?: Json
          process_area: string
          queue_target_minutes?: number | null
          required_reviewer_id?: string | null
          required_tool_type?: string | null
          requires_recipe?: boolean
          revision?: number
          slug: string
          stage_id: string
          stage_step_order: number
          step_order: number
          template_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          canvas_x?: number | null
          canvas_y?: number | null
          created_at?: string
          execution_mode?: string
          expected_duration_minutes?: number | null
          id?: string
          instructions?: string | null
          name?: string
          node_type?: string
          parameters_schema?: Json
          process_area?: string
          queue_target_minutes?: number | null
          required_reviewer_id?: string | null
          required_tool_type?: string | null
          requires_recipe?: boolean
          revision?: number
          slug?: string
          stage_id?: string
          stage_step_order?: number
          step_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_steps_required_reviewer_id_fkey"
            columns: ["required_reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_steps_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "process_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      process_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          lifecycle_status: string
          name: string
          owner_project_id: string | null
          published_at: string | null
          published_by: string | null
          source_template_id: string | null
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          lifecycle_status?: string
          name: string
          owner_project_id?: string | null
          published_at?: string | null
          published_by?: string | null
          source_template_id?: string | null
          updated_at?: string
          version?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          lifecycle_status?: string
          name?: string
          owner_project_id?: string | null
          published_at?: string | null
          published_by?: string | null
          source_template_id?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_templates_owner_project_id_fkey"
            columns: ["owner_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_templates_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_templates_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          is_active: boolean
          lab_group: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          is_active?: boolean
          lab_group?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          is_active?: boolean
          lab_group?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          project_id: string
          role: Database["public"]["Enums"]["project_member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string | null
          slug: string
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["project_visibility"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["project_visibility"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["project_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          created_by: string | null
          file_path: string | null
          id: string
          is_active: boolean
          name: string
          parameters: Json
          process_step_id: string | null
          tool_id: string | null
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          id?: string
          is_active?: boolean
          name: string
          parameters?: Json
          process_step_id?: string | null
          tool_id?: string | null
          updated_at?: string
          version?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parameters?: Json
          process_step_id?: string | null
          tool_id?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "fabrication_tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "vw_tool_utilization_daily"
            referencedColumns: ["tool_id"]
          },
        ]
      }
      step_executions: {
        Row: {
          assignment_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          metadata: Json
          operator_id: string | null
          planned_end_at: string | null
          planned_start_at: string | null
          process_step_id: string
          queue_started_at: string | null
          recipe_id: string | null
          run_notes: string | null
          skipped_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["step_status"]
          tool_id: string | null
          updated_at: string
          wafer_id: string
        }
        Insert: {
          assignment_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          operator_id?: string | null
          planned_end_at?: string | null
          planned_start_at?: string | null
          process_step_id: string
          queue_started_at?: string | null
          recipe_id?: string | null
          run_notes?: string | null
          skipped_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["step_status"]
          tool_id?: string | null
          updated_at?: string
          wafer_id: string
        }
        Update: {
          assignment_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          operator_id?: string | null
          planned_end_at?: string | null
          planned_start_at?: string | null
          process_step_id?: string
          queue_started_at?: string | null
          recipe_id?: string | null
          run_notes?: string | null
          skipped_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["step_status"]
          tool_id?: string | null
          updated_at?: string
          wafer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_executions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "step_executions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "step_executions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "wafer_process_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_executions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_executions_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_executions_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_executions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_executions_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "fabrication_tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_executions_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "vw_tool_utilization_daily"
            referencedColumns: ["tool_id"]
          },
          {
            foreignKeyName: "step_executions_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "step_executions_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "step_executions_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "step_executions_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
        ]
      }
      step_parameter_records: {
        Row: {
          assignment_id: string
          created_at: string
          global_values: Json
          id: string
          local_parameters: Json
          movement_mutation_id: string
          notes: string | null
          process_event_id: string
          process_step_id: string
          project_id: string
          recorded_by: string | null
          revision: number
          schema_snapshot: Json
          step_execution_id: string | null
          updated_at: string
          wafer_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          global_values?: Json
          id?: string
          local_parameters?: Json
          movement_mutation_id: string
          notes?: string | null
          process_event_id: string
          process_step_id: string
          project_id: string
          recorded_by?: string | null
          revision?: number
          schema_snapshot?: Json
          step_execution_id?: string | null
          updated_at?: string
          wafer_id: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          global_values?: Json
          id?: string
          local_parameters?: Json
          movement_mutation_id?: string
          notes?: string | null
          process_event_id?: string
          process_step_id?: string
          project_id?: string
          recorded_by?: string | null
          revision?: number
          schema_snapshot?: Json
          step_execution_id?: string | null
          updated_at?: string
          wafer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_parameter_records_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "step_parameter_records_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "step_parameter_records_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "wafer_process_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_parameter_records_process_event_id_fkey"
            columns: ["process_event_id"]
            isOneToOne: true
            referencedRelation: "process_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_parameter_records_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_parameter_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_parameter_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_parameter_records_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "step_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_parameter_records_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["step_execution_id"]
          },
          {
            foreignKeyName: "step_parameter_records_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "step_parameter_records_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "step_parameter_records_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "step_parameter_records_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
        ]
      }
      team_messages: {
        Row: {
          author_id: string
          author_name: string
          body: string
          created_at: string
          id: string
        }
        Insert: {
          author_id: string
          author_name: string
          body: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          author_name?: string
          body?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      text_surfaces: {
        Row: {
          created_at: string
          field_key: string
          id: string
          project_id: string
          scope_key: string
          scope_type: string
          updated_at: string
          updated_by: string | null
          value: string
          version: number
        }
        Insert: {
          created_at?: string
          field_key: string
          id?: string
          project_id: string
          scope_key: string
          scope_type: string
          updated_at?: string
          updated_by?: string | null
          value?: string
          version?: number
        }
        Update: {
          created_at?: string
          field_key?: string
          id?: string
          project_id?: string
          scope_key?: string
          scope_type?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "text_surfaces_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "text_surfaces_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_reservations: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          notes: string | null
          project_id: string
          reserved_by: string | null
          starts_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          step_execution_id: string | null
          tool_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          notes?: string | null
          project_id: string
          reserved_by?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["reservation_status"]
          step_execution_id?: string | null
          tool_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          notes?: string | null
          project_id?: string
          reserved_by?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          step_execution_id?: string | null
          tool_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_reservations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_reservations_reserved_by_fkey"
            columns: ["reserved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_reservations_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "step_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_reservations_step_execution_id_fkey"
            columns: ["step_execution_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["step_execution_id"]
          },
          {
            foreignKeyName: "tool_reservations_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "fabrication_tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_reservations_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "vw_tool_utilization_daily"
            referencedColumns: ["tool_id"]
          },
        ]
      }
      wafer_lots: {
        Row: {
          created_at: string
          id: string
          lot_code: string
          metadata: Json
          project_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["fabrication_status"]
          substrate_material: string | null
          target_completion_at: string | null
          updated_at: string
          wafer_size_mm: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          lot_code: string
          metadata?: Json
          project_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["fabrication_status"]
          substrate_material?: string | null
          target_completion_at?: string | null
          updated_at?: string
          wafer_size_mm?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          lot_code?: string
          metadata?: Json
          project_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["fabrication_status"]
          substrate_material?: string | null
          target_completion_at?: string | null
          updated_at?: string
          wafer_size_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wafer_lots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      wafer_process_assignments: {
        Row: {
          anytime_return_step_id: string | null
          archived_at: string | null
          archived_by: string | null
          assigned_at: string
          assigned_by: string | null
          completed_at: string | null
          current_operation_run_member_id: string | null
          current_step_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          revision: number
          started_at: string | null
          status: Database["public"]["Enums"]["fabrication_status"]
          template_id: string
          wafer_id: string
        }
        Insert: {
          anytime_return_step_id?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_at?: string
          assigned_by?: string | null
          completed_at?: string | null
          current_operation_run_member_id?: string | null
          current_step_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          revision?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["fabrication_status"]
          template_id: string
          wafer_id: string
        }
        Update: {
          anytime_return_step_id?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_at?: string
          assigned_by?: string | null
          completed_at?: string | null
          current_operation_run_member_id?: string | null
          current_step_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          revision?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["fabrication_status"]
          template_id?: string
          wafer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wafer_process_assignments_anytime_return_step_id_fkey"
            columns: ["anytime_return_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_current_operation_run_member_id_fkey"
            columns: ["current_operation_run_member_id"]
            isOneToOne: false
            referencedRelation: "operation_run_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_current_operation_run_member_id_fkey"
            columns: ["current_operation_run_member_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_member_id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
        ]
      }
      wafers: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          diameter_mm: number | null
          die_count: number | null
          die_label: string | null
          id: string
          item_type: string | null
          lot_id: string | null
          material_stack: string | null
          metadata: Json
          notes: string | null
          parent_wafer_id: string | null
          project_id: string
          status: Database["public"]["Enums"]["fabrication_status"]
          updated_at: string
          wafer_code: string
          wafer_family: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          diameter_mm?: number | null
          die_count?: number | null
          die_label?: string | null
          id?: string
          item_type?: string | null
          lot_id?: string | null
          material_stack?: string | null
          metadata?: Json
          notes?: string | null
          parent_wafer_id?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["fabrication_status"]
          updated_at?: string
          wafer_code: string
          wafer_family?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          diameter_mm?: number | null
          die_count?: number | null
          die_label?: string | null
          id?: string
          item_type?: string | null
          lot_id?: string | null
          material_stack?: string | null
          metadata?: Json
          notes?: string | null
          parent_wafer_id?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["fabrication_status"]
          updated_at?: string
          wafer_code?: string
          wafer_family?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wafers_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafers_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafers_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "wafer_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafers_parent_wafer_id_fkey"
            columns: ["parent_wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "wafers_parent_wafer_id_fkey"
            columns: ["parent_wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "wafers_parent_wafer_id_fkey"
            columns: ["parent_wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "wafers_parent_wafer_id_fkey"
            columns: ["parent_wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_change_log: {
        Row: {
          actor_id: string | null
          changed_entities: Json
          client_mutation_id: string
          committed_at: string
          id: string
          mutation_kind: string
          revision: number
          template_id: string
        }
        Insert: {
          actor_id?: string | null
          changed_entities?: Json
          client_mutation_id: string
          committed_at?: string
          id?: string
          mutation_kind: string
          revision: number
          template_id: string
        }
        Update: {
          actor_id?: string | null
          changed_entities?: Json
          client_mutation_id?: string
          committed_at?: string
          id?: string
          mutation_kind?: string
          revision?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_change_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_change_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_revisions: {
        Row: {
          current_revision: number
          template_id: string
          updated_at: string
        }
        Insert: {
          current_revision?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          current_revision?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_revisions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: true
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_batch_run_state: {
        Row: {
          completed_at: string | null
          completed_count: number | null
          created_at: string | null
          member_count: number | null
          member_status: string | null
          members: Json | null
          operation_run_id: string | null
          planned_operation_id: string | null
          process_step_id: string | null
          process_step_name: string | null
          redo_count: number | null
          revision: number | null
          run_kind: string | null
          run_status: string | null
          stage_id: string | null
          stage_name: string | null
          started_at: string | null
          template_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_runs_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "planned_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_runs_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "operation_runs_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "operation_runs_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_runs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_steps_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "process_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_operation_run_history: {
        Row: {
          assignment_id: string | null
          checkpoint_history: Json | null
          child_runs: Json | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          die_label: string | null
          execution_mode: string | null
          history_corrections: Json | null
          item_type: string | null
          latest_attempt_id: string | null
          latest_attempt_number: number | null
          latest_review_status: string | null
          latest_submitted_at: string | null
          legacy_step_execution_id: string | null
          member_note: string | null
          member_revision: number | null
          member_status: string | null
          notes: Json | null
          operation_run_id: string | null
          operation_run_member_id: string | null
          parameter_records: Json | null
          parameters_schema: Json | null
          parent_runs: Json | null
          parent_wafer_id: string | null
          planned_operation_id: string | null
          process_area: string | null
          process_step_id: string | null
          process_step_name: string | null
          process_step_slug: string | null
          project_id: string | null
          resources: Json | null
          run_kind: string | null
          run_reason: string | null
          run_revision: number | null
          run_status: string | null
          stage_id: string | null
          stage_name: string | null
          stage_order: number | null
          stage_slug: string | null
          started_at: string | null
          step_order: number | null
          template_id: string | null
          wafer_code: string | null
          wafer_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_run_members_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "operation_run_members_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "operation_run_members_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "wafer_process_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_members_legacy_step_execution_id_fkey"
            columns: ["legacy_step_execution_id"]
            isOneToOne: false
            referencedRelation: "step_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_members_legacy_step_execution_id_fkey"
            columns: ["legacy_step_execution_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["step_execution_id"]
          },
          {
            foreignKeyName: "operation_run_members_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "operation_run_members_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "operation_run_members_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "operation_run_members_wafer_id_fkey"
            columns: ["wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_runs_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "planned_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_runs_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "operation_runs_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "operation_runs_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_runs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_steps_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "process_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafers_parent_wafer_id_fkey"
            columns: ["parent_wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "wafers_parent_wafer_id_fkey"
            columns: ["parent_wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "wafers_parent_wafer_id_fkey"
            columns: ["parent_wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "wafers_parent_wafer_id_fkey"
            columns: ["parent_wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_plan_actual_state: {
        Row: {
          actual_run_count: number | null
          actual_runs: Json | null
          batch_members: Json | null
          batch_name: string | null
          first_started_at: string | null
          is_current_published: boolean | null
          is_shared_draft: boolean | null
          last_completed_at: string | null
          operation_logical_id: string | null
          plan_id: string | null
          plan_revision_id: string | null
          planned_operation_id: string | null
          planned_status: string | null
          process_step_id: string | null
          process_step_name: string | null
          project_id: string | null
          revision_status: string | null
          scheduled_end_at: string | null
          scheduled_start_at: string | null
          stage_id: string | null
          stage_name: string | null
          template_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planned_operations_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_plans_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_steps_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "process_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_plan_current_state: {
        Row: {
          batch_logical_id: string | null
          batch_members: Json | null
          batch_name: string | null
          description: string | null
          is_current_published: boolean | null
          is_shared_draft: boolean | null
          operation_logical_id: string | null
          operation_name: string | null
          operation_row_version: number | null
          operation_status: string | null
          parameters: Json | null
          plan_id: string | null
          plan_revision_id: string | null
          plan_revision_row_version: number | null
          planned_batch_id: string | null
          planned_operation_id: string | null
          planning_ends_at: string | null
          planning_starts_at: string | null
          predecessors: Json | null
          process_step_id: string | null
          process_step_name: string | null
          project_id: string | null
          resources: Json | null
          revision_number: number | null
          revision_status: string | null
          scheduled_end_at: string | null
          scheduled_start_at: string | null
          stage_id: string | null
          stage_name: string | null
          successors: Json | null
          template_id: string | null
          user_pinned: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "planned_operations_planned_batch_id_fkey"
            columns: ["planned_batch_id"]
            isOneToOne: false
            referencedRelation: "planned_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_operations_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_plans_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_steps_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "process_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_process_batch_history: {
        Row: {
          batch_id: string | null
          id: string | null
          note: string | null
          operator_name: string | null
          process_name: string | null
          process_step_id: string | null
          sample_count: number | null
          samples: Json | null
          status: string | null
          submitted_at: string | null
          template_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_step_attempts_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_step_attempts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_process_calendar_state: {
        Row: {
          action_name: string | null
          description: string | null
          ends_at: string | null
          id: string | null
          location: string | null
          location_id: string | null
          manual_event_id: string | null
          people: Json | null
          planned_operation_id: string | null
          process_step_id: string | null
          process_template_id: string | null
          project_id: string | null
          revision: number | null
          source_kind: string | null
          starts_at: string | null
          wafer_id: string | null
        }
        Relationships: []
      }
      vw_process_current_state: {
        Row: {
          anytime_return_step_id: string | null
          archived_at: string | null
          assigned_at: string | null
          assignment_id: string | null
          assignment_revision: number | null
          assignment_status:
            | Database["public"]["Enums"]["fabrication_status"]
            | null
          can_correct_checkpoint_route: boolean | null
          checkpoint_route_source_step_id: string | null
          completed_at: string | null
          current_handler_id: string | null
          current_handler_name: string | null
          current_member_revision: number | null
          current_member_status: string | null
          current_operation_run_id: string | null
          current_operation_run_member_id: string | null
          current_run_kind: string | null
          current_run_revision: number | null
          current_run_status: string | null
          current_stage_id: string | null
          current_stage_name: string | null
          current_stage_order: number | null
          current_stage_slug: string | null
          current_step_id: string | null
          current_step_name: string | null
          current_step_order: number | null
          current_step_slug: string | null
          current_tool_id: string | null
          deleted_at: string | null
          die_count: number | null
          die_label: string | null
          item_type: string | null
          latest_attempt_id: string | null
          latest_attempt_notes: string | null
          latest_attempt_submitted_by: string | null
          latest_review_status: string | null
          latest_submitted_at: string | null
          legacy_step_execution_id: string | null
          next_step_name: string | null
          parent_wafer_id: string | null
          planned_operation_id: string | null
          project_id: string | null
          required_reviewer_id: string | null
          required_reviewer_name: string | null
          stage_progress: Json | null
          started_at: string | null
          template_id: string | null
          wafer_code: string | null
          wafer_created_at: string | null
          wafer_family: string | null
          wafer_id: string | null
          wafer_metadata: Json | null
          wafer_notes: string | null
          wafer_status: Database["public"]["Enums"]["fabrication_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_run_members_legacy_step_execution_id_fkey"
            columns: ["legacy_step_execution_id"]
            isOneToOne: false
            referencedRelation: "step_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_members_legacy_step_execution_id_fkey"
            columns: ["legacy_step_execution_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["step_execution_id"]
          },
          {
            foreignKeyName: "operation_run_members_operation_run_id_fkey"
            columns: ["current_operation_run_id"]
            isOneToOne: false
            referencedRelation: "operation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_run_members_operation_run_id_fkey"
            columns: ["current_operation_run_id"]
            isOneToOne: false
            referencedRelation: "vw_batch_run_state"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "operation_run_members_operation_run_id_fkey"
            columns: ["current_operation_run_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_id"]
          },
          {
            foreignKeyName: "operation_runs_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "planned_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_runs_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_actual_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "operation_runs_planned_operation_id_fkey"
            columns: ["planned_operation_id"]
            isOneToOne: false
            referencedRelation: "vw_plan_current_state"
            referencedColumns: ["planned_operation_id"]
          },
          {
            foreignKeyName: "operation_runs_process_step_id_fkey"
            columns: ["checkpoint_route_source_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_step_attempts_submitted_by_fkey"
            columns: ["latest_attempt_submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_steps_required_reviewer_id_fkey"
            columns: ["required_reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_steps_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "process_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_executions_tool_id_fkey"
            columns: ["current_tool_id"]
            isOneToOne: false
            referencedRelation: "fabrication_tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_executions_tool_id_fkey"
            columns: ["current_tool_id"]
            isOneToOne: false
            referencedRelation: "vw_tool_utilization_daily"
            referencedColumns: ["tool_id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_anytime_return_step_id_fkey"
            columns: ["anytime_return_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_current_operation_run_member_id_fkey"
            columns: ["current_operation_run_member_id"]
            isOneToOne: false
            referencedRelation: "operation_run_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_current_operation_run_member_id_fkey"
            columns: ["current_operation_run_member_id"]
            isOneToOne: false
            referencedRelation: "vw_operation_run_history"
            referencedColumns: ["operation_run_member_id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafer_process_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafers_parent_wafer_id_fkey"
            columns: ["parent_wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_process_current_state"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "wafers_parent_wafer_id_fkey"
            columns: ["parent_wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_step_cycle_metrics"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "wafers_parent_wafer_id_fkey"
            columns: ["parent_wafer_id"]
            isOneToOne: false
            referencedRelation: "vw_wafer_cycle_time"
            referencedColumns: ["wafer_id"]
          },
          {
            foreignKeyName: "wafers_parent_wafer_id_fkey"
            columns: ["parent_wafer_id"]
            isOneToOne: false
            referencedRelation: "wafers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_step_cycle_metrics: {
        Row: {
          completed_at: string | null
          expected_duration_minutes: number | null
          process_area: string | null
          project_id: string | null
          queue_minutes: number | null
          run_minutes: number | null
          status: Database["public"]["Enums"]["step_status"] | null
          step_execution_id: string | null
          step_name: string | null
          wafer_code: string | null
          wafer_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wafers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_tool_utilization_daily: {
        Row: {
          completed_run_minutes: number | null
          reserved_minutes: number | null
          tool_id: string | null
          tool_name: string | null
          utilization_day: string | null
        }
        Relationships: []
      }
      vw_wafer_cycle_time: {
        Row: {
          assignment_id: string | null
          completed_at: string | null
          completed_steps: number | null
          project_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["fabrication_status"] | null
          template_id: string | null
          total_cycle_hours: number | null
          total_steps: number | null
          wafer_code: string | null
          wafer_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wafer_process_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_wip_by_stage: {
        Row: {
          process_area: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["step_status"] | null
          step_name: string | null
          template_id: string | null
          wafer_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "process_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wafers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_plan_adjustment_proposal: {
        Args: { mutation_id: string; target_proposal_id: string }
        Returns: Json
      }
      archive_completed_wafer_assignments: {
        Args: { mutation_ids: string[]; target_assignment_ids: string[] }
        Returns: {
          archived_at: string
          assignment_id: string
          wafer_id: string
        }[]
      }
      archive_draft_process_step: {
        Args: { target_step_id: string }
        Returns: {
          archived_at: string | null
          canvas_x: number | null
          canvas_y: number | null
          created_at: string
          execution_mode: string
          expected_duration_minutes: number | null
          id: string
          instructions: string | null
          name: string
          node_type: string
          parameters_schema: Json
          process_area: string
          queue_target_minutes: number | null
          required_reviewer_id: string | null
          required_tool_type: string | null
          requires_recipe: boolean
          revision: number
          slug: string
          stage_id: string
          stage_step_order: number
          step_order: number
          template_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "process_steps"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_restore_is_authorized: {
        Args: {
          target_step_id: string
          target_template_id: string
          target_wafer_id: string
        }
        Returns: boolean
      }
      assign_draft_process_step_reviewer: {
        Args: { reviewer_id: string; target_step_id: string }
        Returns: {
          archived_at: string | null
          canvas_x: number | null
          canvas_y: number | null
          created_at: string
          execution_mode: string
          expected_duration_minutes: number | null
          id: string
          instructions: string | null
          name: string
          node_type: string
          parameters_schema: Json
          process_area: string
          queue_target_minutes: number | null
          required_reviewer_id: string | null
          required_tool_type: string | null
          requires_recipe: boolean
          revision: number
          slug: string
          stage_id: string
          stage_step_order: number
          step_order: number
          template_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "process_steps"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_process_step_checkpoint_reviewer: {
        Args: { reviewer_id: string; target_step_id: string }
        Returns: {
          archived_at: string | null
          canvas_x: number | null
          canvas_y: number | null
          created_at: string
          execution_mode: string
          expected_duration_minutes: number | null
          id: string
          instructions: string | null
          name: string
          node_type: string
          parameters_schema: Json
          process_area: string
          queue_target_minutes: number | null
          required_reviewer_id: string | null
          required_tool_type: string | null
          requires_recipe: boolean
          revision: number
          slug: string
          stage_id: string
          stage_step_order: number
          step_order: number
          template_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "process_steps"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      calendar_schedule_item_json: {
        Args: { target_item_id: string }
        Returns: Json
      }
      can_access_project: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      can_access_step_execution: {
        Args: { target_step_execution_id: string }
        Returns: boolean
      }
      can_access_wafer: { Args: { target_wafer_id: string }; Returns: boolean }
      can_edit_project: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      can_manage_process_library: { Args: never; Returns: boolean }
      can_receive_waferwatch_broadcast: {
        Args: { target_topic: string }
        Returns: boolean
      }
      can_view_checkpoint_reviewer_history: {
        Args: { target_template_id: string }
        Returns: boolean
      }
      can_view_profile: {
        Args: { target_profile_id: string }
        Returns: boolean
      }
      checkpoint_actor_name: {
        Args: { target_user_id: string }
        Returns: string
      }
      checkpoint_decision_targets_step: {
        Args: { target_assignment_id: string; target_step_id: string }
        Returns: boolean
      }
      checkpoint_dicing_child_is_authorized: {
        Args: {
          target_step_id: string
          target_template_id: string
          target_wafer_id: string
        }
        Returns: boolean
      }
      checkpoint_reviewer_can_edit_project: {
        Args: { target_project_id: string; target_user_id: string }
        Returns: boolean
      }
      checkpoint_reviewer_reassignment_is_authorized: {
        Args: {
          target_previous_reviewer_id: string
          target_replacement_reviewer_id: string
          target_step_id: string
        }
        Returns: boolean
      }
      checkpoint_step_is_dicing: {
        Args: {
          step_name: string
          step_process_area: string
          step_slug: string
        }
        Returns: boolean
      }
      checkpoint_transition_is_authorized: {
        Args: {
          target_assignment_id: string
          target_step_execution_id?: string
        }
        Returns: boolean
      }
      claim_wafer_assignment_move: {
        Args: {
          expected_source_step_id: string
          next_step_id: string
          target_assignment_id: string
        }
        Returns: {
          anytime_return_step_id: string | null
          archived_at: string | null
          archived_by: string | null
          assigned_at: string
          assigned_by: string | null
          completed_at: string | null
          current_operation_run_member_id: string | null
          current_step_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          revision: number
          started_at: string | null
          status: Database["public"]["Enums"]["fabrication_status"]
          template_id: string
          wafer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wafer_process_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      commit_workflow_change: {
        Args: {
          changed_entities: Json
          mutation_id: string
          mutation_kind: string
          target_template_id: string
        }
        Returns: number
      }
      complete_operation_run: {
        Args: {
          expected_revision: number
          member_results: Json
          mutation_id: string
          notes: Json
          parameters: Json
          resources: Json
          run_id: string
        }
        Returns: Json
      }
      correct_checkpoint_route_assignment: {
        Args: {
          mutation_id: string
          notes: string
          target_assignment_id: string
          target_step_id: string
        }
        Returns: Json
      }
      correct_wafer_process_history: {
        Args: {
          anchor_visit_id: string
          completed_at: string
          correction_kind: string
          expected_history_revision: number
          mutation_id: string
          parameter_notes?: Json
          parameter_values?: Json
          placement: string
          reason: string
          target_assignment_id: string
          target_step_id: string
          target_visit_id: string
        }
        Returns: Json
      }
      create_calendar_schedule_item: {
        Args: {
          description: string
          ends_at: string
          manual_action: string
          mutation_id: string
          person_ids: string[]
          starts_at: string
          target_location: string
          target_step_id: string
          target_template_id: string
          target_wafer_id: string
        }
        Returns: Json
      }
      create_ordered_draft_process_step: {
        Args: {
          reviewer_id?: string
          step_canvas_x?: number
          step_canvas_y?: number
          step_expected_duration_minutes?: number
          step_instructions?: string
          step_name: string
          step_parameters_schema?: Json
          step_process_area: string
          step_queue_target_minutes?: number
          step_required_tool_type?: string
          step_requires_recipe?: boolean
          step_slug: string
          target_position: number
          target_template_id: string
        }
        Returns: {
          archived_at: string | null
          canvas_x: number | null
          canvas_y: number | null
          created_at: string
          execution_mode: string
          expected_duration_minutes: number | null
          id: string
          instructions: string | null
          name: string
          node_type: string
          parameters_schema: Json
          process_area: string
          queue_target_minutes: number | null
          required_reviewer_id: string | null
          required_tool_type: string | null
          requires_recipe: boolean
          revision: number
          slug: string
          stage_id: string
          stage_step_order: number
          step_order: number
          template_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "process_steps"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_plan_replan_request: {
        Args: {
          mutation_id: string
          request_kind: string
          requested_change: Json
          source_run_id: string
          target_plan_id: string
        }
        Returns: {
          client_mutation_id: string
          draft_revision_id: string
          id: string
          plan_id: string
          processed_at: string | null
          request_kind: string
          requested_at: string
          requested_by: string | null
          requested_change: Json
          source_run_id: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "plan_replan_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_planned_batch: {
        Args: {
          assignment_ids: string[]
          batch_name: string
          batch_note: string
          logical_id: string
          mutation_id: string
          target_revision_id: string
        }
        Returns: Json
      }
      create_planned_operation: {
        Args: {
          ends_at: string
          logical_id: string
          mutation_id: string
          operation_name: string
          parameter_rows: Json
          resource_rows: Json
          starts_at: string
          target_batch_id: string
          target_revision_id: string
          target_step_id: string
          user_pinned: boolean
        }
        Returns: Json
      }
      create_process_plan: {
        Args: {
          mutation_id: string
          planning_ends_at: string
          planning_starts_at: string
          target_project_id: string
          target_template_id: string
        }
        Returns: Json
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      delete_calendar_schedule_item: {
        Args: {
          expected_revision: number
          mutation_id: string
          target_item_id: string
        }
        Returns: Json
      }
      delete_planned_operation: {
        Args: {
          expected_revision: number
          mutation_id: string
          target_operation_id: string
        }
        Returns: Json
      }
      derived_mutation_uuid: {
        Args: { entity_id: string; mutation_id: string; purpose: string }
        Returns: string
      }
      duplicate_process_template_version: {
        Args: {
          next_name?: string
          next_version: string
          source_template_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          lifecycle_status: string
          name: string
          owner_project_id: string | null
          published_at: string | null
          published_by: string | null
          source_template_id: string | null
          updated_at: string
          version: string
        }
        SetofOptions: {
          from: "*"
          to: "process_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_calendar_plan_draft: {
        Args: {
          ends_at: string
          starts_at: string
          target_project_id: string
          target_template_id: string
        }
        Returns: {
          based_on_revision_id: string | null
          created_at: string
          created_by: string | null
          id: string
          plan_id: string
          planning_ends_at: string
          planning_starts_at: string
          published_at: string | null
          published_by: string | null
          revision_number: number
          row_version: number
          status: string
          superseded_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "process_plan_revisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_compatibility_history_member: {
        Args: {
          actor_id: string
          identity_id: string
          occurred_at: string
          target_run_kind: string
          target_step_execution_id: string
        }
        Returns: {
          assignment_id: string
          completed_at: string | null
          created_at: string
          history_effective: boolean
          history_suppression_reason: string | null
          id: string
          legacy_step_execution_id: string | null
          note: string | null
          operation_run_id: string
          revision: number
          started_at: string | null
          status: string
          updated_at: string
          wafer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "operation_run_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_compatibility_step_execution: {
        Args: {
          actor_id: string
          target_assignment_id: string
          target_run_id: string
          target_status: Database["public"]["Enums"]["step_status"]
          target_step_id: string
          target_wafer_id: string
        }
        Returns: {
          assignment_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          metadata: Json
          operator_id: string | null
          planned_end_at: string | null
          planned_start_at: string | null
          process_step_id: string
          queue_started_at: string | null
          recipe_id: string | null
          run_notes: string | null
          skipped_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["step_status"]
          tool_id: string | null
          updated_at: string
          wafer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "step_executions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      execute_process_flow_mutations_batch: {
        Args: { mutations: Json }
        Returns: Json
      }
      get_process_workspace_delta: {
        Args: { after_revision: number; target_template_id: string }
        Returns: Json
      }
      get_process_workspace_snapshot: {
        Args: { target_template_id: string }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      move_approved_checkpoint_assignment: {
        Args: {
          mutation_id: string
          notes: string
          target_assignment_id: string
          target_step_id: string
        }
        Returns: Json
      }
      move_calendar_schedule_item: {
        Args: {
          ends_at: string
          expected_revision: number
          mutation_id: string
          starts_at: string
          target_item_id: string
          target_location: string
        }
        Returns: Json
      }
      mutate_text_surface_json_array: {
        Args: {
          item?: Json
          item_id: string
          operation: string
          target_field_key: string
          target_project_id: string
          target_scope_key: string
          target_scope_type: string
        }
        Returns: {
          created_at: string
          field_key: string
          id: string
          project_id: string
          scope_key: string
          scope_type: string
          updated_at: string
          updated_by: string | null
          value: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "text_surfaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      normalize_draft_process_step_order: {
        Args: {
          moved_step_id: string
          target_position: number
          target_template_id: string
        }
        Returns: {
          archived_at: string | null
          canvas_x: number | null
          canvas_y: number | null
          created_at: string
          execution_mode: string
          expected_duration_minutes: number | null
          id: string
          instructions: string | null
          name: string
          node_type: string
          parameters_schema: Json
          process_area: string
          queue_target_minutes: number | null
          required_reviewer_id: string | null
          required_tool_type: string | null
          requires_recipe: boolean
          revision: number
          slug: string
          stage_id: string
          stage_step_order: number
          step_order: number
          template_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "process_steps"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      patch_wafer_die_poling_parameters: {
        Args: {
          target_die_code: string
          target_wafer_id: string
          updates: Json
        }
        Returns: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          diameter_mm: number | null
          die_count: number | null
          die_label: string | null
          id: string
          item_type: string | null
          lot_id: string | null
          material_stack: string | null
          metadata: Json
          notes: string | null
          parent_wafer_id: string | null
          project_id: string
          status: Database["public"]["Enums"]["fabrication_status"]
          updated_at: string
          wafer_code: string
          wafer_family: string | null
        }
        SetofOptions: {
          from: "*"
          to: "wafers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      path_project_id: { Args: { object_path: string }; Returns: string }
      publish_process_plan: {
        Args: {
          expected_revision: number
          mutation_id: string
          target_revision_id: string
        }
        Returns: Json
      }
      publish_process_template_version: {
        Args: { target_template_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          lifecycle_status: string
          name: string
          owner_project_id: string | null
          published_at: string | null
          published_by: string | null
          source_template_id: string | null
          updated_at: string
          version: string
        }
        SetofOptions: {
          from: "*"
          to: "process_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reassign_unavailable_checkpoint_reviewer: {
        Args: {
          mutation_id: string
          reason: string
          replacement_reviewer_id: string
          target_step_id: string
        }
        Returns: {
          changed_at: string
          changed_by: string
          changed_by_name_snapshot: string
          client_mutation_id: string
          id: string
          new_reviewer_id: string
          new_reviewer_name_snapshot: string
          previous_reviewer_id: string | null
          previous_reviewer_name_snapshot: string
          process_step_id: string
          reason: string
          template_id: string
          transaction_id: number
        }
        SetofOptions: {
          from: "*"
          to: "checkpoint_reviewer_reassignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reconcile_dicing_checkpoint_split: {
        Args: { target_child_wafer_ids: string[]; target_decision_id: string }
        Returns: Json
      }
      record_compatibility_operation_arrival: {
        Args: {
          movement_mutation_id: string
          target_batch_id: string
          target_note: string
          target_parent_run_id: string
          target_run_kind: string
          target_step_execution_id: string
        }
        Returns: Json
      }
      record_planned_batch_member: {
        Args: {
          batch_note?: string
          parent_batch_id?: string
          planned_end_at?: string
          planned_location?: string
          planned_start_at?: string
          target_batch_id: string
          target_step_execution_id: string
        }
        Returns: string
      }
      refresh_operation_run_history_state: {
        Args: { target_run_id: string }
        Returns: undefined
      }
      repair_operation_history_from_evidence: { Args: never; Returns: Json }
      replace_planned_batch_members: {
        Args: {
          assignment_ids: string[]
          expected_revision: number
          mutation_id: string
          target_batch_id: string
        }
        Returns: Json
      }
      replace_planned_operation_inputs: {
        Args: {
          parameter_rows: Json
          resource_rows: Json
          target_operation_id: string
        }
        Returns: undefined
      }
      require_editable_plan_revision: {
        Args: { target_revision_id: string }
        Returns: {
          based_on_revision_id: string | null
          created_at: string
          created_by: string | null
          id: string
          plan_id: string
          planning_ends_at: string
          planning_starts_at: string
          published_at: string | null
          published_by: string | null
          revision_number: number
          row_version: number
          status: string
          superseded_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "process_plan_revisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restore_archived_wafer_to_step: {
        Args: {
          archived_assignment_id: string
          mutation_id: string
          target_step_id: string
          target_wafer_id: string
        }
        Returns: Json
      }
      review_dicing_step_checkpoint: {
        Args: {
          child_specs?: Json
          mutation_id: string
          notes?: string
          target_attempt_id: string
        }
        Returns: {
          assignment_id: string
          attempt_id: string
          client_mutation_id: string
          created_at: string
          decided_at: string
          decided_by: string | null
          decided_by_name_snapshot: string
          decision: string
          decision_notes: string | null
          id: string
          process_step_id: string
          process_step_name_snapshot: string
          process_step_order_snapshot: number
          step_execution_id: string
          target_step_id: string | null
          target_step_name_snapshot: string | null
          target_step_order_snapshot: number | null
          template_id: string
          wafer_code_snapshot: string
          wafer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "checkpoint_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_operation_run_members: {
        Args: {
          decisions: Json
          expected_member_revisions: Json
          mutation_id: string
          run_id: string
        }
        Returns: Json
      }
      review_step_checkpoint: {
        Args: {
          mutation_id: string
          notes?: string
          redo_target_step_id?: string
          review_decision: string
          target_attempt_id: string
        }
        Returns: {
          assignment_id: string
          attempt_id: string
          client_mutation_id: string
          created_at: string
          decided_at: string
          decided_by: string | null
          decided_by_name_snapshot: string
          decision: string
          decision_notes: string | null
          id: string
          process_step_id: string
          process_step_name_snapshot: string
          process_step_order_snapshot: number
          step_execution_id: string
          target_step_id: string | null
          target_step_name_snapshot: string | null
          target_step_order_snapshot: number | null
          template_id: string
          wafer_code_snapshot: string
          wafer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "checkpoint_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      route_checkpoint_submission: {
        Args: {
          child_specs?: Json
          decision_mutation_id: string
          movement_mutation_id: string
          notes: string
          target_attempt_id: string
          target_step_id: string
        }
        Returns: Json
      }
      save_operation_parameter_records_batch: {
        Args: {
          entries: Json
          global_values: Json
          local_parameters: Json
          notes?: string
        }
        Returns: Json
      }
      save_step_parameter_records_batch: {
        Args: {
          entries: Json
          global_values: Json
          local_parameters: Json
          notes?: string
        }
        Returns: {
          assignment_id: string
          created_at: string
          global_values: Json
          id: string
          local_parameters: Json
          movement_mutation_id: string
          notes: string | null
          process_event_id: string
          process_step_id: string
          project_id: string
          recorded_by: string | null
          revision: number
          schema_snapshot: Json
          step_execution_id: string | null
          updated_at: string
          wafer_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "step_parameter_records"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      soft_delete_process_flow_wafer_family: {
        Args: { target_project_id: string; target_wafer_ids: string[] }
        Returns: {
          wafer_id: string
        }[]
      }
      start_operation_run: {
        Args: {
          assignment_ids: string[]
          expected_assignment_revisions: Json
          mutation_id: string
          planned_operation_id: string
          process_step_id: string
          reason: string
          run_kind: string
          source_run_ids: string[]
        }
        Returns: Json
      }
      store_plan_adjustment_proposal: {
        Args: {
          expected_draft_version: number
          moved_operations: Json
          scheduler_version: string
          target_request_id: string
          unresolved_conflicts: Json
        }
        Returns: {
          applied_at: string | null
          applied_by: string | null
          base_draft_row_version: number
          draft_revision_id: string
          generated_at: string
          id: string
          moved_operations: Json
          plan_id: string
          request_id: string
          scheduler_version: string
          status: string
          unresolved_conflicts: Json
        }
        SetofOptions: {
          from: "*"
          to: "plan_adjustment_proposals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_operation_run: {
        Args: { expected_revision: number; mutation_id: string; run_id: string }
        Returns: Json
      }
      submit_step_checkpoint: {
        Args: {
          evidence?: Json
          mutation_id: string
          notes?: string
          target_step_execution_id: string
        }
        Returns: {
          assignment_id: string
          attempt_number: number
          batch_id: string | null
          client_mutation_id: string
          created_at: string
          evidence_snapshot: Json
          id: string
          operation_run_member_id: string | null
          prior_step_status: Database["public"]["Enums"]["step_status"]
          process_step_id: string
          process_step_name_snapshot: string
          process_step_order_snapshot: number
          reviewer_id_snapshot: string | null
          reviewer_name_snapshot: string
          started_at_snapshot: string | null
          step_execution_id: string
          submission_group_id: string | null
          submission_notes: string | null
          submitted_at: string
          submitted_by: string | null
          submitted_by_name_snapshot: string
          template_id: string
          template_name_snapshot: string
          template_version_snapshot: string
          wafer_code_snapshot: string
          wafer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "process_step_attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      touch_plan_draft: {
        Args: { target_revision_id: string }
        Returns: number
      }
      undo_die_process_history_state: {
        Args: {
          expected_step_id: string
          expected_step_status: string
          mutation_id: string
          target_assignment_id: string
        }
        Returns: Json
      }
      update_calendar_schedule_item: {
        Args: {
          description: string
          expected_revision: number
          manual_action: string
          mutation_id: string
          person_ids: string[]
          target_item_id: string
          target_step_id: string
          target_wafer_id: string
        }
        Returns: Json
      }
      update_planned_operation: {
        Args: {
          expected_revision: number
          mutation_id: string
          patch: Json
          target_operation_id: string
        }
        Returns: Json
      }
      update_process_step_positions_versioned: {
        Args: { position_updates: Json }
        Returns: {
          archived_at: string | null
          canvas_x: number | null
          canvas_y: number | null
          created_at: string
          execution_mode: string
          expected_duration_minutes: number | null
          id: string
          instructions: string | null
          name: string
          node_type: string
          parameters_schema: Json
          process_area: string
          queue_target_minutes: number | null
          required_reviewer_id: string | null
          required_tool_type: string | null
          requires_recipe: boolean
          revision: number
          slug: string
          stage_id: string
          stage_step_order: number
          step_order: number
          template_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "process_steps"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      upsert_text_surface_versioned: {
        Args: {
          expected_version?: number
          next_value: string
          target_field_key: string
          target_project_id: string
          target_scope_key: string
          target_scope_type: string
        }
        Returns: {
          created_at: string
          field_key: string
          id: string
          project_id: string
          scope_key: string
          scope_type: string
          updated_at: string
          updated_by: string | null
          value: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "text_surfaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_planned_operation_schedule: {
        Args: { target_operation_id: string }
        Returns: Json
      }
      withdraw_step_checkpoint_submission: {
        Args: {
          mutation_id: string
          reason?: string
          target_attempt_id: string
        }
        Returns: {
          assignment_id: string
          attempt_id: string
          client_mutation_id: string
          created_at: string
          id: string
          process_step_id: string
          process_step_name_snapshot: string
          step_execution_id: string
          template_id: string
          wafer_code_snapshot: string
          wafer_id: string
          withdrawal_reason: string | null
          withdrawn_at: string
          withdrawn_by: string | null
          withdrawn_by_name_snapshot: string
        }
        SetofOptions: {
          from: "*"
          to: "checkpoint_submission_withdrawals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      fabrication_status:
        | "planned"
        | "queued"
        | "in_progress"
        | "on_hold"
        | "completed"
        | "scrapped"
      issue_severity: "low" | "medium" | "high" | "critical"
      issue_status: "open" | "investigating" | "resolved" | "closed"
      project_member_role: "owner" | "editor" | "viewer"
      project_status: "active" | "archived"
      project_visibility: "private" | "group"
      reservation_status: "scheduled" | "cancelled" | "completed"
      step_status:
        | "pending"
        | "queued"
        | "running"
        | "blocked"
        | "completed"
        | "skipped"
        | "failed"
        | "awaiting_checkpoint"
        | "redo_required"
        | "ready_to_move"
      tool_status: "available" | "maintenance" | "offline" | "reserved"
      user_role: "admin" | "process_engineer" | "researcher" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      fabrication_status: [
        "planned",
        "queued",
        "in_progress",
        "on_hold",
        "completed",
        "scrapped",
      ],
      issue_severity: ["low", "medium", "high", "critical"],
      issue_status: ["open", "investigating", "resolved", "closed"],
      project_member_role: ["owner", "editor", "viewer"],
      project_status: ["active", "archived"],
      project_visibility: ["private", "group"],
      reservation_status: ["scheduled", "cancelled", "completed"],
      step_status: [
        "pending",
        "queued",
        "running",
        "blocked",
        "completed",
        "skipped",
        "failed",
        "awaiting_checkpoint",
        "redo_required",
        "ready_to_move",
      ],
      tool_status: ["available", "maintenance", "offline", "reserved"],
      user_role: ["admin", "process_engineer", "researcher", "viewer"],
    },
  },
} as const
