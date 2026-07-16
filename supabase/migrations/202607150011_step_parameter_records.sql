-- Preserve the parameters recorded for each exact wafer/die entry into a step.
-- The movement mutation is the idempotent link to the process event that created
-- the destination execution state; revisiting the same step therefore produces a
-- new record without overwriting an older visit.

create table if not exists public.step_parameter_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  wafer_id uuid not null references public.wafers(id) on delete restrict,
  assignment_id uuid not null references public.wafer_process_assignments(id) on delete restrict,
  process_step_id uuid not null references public.process_steps(id) on delete restrict,
  step_execution_id uuid references public.step_executions(id) on delete set null,
  process_event_id uuid not null references public.process_events(id) on delete restrict,
  movement_mutation_id uuid not null,
  schema_snapshot jsonb not null default '{}'::jsonb,
  global_values jsonb not null default '{}'::jsonb,
  local_parameters jsonb not null default '[]'::jsonb,
  recorded_by uuid references public.profiles(id) on delete set null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint step_parameter_records_process_event_unique unique (process_event_id),
  constraint step_parameter_records_movement_mutation_unique unique (movement_mutation_id),
  constraint step_parameter_records_revision_positive check (revision > 0),
  constraint step_parameter_records_schema_object check (jsonb_typeof(schema_snapshot) = 'object'),
  constraint step_parameter_records_global_values_object check (jsonb_typeof(global_values) = 'object'),
  constraint step_parameter_records_local_parameters_array check (jsonb_typeof(local_parameters) = 'array')
);

create index if not exists step_parameter_records_assignment_step_created_idx
  on public.step_parameter_records (assignment_id, process_step_id, created_at desc);
create index if not exists step_parameter_records_wafer_created_idx
  on public.step_parameter_records (wafer_id, created_at desc);

create or replace function public.touch_step_parameter_record()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.revision = old.revision + 1;
  return new;
end;
$$;

drop trigger if exists step_parameter_records_touch on public.step_parameter_records;
create trigger step_parameter_records_touch
  before update on public.step_parameter_records
  for each row execute function public.touch_step_parameter_record();

alter table public.step_parameter_records enable row level security;

drop policy if exists "project users can view step parameter records" on public.step_parameter_records;
create policy "project users can view step parameter records"
  on public.step_parameter_records for select
  to authenticated
  using (public.can_access_project(project_id));

drop policy if exists "project editors can create step parameter records" on public.step_parameter_records;
create policy "project editors can create step parameter records"
  on public.step_parameter_records for insert
  to authenticated
  with check (
    public.can_edit_project(project_id)
    and recorded_by = auth.uid()
  );

drop policy if exists "project editors can update step parameter records" on public.step_parameter_records;
create policy "project editors can update step parameter records"
  on public.step_parameter_records for update
  to authenticated
  using (public.can_edit_project(project_id))
  with check (
    public.can_edit_project(project_id)
    and recorded_by = auth.uid()
  );

revoke insert, update, delete on public.step_parameter_records from anon;
grant select, insert, update on public.step_parameter_records to authenticated;

create or replace function public.broadcast_step_parameter_record_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  changed_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_template_id uuid;
begin
  select step.template_id into target_template_id
  from public.process_steps step
  where step.id = (changed_row ->> 'process_step_id')::uuid;

  if target_template_id is not null then
    perform realtime.send(
      jsonb_build_object(
        'table', tg_table_name,
        'operation', tg_op,
        'entityId', changed_row ->> 'id',
        'projectId', changed_row ->> 'project_id',
        'waferId', changed_row ->> 'wafer_id',
        'processTemplateId', target_template_id,
        'changedAt', clock_timestamp()
      ),
      'workflow_changed',
      'workflow:process:' || target_template_id::text,
      true
    );
  end if;

  return null;
end;
$$;

revoke execute on function public.broadcast_step_parameter_record_change() from public, anon, authenticated;

drop trigger if exists waferwatch_broadcast_change on public.step_parameter_records;
create trigger waferwatch_broadcast_change
  after insert or update or delete on public.step_parameter_records
  for each row execute function public.broadcast_step_parameter_record_change();

alter table public.step_parameter_records replica identity default;
