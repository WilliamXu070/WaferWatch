-- First-class process hierarchy, collaborative planning, and append-only
-- operation-run evidence. Compatibility tables remain readable and writable
-- until the application shadow comparison is complete.

create table if not exists public.process_stages (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.process_templates(id) on delete cascade,
  name text not null,
  slug text not null,
  stage_order integer not null,
  canvas_x integer,
  canvas_y integer,
  revision bigint not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, stage_order),
  unique (template_id, slug),
  constraint process_stages_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint process_stages_revision_positive check (revision > 0)
);

alter table public.process_steps
  add column if not exists stage_id uuid references public.process_stages(id) on delete restrict,
  add column if not exists stage_step_order integer;

insert into public.process_stages (
  template_id, name, slug, stage_order, canvas_x, canvas_y, revision, archived_at, created_at, updated_at
)
select
  step.template_id,
  step.name,
  step.slug,
  step.step_order,
  step.canvas_x,
  step.canvas_y,
  greatest(step.revision, 1),
  step.archived_at,
  step.created_at,
  step.updated_at
from public.process_steps step
where not exists (
  select 1
  from public.process_stages stage
  where stage.template_id = step.template_id
    and stage.slug = step.slug
)
on conflict (template_id, slug) do nothing;

update public.process_steps step
set stage_id = stage.id,
    stage_step_order = 1
from public.process_stages stage
where stage.template_id = step.template_id
  and stage.slug = step.slug
  and step.stage_id is null;

alter table public.process_steps
  alter column stage_id set not null,
  alter column stage_step_order set not null;

create unique index if not exists process_steps_stage_order_idx
  on public.process_steps (stage_id, stage_step_order)
  where archived_at is null;

create index if not exists process_stages_template_order_idx
  on public.process_stages (template_id, stage_order)
  where archived_at is null;

drop trigger if exists process_stages_set_updated_at on public.process_stages;
create trigger process_stages_set_updated_at
  before update on public.process_stages
  for each row execute function public.set_updated_at();

drop trigger if exists process_stages_bump_revision on public.process_stages;
create trigger process_stages_bump_revision
  before update on public.process_stages
  for each row execute function public.bump_collaboration_revision();

create table if not exists public.fabrication_locations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  timezone text not null default 'America/Toronto',
  travel_group text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fabrication_locations_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint fabrication_locations_name_not_blank check (length(trim(name)) > 0),
  constraint fabrication_locations_metadata_object check (jsonb_typeof(metadata) = 'object')
);

insert into public.fabrication_locations (slug, name, travel_group)
values
  ('mcmaster', 'McMaster', 'hamilton'),
  ('waterloo', 'Waterloo', 'waterloo'),
  ('toronto', 'Toronto', 'toronto')
on conflict (slug) do update set name = excluded.name;

alter table public.process_calendar_events
  add column if not exists location_id uuid references public.fabrication_locations(id) on delete restrict;

update public.process_calendar_events event
set location_id = location.id
from public.fabrication_locations location
where location.name = event.location
  and event.location_id is null;

create index if not exists process_calendar_events_location_id_idx
  on public.process_calendar_events (location_id, starts_at, ends_at);

create table if not exists public.process_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  template_id uuid not null references public.process_templates(id) on delete restrict,
  name text not null default 'Fabrication plan',
  is_active boolean not null default true,
  shared_draft_revision_id uuid,
  current_published_revision_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint process_plans_name_not_blank check (length(trim(name)) > 0)
);

create unique index if not exists process_plans_active_project_template_idx
  on public.process_plans (project_id, template_id)
  where is_active;

create table if not exists public.process_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.process_plans(id) on delete restrict,
  revision_number bigint not null,
  status text not null default 'draft',
  based_on_revision_id uuid references public.process_plan_revisions(id) on delete restrict,
  planning_starts_at timestamptz not null,
  planning_ends_at timestamptz not null,
  row_version bigint not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  superseded_at timestamptz,
  unique (plan_id, revision_number),
  constraint process_plan_revisions_status_check check (status in ('draft', 'published', 'superseded')),
  constraint process_plan_revisions_window_check check (planning_ends_at > planning_starts_at),
  constraint process_plan_revisions_version_positive check (row_version > 0),
  constraint process_plan_revisions_publish_metadata_check check (
    (status = 'draft' and published_at is null and published_by is null)
    or (status in ('published', 'superseded') and published_at is not null)
  )
);

alter table public.process_plans
  add constraint process_plans_shared_draft_fk
  foreign key (shared_draft_revision_id) references public.process_plan_revisions(id) on delete restrict;

alter table public.process_plans
  add constraint process_plans_current_published_fk
  foreign key (current_published_revision_id) references public.process_plan_revisions(id) on delete restrict;

create unique index if not exists process_plan_revisions_one_draft_idx
  on public.process_plan_revisions (plan_id)
  where status = 'draft';

create table if not exists public.planned_batches (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.process_plan_revisions(id) on delete restrict,
  logical_id uuid not null,
  name text not null,
  note text,
  row_version bigint not null default 1,
  user_pinned boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (revision_id, logical_id),
  constraint planned_batches_name_not_blank check (length(trim(name)) > 0),
  constraint planned_batches_version_positive check (row_version > 0)
);

create table if not exists public.planned_batch_members (
  id uuid primary key default gen_random_uuid(),
  planned_batch_id uuid not null references public.planned_batches(id) on delete restrict,
  assignment_id uuid not null references public.wafer_process_assignments(id) on delete restrict,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (planned_batch_id, assignment_id)
);

create table if not exists public.planned_operations (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.process_plan_revisions(id) on delete restrict,
  logical_id uuid not null,
  process_step_id uuid not null references public.process_steps(id) on delete restrict,
  planned_batch_id uuid references public.planned_batches(id) on delete restrict,
  name text not null,
  description text,
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  status text not null default 'planned',
  user_pinned boolean not null default false,
  row_version bigint not null default 1,
  legacy_calendar_event_id uuid references public.process_calendar_events(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (revision_id, logical_id),
  unique (revision_id, legacy_calendar_event_id),
  constraint planned_operations_name_not_blank check (length(trim(name)) > 0),
  constraint planned_operations_window_check check (scheduled_end_at > scheduled_start_at),
  constraint planned_operations_status_check check (status in ('planned', 'ready', 'cancelled')),
  constraint planned_operations_version_positive check (row_version > 0)
);

create table if not exists public.planned_operation_dependencies (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.process_plan_revisions(id) on delete restrict,
  predecessor_operation_id uuid not null references public.planned_operations(id) on delete restrict,
  successor_operation_id uuid not null references public.planned_operations(id) on delete restrict,
  dependency_kind text not null default 'finish_to_start',
  lag_minutes integer not null default 0,
  created_at timestamptz not null default now(),
  unique (revision_id, predecessor_operation_id, successor_operation_id),
  constraint planned_operation_dependencies_kind_check check (dependency_kind = 'finish_to_start'),
  constraint planned_operation_dependencies_lag_nonnegative check (lag_minutes >= 0),
  constraint planned_operation_dependencies_not_self check (predecessor_operation_id <> successor_operation_id)
);

create table if not exists public.planned_operation_parameters (
  id uuid primary key default gen_random_uuid(),
  planned_operation_id uuid not null references public.planned_operations(id) on delete restrict,
  assignment_id uuid references public.wafer_process_assignments(id) on delete restrict,
  parameter_key text not null,
  scope text not null default 'global',
  value jsonb not null default 'null'::jsonb,
  schema_snapshot jsonb not null default '{}'::jsonb,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (planned_operation_id, assignment_id, parameter_key),
  constraint planned_operation_parameters_scope_check check (
    (scope = 'global' and assignment_id is null)
    or (scope = 'member' and assignment_id is not null)
  ),
  constraint planned_operation_parameters_key_format check (parameter_key ~ '^[a-z][a-z0-9_]{0,79}$'),
  constraint planned_operation_parameters_schema_object check (jsonb_typeof(schema_snapshot) = 'object'),
  constraint planned_operation_parameters_version_positive check (row_version > 0)
);

create table if not exists public.planned_operation_resources (
  id uuid primary key default gen_random_uuid(),
  planned_operation_id uuid not null references public.planned_operations(id) on delete restrict,
  resource_kind text not null,
  person_id uuid references public.process_people(id) on delete restrict,
  tool_id uuid references public.fabrication_tools(id) on delete restrict,
  recipe_id uuid references public.recipes(id) on delete restrict,
  location_id uuid references public.fabrication_locations(id) on delete restrict,
  quantity numeric(12, 3) not null default 1,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_operation_resources_kind_check check (resource_kind in ('person', 'tool', 'recipe', 'location')),
  constraint planned_operation_resources_one_typed_reference check (
    num_nonnulls(person_id, tool_id, recipe_id, location_id) = 1
    and (resource_kind = 'person') = (person_id is not null)
    and (resource_kind = 'tool') = (tool_id is not null)
    and (resource_kind = 'recipe') = (recipe_id is not null)
    and (resource_kind = 'location') = (location_id is not null)
  ),
  constraint planned_operation_resources_quantity_positive check (quantity > 0),
  constraint planned_operation_resources_version_positive check (row_version > 0)
);

create index if not exists planned_operations_revision_time_idx
  on public.planned_operations (revision_id, scheduled_start_at, scheduled_end_at);
create index if not exists planned_operations_step_time_idx
  on public.planned_operations (process_step_id, scheduled_start_at, scheduled_end_at);
create index if not exists planned_batch_members_assignment_idx
  on public.planned_batch_members (assignment_id, planned_batch_id);
create index if not exists planned_operation_resources_person_idx
  on public.planned_operation_resources (person_id, planned_operation_id) where person_id is not null;
create index if not exists planned_operation_resources_tool_idx
  on public.planned_operation_resources (tool_id, planned_operation_id) where tool_id is not null;
create index if not exists planned_operation_resources_location_idx
  on public.planned_operation_resources (location_id, planned_operation_id) where location_id is not null;

create table if not exists public.operation_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.process_templates(id) on delete restrict,
  process_step_id uuid not null references public.process_steps(id) on delete restrict,
  planned_operation_id uuid references public.planned_operations(id) on delete set null,
  run_kind text not null default 'normal',
  status text not null default 'queued',
  reason text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  revision bigint not null default 1,
  client_mutation_id uuid,
  legacy_batch_id uuid references public.process_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, client_mutation_id),
  constraint operation_runs_kind_check check (run_kind in ('normal', 'redo', 'rework', 'restore', 'ad_hoc')),
  constraint operation_runs_status_check check (status in ('queued', 'running', 'blocked', 'completed', 'awaiting_review', 'redo_required', 'failed', 'cancelled')),
  constraint operation_runs_ad_hoc_reason_check check (run_kind <> 'ad_hoc' or length(trim(coalesce(reason, ''))) > 0),
  constraint operation_runs_revision_positive check (revision > 0),
  constraint operation_runs_time_order_check check (completed_at is null or started_at is null or completed_at >= started_at)
);

create table if not exists public.operation_run_members (
  id uuid primary key default gen_random_uuid(),
  operation_run_id uuid not null references public.operation_runs(id) on delete restrict,
  assignment_id uuid not null references public.wafer_process_assignments(id) on delete restrict,
  wafer_id uuid not null references public.wafers(id) on delete restrict,
  status text not null default 'queued',
  note text,
  started_at timestamptz,
  completed_at timestamptz,
  revision bigint not null default 1,
  legacy_step_execution_id uuid references public.step_executions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_run_id, assignment_id),
  constraint operation_run_members_status_check check (status in ('queued', 'running', 'blocked', 'completed', 'awaiting_review', 'redo_required', 'rejected', 'failed', 'skipped', 'cancelled')),
  constraint operation_run_members_revision_positive check (revision > 0),
  constraint operation_run_members_time_order_check check (completed_at is null or started_at is null or completed_at >= started_at)
);

create table if not exists public.operation_run_links (
  id uuid primary key default gen_random_uuid(),
  parent_run_id uuid not null references public.operation_runs(id) on delete restrict,
  child_run_id uuid not null references public.operation_runs(id) on delete restrict,
  link_kind text not null,
  created_at timestamptz not null default now(),
  unique (parent_run_id, child_run_id, link_kind),
  constraint operation_run_links_kind_check check (link_kind in ('successor', 'redo', 'split', 'merge', 'restore')),
  constraint operation_run_links_not_self check (parent_run_id <> child_run_id)
);

create table if not exists public.operation_run_parameter_records (
  id uuid primary key default gen_random_uuid(),
  operation_run_id uuid not null references public.operation_runs(id) on delete restrict,
  operation_run_member_id uuid references public.operation_run_members(id) on delete restrict,
  scope text not null default 'global',
  schema_snapshot jsonb not null default '{}'::jsonb,
  values jsonb not null default '{}'::jsonb,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  supersedes_record_id uuid references public.operation_run_parameter_records(id) on delete restrict,
  correction_reason text,
  client_mutation_id uuid,
  constraint operation_run_parameter_records_scope_check check (
    (scope = 'global' and operation_run_member_id is null)
    or (scope = 'member' and operation_run_member_id is not null)
  ),
  constraint operation_run_parameter_records_schema_object check (jsonb_typeof(schema_snapshot) = 'object'),
  constraint operation_run_parameter_records_values_object check (jsonb_typeof(values) = 'object'),
  constraint operation_run_parameter_records_correction_reason_check check (
    supersedes_record_id is null or length(trim(coalesce(correction_reason, ''))) > 0
  ),
  unique (operation_run_id, client_mutation_id)
);

create table if not exists public.operation_run_notes (
  id uuid primary key default gen_random_uuid(),
  operation_run_id uuid not null references public.operation_runs(id) on delete restrict,
  operation_run_member_id uuid references public.operation_run_members(id) on delete restrict,
  note_kind text not null default 'general',
  body text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  supersedes_note_id uuid references public.operation_run_notes(id) on delete restrict,
  correction_reason text,
  client_mutation_id uuid,
  constraint operation_run_notes_kind_check check (note_kind in ('general', 'completion', 'error', 'redo', 'correction')),
  constraint operation_run_notes_body_not_blank check (length(trim(body)) > 0),
  constraint operation_run_notes_correction_reason_check check (
    supersedes_note_id is null or length(trim(coalesce(correction_reason, ''))) > 0
  ),
  unique (operation_run_id, client_mutation_id)
);

create table if not exists public.operation_run_resources (
  id uuid primary key default gen_random_uuid(),
  operation_run_id uuid not null references public.operation_runs(id) on delete restrict,
  operation_run_member_id uuid references public.operation_run_members(id) on delete restrict,
  resource_kind text not null,
  person_id uuid references public.process_people(id) on delete set null,
  tool_id uuid references public.fabrication_tools(id) on delete set null,
  recipe_id uuid references public.recipes(id) on delete set null,
  location_id uuid references public.fabrication_locations(id) on delete set null,
  resource_snapshot jsonb not null default '{}'::jsonb,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  constraint operation_run_resources_kind_check check (resource_kind in ('person', 'tool', 'recipe', 'location')),
  constraint operation_run_resources_one_typed_reference check (
    num_nonnulls(person_id, tool_id, recipe_id, location_id) = 1
    and (resource_kind = 'person') = (person_id is not null)
    and (resource_kind = 'tool') = (tool_id is not null)
    and (resource_kind = 'recipe') = (recipe_id is not null)
    and (resource_kind = 'location') = (location_id is not null)
  ),
  constraint operation_run_resources_snapshot_object check (jsonb_typeof(resource_snapshot) = 'object')
);

create index if not exists operation_runs_template_created_idx
  on public.operation_runs (template_id, created_at desc, id);
create index if not exists operation_runs_step_status_idx
  on public.operation_runs (process_step_id, status, created_at desc);
create index if not exists operation_runs_planned_operation_idx
  on public.operation_runs (planned_operation_id, created_at desc) where planned_operation_id is not null;
create index if not exists operation_run_members_assignment_created_idx
  on public.operation_run_members (assignment_id, created_at desc, id);
create index if not exists operation_run_members_wafer_created_idx
  on public.operation_run_members (wafer_id, created_at desc, id);
create index if not exists operation_run_members_legacy_execution_idx
  on public.operation_run_members (legacy_step_execution_id, created_at desc)
  where legacy_step_execution_id is not null;
create unique index if not exists operation_run_members_one_active_assignment_idx
  on public.operation_run_members (assignment_id)
  where status in ('queued', 'running', 'blocked', 'awaiting_review');
create index if not exists operation_run_parameter_records_run_time_idx
  on public.operation_run_parameter_records (operation_run_id, recorded_at, id);
create index if not exists operation_run_notes_run_time_idx
  on public.operation_run_notes (operation_run_id, created_at, id);

alter table public.wafer_process_assignments
  add column if not exists current_operation_run_member_id uuid
  references public.operation_run_members(id) on delete set null;

alter table public.process_step_attempts
  add column if not exists operation_run_member_id uuid references public.operation_run_members(id) on delete restrict,
  add column if not exists submission_group_id uuid;

alter table public.process_events
  add column if not exists operation_run_id uuid references public.operation_runs(id) on delete set null,
  add column if not exists operation_run_member_id uuid references public.operation_run_members(id) on delete set null,
  add column if not exists process_plan_revision_id uuid references public.process_plan_revisions(id) on delete set null,
  add column if not exists planned_operation_id uuid references public.planned_operations(id) on delete set null;

create index if not exists process_step_attempts_run_member_idx
  on public.process_step_attempts (operation_run_member_id, submitted_at desc)
  where operation_run_member_id is not null;
create index if not exists process_step_attempts_submission_group_idx
  on public.process_step_attempts (submission_group_id, submitted_at, id)
  where submission_group_id is not null;
create index if not exists process_events_operation_run_idx
  on public.process_events (operation_run_id, event_at desc)
  where operation_run_id is not null;
create index if not exists process_events_plan_revision_idx
  on public.process_events (process_plan_revision_id, event_at desc)
  where process_plan_revision_id is not null;

create table if not exists public.workflow_revisions (
  template_id uuid primary key references public.process_templates(id) on delete cascade,
  current_revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint workflow_revisions_nonnegative check (current_revision >= 0)
);

create table if not exists public.workflow_change_log (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.process_templates(id) on delete cascade,
  revision bigint not null,
  client_mutation_id uuid not null,
  mutation_kind text not null,
  changed_entities jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles(id) on delete set null,
  committed_at timestamptz not null default now(),
  unique (template_id, revision),
  unique (template_id, client_mutation_id),
  constraint workflow_change_log_entities_object check (jsonb_typeof(changed_entities) = 'object')
);

insert into public.workflow_revisions (template_id)
select id from public.process_templates
on conflict (template_id) do nothing;

create index if not exists workflow_change_log_template_revision_idx
  on public.workflow_change_log (template_id, revision);

create table if not exists public.plan_replan_requests (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.process_plans(id) on delete restrict,
  draft_revision_id uuid not null references public.process_plan_revisions(id) on delete restrict,
  source_run_id uuid references public.operation_runs(id) on delete restrict,
  request_kind text not null,
  requested_change jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  client_mutation_id uuid not null unique,
  constraint plan_replan_requests_kind_check check (request_kind in ('redo', 'delay', 'resource_change', 'manual')),
  constraint plan_replan_requests_status_check check (status in ('pending', 'processing', 'proposed', 'failed', 'applied', 'dismissed')),
  constraint plan_replan_requests_change_object check (jsonb_typeof(requested_change) = 'object')
);

create table if not exists public.plan_adjustment_proposals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.plan_replan_requests(id) on delete restrict,
  plan_id uuid not null references public.process_plans(id) on delete restrict,
  draft_revision_id uuid not null references public.process_plan_revisions(id) on delete restrict,
  base_draft_row_version bigint not null,
  status text not null default 'ready',
  moved_operations jsonb not null default '[]'::jsonb,
  unresolved_conflicts jsonb not null default '[]'::jsonb,
  scheduler_version text not null default 'v1',
  generated_at timestamptz not null default now(),
  applied_by uuid references public.profiles(id) on delete set null,
  applied_at timestamptz,
  constraint plan_adjustment_proposals_status_check check (status in ('ready', 'applied', 'stale', 'dismissed')),
  constraint plan_adjustment_proposals_moved_array check (jsonb_typeof(moved_operations) = 'array'),
  constraint plan_adjustment_proposals_conflicts_array check (jsonb_typeof(unresolved_conflicts) = 'array')
);

create index if not exists plan_replan_requests_pending_idx
  on public.plan_replan_requests (status, requested_at)
  where status in ('pending', 'processing');

-- Backfill one immutable legacy run/member per step_execution. This deliberately
-- does not infer repeat visits from timestamps or checkpoint history.
insert into public.operation_runs (
  id, template_id, process_step_id, run_kind, status, started_at, completed_at,
  created_by, revision, created_at, updated_at
)
select
  execution.id,
  assignment.template_id,
  execution.process_step_id,
  'normal',
  case execution.status::text
    when 'running' then 'running'
    when 'blocked' then 'blocked'
    when 'awaiting_checkpoint' then 'awaiting_review'
    when 'redo_required' then 'redo_required'
    when 'completed' then 'completed'
    when 'skipped' then 'completed'
    when 'failed' then 'failed'
    else 'queued'
  end,
  execution.started_at,
  execution.completed_at,
  coalesce(execution.operator_id, execution.completed_by, assignment.assigned_by),
  1,
  execution.created_at,
  execution.updated_at
from public.step_executions execution
join public.wafer_process_assignments assignment on assignment.id = execution.assignment_id
on conflict (id) do nothing;

insert into public.operation_run_members (
  operation_run_id, assignment_id, wafer_id, status, note, started_at,
  completed_at, revision, legacy_step_execution_id, created_at, updated_at
)
select
  execution.id,
  execution.assignment_id,
  execution.wafer_id,
  case
    when assignment.current_step_id is distinct from execution.process_step_id
      and execution.status::text in ('pending', 'queued', 'running', 'blocked', 'awaiting_checkpoint')
      then 'completed'
    else case execution.status::text
      when 'running' then 'running'
      when 'blocked' then 'blocked'
      when 'awaiting_checkpoint' then 'awaiting_review'
      when 'redo_required' then 'redo_required'
      when 'completed' then 'completed'
      when 'skipped' then 'skipped'
      when 'failed' then 'failed'
      else 'queued'
    end
  end,
  execution.run_notes,
  execution.started_at,
  execution.completed_at,
  1,
  execution.id,
  execution.created_at,
  execution.updated_at
from public.step_executions execution
join public.wafer_process_assignments assignment on assignment.id = execution.assignment_id
where not exists (
  select 1 from public.operation_run_members member
  where member.operation_run_id = execution.id
    and member.assignment_id = execution.assignment_id
);

update public.wafer_process_assignments assignment
set current_operation_run_member_id = member.id
from public.operation_run_members member
join public.operation_runs run on run.id = member.operation_run_id
where member.assignment_id = assignment.id
  and run.process_step_id = assignment.current_step_id
  and member.legacy_step_execution_id is not null
  and assignment.current_operation_run_member_id is null;

alter table public.process_step_attempts disable trigger process_step_attempts_append_only;
update public.process_step_attempts attempt
set operation_run_member_id = member.id,
    submission_group_id = coalesce(attempt.submission_group_id, attempt.batch_id, attempt.client_mutation_id)
from public.operation_run_members member
where member.legacy_step_execution_id = attempt.step_execution_id
  and member.assignment_id = attempt.assignment_id
  and attempt.operation_run_member_id is null;
alter table public.process_step_attempts enable trigger process_step_attempts_append_only;

update public.process_events event
set operation_run_id = run.id,
    operation_run_member_id = member.id
from public.operation_runs run
join public.operation_run_members member on member.operation_run_id = run.id
where run.id = event.step_execution_id
  and member.wafer_id = event.wafer_id
  and event.operation_run_id is null;

insert into public.operation_run_parameter_records (
  operation_run_id, operation_run_member_id, scope, schema_snapshot, values,
  recorded_by, recorded_at, correction_reason
)
select
  member.operation_run_id,
  member.id,
  'member',
  record.schema_snapshot,
  jsonb_build_object(
    'global_values', record.global_values,
    'local_parameters', record.local_parameters,
    'legacy_record_id', record.id
  ),
  record.recorded_by,
  record.created_at,
  null
from public.step_parameter_records record
join public.operation_run_members member
  on member.legacy_step_execution_id = record.step_execution_id
 and member.assignment_id = record.assignment_id
where not exists (
  select 1 from public.operation_run_parameter_records existing
  where existing.values ->> 'legacy_record_id' = record.id::text
);

insert into public.operation_run_notes (
  operation_run_id, operation_run_member_id, note_kind, body, created_by, created_at
)
select
  member.operation_run_id,
  member.id,
  'completion',
  record.notes,
  record.recorded_by,
  record.created_at
from public.step_parameter_records record
join public.operation_run_members member
  on member.legacy_step_execution_id = record.step_execution_id
 and member.assignment_id = record.assignment_id
where nullif(trim(record.notes), '') is not null
  and not exists (
    select 1 from public.operation_run_notes existing
    where existing.operation_run_member_id = member.id
      and existing.body = record.notes
      and existing.created_at = record.created_at
  );

-- Seed an active shared draft for each project/template pair already represented
-- by a process calendar event. Templates without a project remain library-only.
with source_plans as (
  select distinct
    event.process_template_id as template_id,
    coalesce(template.owner_project_id, wafer.project_id) as project_id
  from public.process_calendar_events event
  join public.process_templates template on template.id = event.process_template_id
  left join public.wafers wafer on wafer.id = event.wafer_id
  where event.process_step_id is not null
    and coalesce(template.owner_project_id, wafer.project_id) is not null
)
insert into public.process_plans (project_id, template_id, created_by)
select source.project_id, source.template_id, template.created_by
from source_plans source
join public.process_templates template on template.id = source.template_id
on conflict (project_id, template_id) where is_active do nothing;

insert into public.process_plan_revisions (
  plan_id, revision_number, status, planning_starts_at, planning_ends_at, created_by
)
select
  plan.id,
  1,
  'draft',
  coalesce(min(event.starts_at) - interval '7 days', now() - interval '1 day'),
  coalesce(max(event.ends_at) + interval '30 days', now() + interval '90 days'),
  plan.created_by
from public.process_plans plan
left join public.process_calendar_events event
  on event.process_template_id = plan.template_id
left join public.process_plan_revisions revision on revision.plan_id = plan.id
where plan.is_active
  and revision.id is null
group by plan.id, plan.created_by;

update public.process_plans plan
set shared_draft_revision_id = revision.id
from public.process_plan_revisions revision
where revision.plan_id = plan.id
  and revision.status = 'draft'
  and plan.shared_draft_revision_id is null;

insert into public.planned_batches (
  revision_id, logical_id, name, note, created_by, created_at, updated_at
)
select distinct
  plan.shared_draft_revision_id,
  batch.id,
  'Batch ' || left(batch.id::text, 8),
  batch.note,
  batch.created_by,
  batch.created_at,
  batch.created_at
from public.process_batches batch
join public.process_batch_members legacy_member on legacy_member.batch_id = batch.id
join public.wafers wafer on wafer.id = legacy_member.wafer_id
join public.process_plans plan
  on plan.template_id = batch.template_id
 and plan.project_id = wafer.project_id
 and plan.is_active
where plan.shared_draft_revision_id is not null
on conflict (revision_id, logical_id) do nothing;

insert into public.planned_batch_members (planned_batch_id, assignment_id, added_by, created_at)
select distinct
  planned_batch.id,
  legacy_member.assignment_id,
  legacy_batch.created_by,
  legacy_member.created_at
from public.process_batch_members legacy_member
join public.process_batches legacy_batch on legacy_batch.id = legacy_member.batch_id
join public.wafers wafer on wafer.id = legacy_member.wafer_id
join public.process_plans plan
  on plan.template_id = legacy_batch.template_id
 and plan.project_id = wafer.project_id
 and plan.is_active
join public.planned_batches planned_batch
  on planned_batch.revision_id = plan.shared_draft_revision_id
 and planned_batch.logical_id = legacy_batch.id
on conflict (planned_batch_id, assignment_id) do nothing;

insert into public.planned_operations (
  revision_id, logical_id, process_step_id, planned_batch_id, name,
  description, scheduled_start_at, scheduled_end_at, legacy_calendar_event_id,
  created_by, created_at, updated_at
)
select
  plan.shared_draft_revision_id,
  event.id,
  event.process_step_id,
  planned_batch.id,
  coalesce(nullif(trim(event.process_step_name_snapshot), ''), step.name),
  event.description,
  event.starts_at,
  event.ends_at,
  event.id,
  event.created_by,
  event.created_at,
  event.updated_at
from public.process_calendar_events event
join public.process_steps step on step.id = event.process_step_id
join public.process_templates template on template.id = event.process_template_id
left join public.wafers wafer on wafer.id = event.wafer_id
join public.process_plans plan
  on plan.template_id = event.process_template_id
 and plan.project_id = coalesce(template.owner_project_id, wafer.project_id)
 and plan.is_active
left join public.planned_batches planned_batch
  on planned_batch.revision_id = plan.shared_draft_revision_id
 and planned_batch.logical_id = event.batch_id
where event.process_step_id is not null
  and plan.shared_draft_revision_id is not null
on conflict (revision_id, logical_id) do nothing;

insert into public.planned_operation_resources (
  planned_operation_id, resource_kind, location_id
)
select operation.id, 'location', event.location_id
from public.planned_operations operation
join public.process_calendar_events event on event.id = operation.legacy_calendar_event_id
where event.location_id is not null
  and not exists (
    select 1 from public.planned_operation_resources resource
    where resource.planned_operation_id = operation.id
      and resource.resource_kind = 'location'
  );

insert into public.planned_operation_resources (
  planned_operation_id, resource_kind, person_id
)
select operation.id, 'person', people.person_id
from public.planned_operations operation
join public.process_calendar_event_people people on people.event_id = operation.legacy_calendar_event_id
where not exists (
  select 1 from public.planned_operation_resources resource
  where resource.planned_operation_id = operation.id
    and resource.person_id = people.person_id
);

-- Append-only evidence is never rewritten or deleted. Corrections point to the
-- row they supersede and carry a reason.
create or replace function public.reject_operation_evidence_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception using
    errcode = '55000',
    message = format('%I is append-only; add a superseding record instead.', tg_table_name);
end;
$$;

drop trigger if exists operation_run_parameter_records_append_only on public.operation_run_parameter_records;
create trigger operation_run_parameter_records_append_only
  before update or delete on public.operation_run_parameter_records
  for each row execute function public.reject_operation_evidence_mutation();

drop trigger if exists operation_run_notes_append_only on public.operation_run_notes;
create trigger operation_run_notes_append_only
  before update or delete on public.operation_run_notes
  for each row execute function public.reject_operation_evidence_mutation();

drop trigger if exists operation_run_resources_append_only on public.operation_run_resources;
create trigger operation_run_resources_append_only
  before update or delete on public.operation_run_resources
  for each row execute function public.reject_operation_evidence_mutation();

create or replace function public.assert_plan_child_mutable()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_revision_id uuid;
begin
  target_revision_id := case
    when tg_table_name in ('planned_batches', 'planned_operations', 'planned_operation_dependencies')
      then coalesce((to_jsonb(new) ->> 'revision_id')::uuid, (to_jsonb(old) ->> 'revision_id')::uuid)
    when tg_table_name = 'planned_batch_members' then (
      select batch.revision_id from public.planned_batches batch
      where batch.id = coalesce((to_jsonb(new) ->> 'planned_batch_id')::uuid, (to_jsonb(old) ->> 'planned_batch_id')::uuid)
    )
    else (
      select operation.revision_id from public.planned_operations operation
      where operation.id = coalesce((to_jsonb(new) ->> 'planned_operation_id')::uuid, (to_jsonb(old) ->> 'planned_operation_id')::uuid)
    )
  end;

  if not exists (
    select 1 from public.process_plan_revisions revision
    where revision.id = target_revision_id and revision.status = 'draft'
  ) then
    raise exception using errcode = '55000', message = 'Published plan revisions are immutable.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'planned_batches', 'planned_batch_members', 'planned_operations',
    'planned_operation_dependencies', 'planned_operation_parameters',
    'planned_operation_resources'
  ]
  loop
    execute format('drop trigger if exists plan_child_mutable on public.%I', table_name);
    execute format(
      'create trigger plan_child_mutable before insert or update or delete on public.%I for each row execute function public.assert_plan_child_mutable()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.bump_row_version()
returns trigger
language plpgsql
as $$
begin
  new.row_version = old.row_version + 1;
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'planned_batches', 'planned_operations', 'planned_operation_parameters',
    'planned_operation_resources'
  ]
  loop
    execute format('drop trigger if exists bump_row_version on public.%I', table_name);
    execute format(
      'create trigger bump_row_version before update on public.%I for each row execute function public.bump_row_version()',
      table_name
    );
  end loop;
end;
$$;

drop trigger if exists operation_runs_bump_revision on public.operation_runs;
create trigger operation_runs_bump_revision
  before update on public.operation_runs
  for each row execute function public.bump_collaboration_revision();

drop trigger if exists operation_run_members_bump_revision on public.operation_run_members;
create trigger operation_run_members_bump_revision
  before update on public.operation_run_members
  for each row execute function public.bump_collaboration_revision();

-- Before a checkpoint attempt becomes append-only, attach it to the exact run
-- member selected by the assignment's current pointer.
create or replace function public.attach_checkpoint_attempt_run_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.operation_run_member_id is null then
    select assignment.current_operation_run_member_id
    into new.operation_run_member_id
    from public.wafer_process_assignments assignment
    where assignment.id = new.assignment_id;
  end if;
  new.submission_group_id := coalesce(new.submission_group_id, new.batch_id, new.client_mutation_id);
  return new;
end;
$$;

drop trigger if exists process_step_attempts_attach_run_identity on public.process_step_attempts;
create trigger process_step_attempts_attach_run_identity
  before insert on public.process_step_attempts
  for each row execute function public.attach_checkpoint_attempt_run_identity();

-- RLS retains lab-wide researcher reads through can_access_project while all
-- state-changing paths are exposed only through validated RPCs.
alter table public.process_stages enable row level security;
alter table public.fabrication_locations enable row level security;
alter table public.process_plans enable row level security;
alter table public.process_plan_revisions enable row level security;
alter table public.planned_batches enable row level security;
alter table public.planned_batch_members enable row level security;
alter table public.planned_operations enable row level security;
alter table public.planned_operation_dependencies enable row level security;
alter table public.planned_operation_parameters enable row level security;
alter table public.planned_operation_resources enable row level security;
alter table public.operation_runs enable row level security;
alter table public.operation_run_members enable row level security;
alter table public.operation_run_links enable row level security;
alter table public.operation_run_parameter_records enable row level security;
alter table public.operation_run_notes enable row level security;
alter table public.operation_run_resources enable row level security;
alter table public.workflow_revisions enable row level security;
alter table public.workflow_change_log enable row level security;
alter table public.plan_replan_requests enable row level security;
alter table public.plan_adjustment_proposals enable row level security;

create policy process_stages_select on public.process_stages for select to authenticated using (
  exists (
    select 1 from public.process_templates template
    where template.id = template_id
      and (template.is_active or public.can_manage_process_library()
        or (template.owner_project_id is not null and public.can_access_project(template.owner_project_id)))
  )
);
create policy fabrication_locations_select on public.fabrication_locations for select to authenticated using (is_active or public.can_manage_process_library());

create policy process_plans_select on public.process_plans for select to authenticated using (public.can_access_project(project_id));
create policy process_plan_revisions_select on public.process_plan_revisions for select to authenticated using (
  exists (select 1 from public.process_plans plan where plan.id = plan_id and public.can_access_project(plan.project_id))
);
create policy planned_batches_select on public.planned_batches for select to authenticated using (
  exists (
    select 1 from public.process_plan_revisions revision
    join public.process_plans plan on plan.id = revision.plan_id
    where revision.id = revision_id and public.can_access_project(plan.project_id)
  )
);
create policy planned_batch_members_select on public.planned_batch_members for select to authenticated using (
  exists (
    select 1 from public.planned_batches batch
    join public.process_plan_revisions revision on revision.id = batch.revision_id
    join public.process_plans plan on plan.id = revision.plan_id
    where batch.id = planned_batch_id and public.can_access_project(plan.project_id)
  )
);
create policy planned_operations_select on public.planned_operations for select to authenticated using (
  exists (
    select 1 from public.process_plan_revisions revision
    join public.process_plans plan on plan.id = revision.plan_id
    where revision.id = revision_id and public.can_access_project(plan.project_id)
  )
);
create policy planned_operation_dependencies_select on public.planned_operation_dependencies for select to authenticated using (
  exists (
    select 1 from public.process_plan_revisions revision
    join public.process_plans plan on plan.id = revision.plan_id
    where revision.id = revision_id and public.can_access_project(plan.project_id)
  )
);
create policy planned_operation_parameters_select on public.planned_operation_parameters for select to authenticated using (
  exists (
    select 1 from public.planned_operations operation
    join public.process_plan_revisions revision on revision.id = operation.revision_id
    join public.process_plans plan on plan.id = revision.plan_id
    where operation.id = planned_operation_id and public.can_access_project(plan.project_id)
  )
);
create policy planned_operation_resources_select on public.planned_operation_resources for select to authenticated using (
  exists (
    select 1 from public.planned_operations operation
    join public.process_plan_revisions revision on revision.id = operation.revision_id
    join public.process_plans plan on plan.id = revision.plan_id
    where operation.id = planned_operation_id and public.can_access_project(plan.project_id)
  )
);

create policy operation_runs_select on public.operation_runs for select to authenticated using (
  exists (
    select 1 from public.operation_run_members member
    join public.wafers wafer on wafer.id = member.wafer_id
    where member.operation_run_id = operation_runs.id and public.can_access_project(wafer.project_id)
  )
);
create policy operation_run_members_select on public.operation_run_members for select to authenticated using (public.can_access_wafer(wafer_id));
create policy operation_run_links_select on public.operation_run_links for select to authenticated using (
  exists (
    select 1 from public.operation_run_members member
    where member.operation_run_id in (parent_run_id, child_run_id)
      and public.can_access_wafer(member.wafer_id)
  )
);
create policy operation_run_parameter_records_select on public.operation_run_parameter_records for select to authenticated using (
  exists (
    select 1 from public.operation_run_members member
    where member.operation_run_id = operation_run_parameter_records.operation_run_id
      and public.can_access_wafer(member.wafer_id)
  )
);
create policy operation_run_notes_select on public.operation_run_notes for select to authenticated using (
  exists (
    select 1 from public.operation_run_members member
    where member.operation_run_id = operation_run_notes.operation_run_id
      and public.can_access_wafer(member.wafer_id)
  )
);
create policy operation_run_resources_select on public.operation_run_resources for select to authenticated using (
  exists (
    select 1 from public.operation_run_members member
    where member.operation_run_id = operation_run_resources.operation_run_id
      and public.can_access_wafer(member.wafer_id)
  )
);
create policy workflow_revisions_select on public.workflow_revisions for select to authenticated using (
  exists (
    select 1 from public.process_templates template
    where template.id = template_id
      and (template.is_active or public.can_manage_process_library()
        or (template.owner_project_id is not null and public.can_access_project(template.owner_project_id)))
  )
);
create policy workflow_change_log_select on public.workflow_change_log for select to authenticated using (
  exists (
    select 1 from public.process_templates template
    where template.id = template_id
      and (template.is_active or public.can_manage_process_library()
        or (template.owner_project_id is not null and public.can_access_project(template.owner_project_id)))
  )
);
create policy plan_replan_requests_select on public.plan_replan_requests for select to authenticated using (
  exists (select 1 from public.process_plans plan where plan.id = plan_id and public.can_access_project(plan.project_id))
);
create policy plan_adjustment_proposals_select on public.plan_adjustment_proposals for select to authenticated using (
  exists (select 1 from public.process_plans plan where plan.id = plan_id and public.can_access_project(plan.project_id))
);

revoke insert, update, delete on public.process_plans, public.process_plan_revisions, public.planned_batches,
  public.planned_batch_members, public.planned_operations, public.planned_operation_dependencies,
  public.planned_operation_parameters, public.planned_operation_resources, public.operation_runs,
  public.operation_run_members, public.operation_run_links, public.operation_run_parameter_records,
  public.operation_run_notes, public.operation_run_resources, public.workflow_revisions,
  public.workflow_change_log, public.plan_replan_requests, public.plan_adjustment_proposals
from anon, authenticated;

grant select on public.process_stages, public.fabrication_locations, public.process_plans,
  public.process_plan_revisions, public.planned_batches, public.planned_batch_members,
  public.planned_operations, public.planned_operation_dependencies,
  public.planned_operation_parameters, public.planned_operation_resources,
  public.operation_runs, public.operation_run_members, public.operation_run_links,
  public.operation_run_parameter_records, public.operation_run_notes,
  public.operation_run_resources, public.workflow_revisions, public.workflow_change_log,
  public.plan_replan_requests, public.plan_adjustment_proposals
to authenticated;

comment on table public.process_stages is 'Non-executable process containers; progress is derived from executable child steps.';
comment on table public.process_plan_revisions is 'One mutable shared draft and immutable explicitly published plan revisions.';
comment on table public.operation_runs is 'Batch-level actual operation occurrences; every redo/rework is a distinct row.';
comment on table public.operation_run_members is 'Per-assignment outcomes inside an operation run, including mixed batch results.';
comment on table public.workflow_change_log is 'One committed workspace revision per idempotent workflow mutation.';
