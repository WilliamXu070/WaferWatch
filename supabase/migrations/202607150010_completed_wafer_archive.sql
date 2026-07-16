-- Archive completed wafers and dies without rewriting their completed run.
-- Restoring from the archive creates a new assignment at an explicitly chosen
-- Beginning lane while the prior assignment remains immutable history.

alter table public.wafers
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.wafer_process_assignments
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

create index if not exists wafers_active_project_archive_idx
  on public.wafers (project_id, wafer_code)
  where deleted_at is null and archived_at is null;

create index if not exists wafers_archived_project_idx
  on public.wafers (project_id, archived_at desc)
  where deleted_at is null and archived_at is not null;

create index if not exists wafer_assignments_active_template_archive_idx
  on public.wafer_process_assignments (template_id, assigned_at desc)
  where deleted_at is null and archived_at is null;

create index if not exists wafer_assignments_archived_template_idx
  on public.wafer_process_assignments (template_id, archived_at desc)
  where deleted_at is null and archived_at is not null;

create or replace function public.archive_restore_is_authorized(
  target_wafer_id uuid,
  target_template_id uuid,
  target_step_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  restore_token text := current_setting('waferwatch.archive_restore', true);
  restore_event_id uuid;
begin
  if restore_token is null or restore_token = '' then
    return false;
  end if;

  begin
    restore_event_id := restore_token::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.process_events event
    where event.id = restore_event_id
      and event.event_type = 'wafer_restored_from_archive'
      and event.wafer_id = target_wafer_id
      and event.actor_id = auth.uid()
      and event.metadata ->> 'template_id' = target_template_id::text
      and event.metadata ->> 'target_step_id' = target_step_id::text
  );
end;
$$;

revoke execute on function public.archive_restore_is_authorized(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.enforce_published_assignment_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_project_id uuid;
  first_step_id uuid;
  is_dicing_child boolean := false;
  is_archive_restore boolean := false;
begin
  if tg_op = 'UPDATE' and new.template_id is distinct from old.template_id then
    raise exception using errcode = '55000', message = 'Assigned processes cannot be changed.';
  end if;

  if not exists (
    select 1 from public.process_templates template
    where template.id = new.template_id and template.is_active = true
  ) then
    raise exception using errcode = '23514', message = 'Only active processes can be assigned to wafers.';
  end if;

  select wafer.project_id into assignment_project_id
  from public.wafers wafer where wafer.id = new.wafer_id;
  if assignment_project_id is null then
    raise exception using errcode = '23503', message = 'The assigned wafer no longer exists.';
  end if;

  if tg_op = 'INSERT' then
    select step.id into first_step_id
    from public.process_steps step
    where step.template_id = new.template_id and step.archived_at is null
    order by step.step_order, step.created_at, step.id
    limit 1;

    is_dicing_child := public.checkpoint_dicing_child_is_authorized(
      new.wafer_id,
      new.template_id,
      new.current_step_id
    );
    is_archive_restore := public.archive_restore_is_authorized(
      new.wafer_id,
      new.template_id,
      new.current_step_id
    );

    if new.current_step_id is null
       or (not is_dicing_child and not is_archive_restore and new.current_step_id is distinct from first_step_id) then
      raise exception using errcode = '55000', message = 'New assignments must begin at the first step.';
    end if;
    if new.status not in ('planned', 'queued', 'in_progress') or new.completed_at is not null then
      raise exception using errcode = '55000', message = 'New assignments cannot bypass checkpoint progression.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.archive_completed_wafer_assignments(
  target_assignment_ids uuid[],
  mutation_ids uuid[]
)
returns table (assignment_id uuid, wafer_id uuid, archived_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_count integer := coalesce(cardinality(target_assignment_ids), 0);
  target_index integer;
  assignment public.wafer_process_assignments%rowtype;
  wafer public.wafers%rowtype;
  archive_time timestamptz := now();
begin
  if target_count = 0 or target_count > 200 then
    raise exception using errcode = '22023', message = 'Select between 1 and 200 completed wafers or dies to archive.';
  end if;
  if target_count <> coalesce(cardinality(mutation_ids), 0) then
    raise exception using errcode = '22023', message = 'Every archive item requires an idempotency key.';
  end if;
  if (select count(distinct candidate) from unnest(target_assignment_ids) candidate) <> target_count
     or (select count(distinct candidate) from unnest(mutation_ids) candidate) <> target_count then
    raise exception using errcode = '22023', message = 'Archive items and idempotency keys must be unique.';
  end if;

  for target_index in 1..target_count loop
    select * into assignment
    from public.wafer_process_assignments candidate
    where candidate.id = target_assignment_ids[target_index]
    for update;

    if assignment.id is null then
      raise exception using errcode = 'P0002', message = 'The selected process assignment no longer exists.';
    end if;

    select * into wafer
    from public.wafers candidate
    where candidate.id = assignment.wafer_id
    for update;

    if wafer.id is null or wafer.deleted_at is not null or assignment.deleted_at is not null then
      raise exception using errcode = 'P0002', message = 'The selected wafer or die is no longer active.';
    end if;
    if auth.uid() is null or not public.can_edit_project(wafer.project_id) then
      raise exception using errcode = '42501', message = 'You do not have permission to archive this wafer or die.';
    end if;
    if wafer.archived_at is not null or assignment.archived_at is not null then
      raise exception using errcode = '55000', message = 'This wafer or die is already archived.';
    end if;
    if wafer.status <> 'completed' or assignment.status <> 'completed' or assignment.completed_at is null then
      raise exception using errcode = '55000', message = 'Only a completed process assignment can be archived.';
    end if;
    if exists (
      select 1
      from public.wafer_process_assignments other
      where other.wafer_id = wafer.id
        and other.id <> assignment.id
        and other.deleted_at is null
        and other.archived_at is null
    ) then
      raise exception using errcode = '55000', message = 'This wafer or die still has another active process assignment.';
    end if;

    update public.wafer_process_assignments
    set archived_at = archive_time, archived_by = auth.uid()
    where id = assignment.id;

    update public.wafers
    set archived_at = archive_time, archived_by = auth.uid()
    where id = wafer.id;

    insert into public.process_events (
      project_id, wafer_id, actor_id, event_type, notes, metadata, client_mutation_id
    ) values (
      wafer.project_id,
      wafer.id,
      auth.uid(),
      'wafer_archived',
      'Archived after process completion.',
      jsonb_build_object(
        'assignment_id', assignment.id,
        'template_id', assignment.template_id,
        'final_step_id', assignment.current_step_id,
        'completed_at', assignment.completed_at,
        'archived_at', archive_time
      ),
      mutation_ids[target_index]
    ) on conflict (client_mutation_id) do nothing;

    assignment_id := assignment.id;
    wafer_id := wafer.id;
    archived_at := archive_time;
    return next;
  end loop;
end;
$$;

revoke execute on function public.archive_completed_wafer_assignments(uuid[], uuid[])
  from public, anon;
grant execute on function public.archive_completed_wafer_assignments(uuid[], uuid[])
  to authenticated;

create or replace function public.restore_archived_wafer_to_step(
  target_wafer_id uuid,
  archived_assignment_id uuid,
  target_step_id uuid,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  wafer public.wafers%rowtype;
  archived_assignment public.wafer_process_assignments%rowtype;
  target_step public.process_steps%rowtype;
  restore_event_id uuid := gen_random_uuid();
  new_assignment_id uuid := gen_random_uuid();
  new_execution_id uuid := gen_random_uuid();
  restored_at timestamptz := now();
begin
  select * into wafer from public.wafers where id = target_wafer_id for update;
  select * into archived_assignment
  from public.wafer_process_assignments
  where id = archived_assignment_id
  for update;
  select * into target_step from public.process_steps where id = target_step_id;

  if wafer.id is null or wafer.deleted_at is not null then
    raise exception using errcode = 'P0002', message = 'The archived wafer or die no longer exists.';
  end if;
  if auth.uid() is null or not public.can_edit_project(wafer.project_id) then
    raise exception using errcode = '42501', message = 'You do not have permission to restore this wafer or die.';
  end if;
  if wafer.archived_at is null then
    raise exception using errcode = '55000', message = 'This wafer or die is not currently archived.';
  end if;
  if archived_assignment.id is null
     or archived_assignment.wafer_id <> wafer.id
     or archived_assignment.archived_at is null
     or archived_assignment.status <> 'completed' then
    raise exception using errcode = '55000', message = 'The completed archive assignment is invalid.';
  end if;
  if target_step.id is null
     or target_step.template_id <> archived_assignment.template_id
     or target_step.archived_at is not null then
    raise exception using errcode = '55000', message = 'Choose a current step from the archived process.';
  end if;
  if not exists (
    select 1 from public.process_templates template
    where template.id = archived_assignment.template_id and template.is_active = true
  ) then
    raise exception using errcode = '55000', message = 'The archived process is no longer active.';
  end if;
  if exists (
    select 1
    from public.wafer_process_assignments active_assignment
    where active_assignment.wafer_id = wafer.id
      and active_assignment.deleted_at is null
      and active_assignment.archived_at is null
  ) then
    raise exception using errcode = '55000', message = 'This wafer or die already has an active process assignment.';
  end if;

  insert into public.process_events (
    id, project_id, wafer_id, actor_id, event_type, notes, metadata, client_mutation_id
  ) values (
    restore_event_id,
    wafer.project_id,
    wafer.id,
    auth.uid(),
    'wafer_restored_from_archive',
    'Restored from Archive to a process Beginning lane.',
    jsonb_build_object(
      'archived_assignment_id', archived_assignment.id,
      'new_assignment_id', new_assignment_id,
      'template_id', archived_assignment.template_id,
      'target_step_id', target_step.id,
      'restored_at', restored_at
    ),
    mutation_id
  );

  perform set_config('waferwatch.archive_restore', restore_event_id::text, true);

  update public.wafers
  set archived_at = null,
      archived_by = null,
      status = 'queued'
  where id = wafer.id;

  insert into public.wafer_process_assignments (
    id, wafer_id, template_id, current_step_id, assigned_by,
    status, assigned_at, started_at, completed_at
  ) values (
    new_assignment_id, wafer.id, archived_assignment.template_id,
    target_step.id, auth.uid(), 'queued', restored_at, null, null
  );

  insert into public.step_executions (
    id, assignment_id, wafer_id, process_step_id, status, queue_started_at, metadata
  ) values (
    new_execution_id,
    new_assignment_id,
    wafer.id,
    target_step.id,
    'queued',
    restored_at,
    jsonb_build_object(
      'restored_from_archive', true,
      'archived_assignment_id', archived_assignment.id,
      'restore_event_id', restore_event_id
    )
  );

  return jsonb_build_object(
    'wafer_id', wafer.id,
    'wafer_code', wafer.wafer_code,
    'die_label', nullif(wafer.metadata ->> 'current_die', ''),
    'assignment_id', new_assignment_id,
    'step_execution_id', new_execution_id,
    'target_step_id', target_step.id,
    'template_id', archived_assignment.template_id,
    'restored_at', restored_at
  );
exception
  when unique_violation then
    if exists (
      select 1 from public.process_events event
      where event.client_mutation_id = mutation_id
        and event.event_type = 'wafer_restored_from_archive'
    ) then
      raise exception using errcode = '55000', message = 'This restore was already completed. Refresh Process Flow.';
    end if;
    raise;
end;
$$;

revoke execute on function public.restore_archived_wafer_to_step(uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.restore_archived_wafer_to_step(uuid, uuid, uuid, uuid)
  to authenticated;
