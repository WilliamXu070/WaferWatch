-- Historical corrections are append-only overlays. They never rewrite a
-- checkpoint attempt, decision, execution, or parameter record already used
-- as fabrication evidence.

create or replace function public.correct_wafer_process_history(
  target_assignment_id uuid,
  correction_kind text,
  target_visit_id text,
  anchor_visit_id text,
  placement text,
  target_step_id uuid,
  completed_at timestamptz,
  reason text,
  expected_history_revision integer,
  mutation_id uuid,
  parameter_values jsonb default '{}'::jsonb,
  parameter_notes jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment public.wafer_process_assignments%rowtype;
  wafer public.wafers%rowtype;
  step public.process_steps%rowtype;
  existing_event public.process_events%rowtype;
  correction_event public.process_events%rowtype;
  history_revision integer;
  field jsonb;
  field_key text;
  field_type text;
  field_value jsonb;
  schema_snapshot jsonb;
  visit_source_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if correction_kind not in ('insert', 'remove') then
    raise exception using errcode = '22023', message = 'History correction must insert or remove a visit.';
  end if;
  if nullif(trim(target_visit_id), '') is null or nullif(trim(reason), '') is null then
    raise exception using errcode = '22023', message = 'Choose a history visit and provide a correction reason.';
  end if;
  if expected_history_revision < 0 then
    raise exception using errcode = '22023', message = 'Invalid history revision.';
  end if;

  -- Serialise corrections for one assignment so an old History panel cannot
  -- silently overwrite a collaborator's correction.
  perform pg_advisory_xact_lock(hashtext(target_assignment_id::text));

  select * into existing_event
  from public.process_events
  where client_mutation_id = mutation_id;
  if existing_event.id is not null then
    if existing_event.event_type <> 'wafer_history_correction'
       or existing_event.actor_id is distinct from auth.uid()
       or existing_event.metadata ->> 'assignment_id' is distinct from target_assignment_id::text then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different history correction.';
    end if;
    return jsonb_build_object('event_id', existing_event.id, 'already_corrected', true) || existing_event.metadata;
  end if;

  select * into assignment
  from public.wafer_process_assignments
  where id = target_assignment_id
    and deleted_at is null
  for update;
  if assignment.id is null then
    raise exception using errcode = 'P0002', message = 'This process assignment is no longer available.';
  end if;
  select * into wafer from public.wafers where id = assignment.wafer_id for update;
  if wafer.id is null or not public.can_edit_project(wafer.project_id) then
    raise exception using errcode = '42501', message = 'You cannot correct this wafer history.';
  end if;

  select count(*)::integer into history_revision
  from public.process_events event
  where event.event_type = 'wafer_history_correction'
    and event.metadata ->> 'assignment_id' = assignment.id::text;
  if history_revision <> expected_history_revision then
    raise exception using errcode = '40001', message = 'This history changed in another session. Reload before correcting it.';
  end if;

  if correction_kind = 'remove' then
    if target_visit_id like 'current:%' then
      raise exception using errcode = '55000', message = 'Undo the live current process state instead of removing it from history.';
    end if;
    begin
      visit_source_id := split_part(target_visit_id, ':', 2)::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'This history visit is no longer valid.';
    end;
    if target_visit_id like 'attempt:%' and exists (
      select 1
      from public.process_step_attempts attempt
      join public.step_executions execution on execution.id = attempt.step_execution_id
      where attempt.id = visit_source_id
        and attempt.assignment_id = assignment.id
        and execution.process_step_id = assignment.current_step_id
        and execution.status not in ('completed', 'skipped')
    ) then
      raise exception using errcode = '55000', message = 'Undo the live current process state instead of removing it from history.';
    end if;
    if target_visit_id like 'execution:%' and exists (
      select 1
      from public.step_executions execution
      where execution.id = visit_source_id
        and execution.assignment_id = assignment.id
        and execution.process_step_id = assignment.current_step_id
        and execution.status not in ('completed', 'skipped')
    ) then
      raise exception using errcode = '55000', message = 'Undo the live current process state instead of removing it from history.';
    end if;
    if target_visit_id like 'attempt:%' and not exists (
      select 1 from public.process_step_attempts attempt
      where attempt.id = visit_source_id and attempt.assignment_id = assignment.id
    ) then
      raise exception using errcode = '40001', message = 'This history visit changed in another session. Reload before correcting it.';
    elsif target_visit_id like 'execution:%' and not exists (
      select 1 from public.step_executions execution
      where execution.id = visit_source_id and execution.assignment_id = assignment.id
    ) then
      raise exception using errcode = '40001', message = 'This history visit changed in another session. Reload before correcting it.';
    elsif target_visit_id like 'correction:%' and not exists (
      select 1 from public.process_events event
      where event.id = visit_source_id
        and event.event_type = 'wafer_history_correction'
        and event.metadata ->> 'assignment_id' = assignment.id::text
        and event.metadata ->> 'kind' = 'insert'
    ) then
      raise exception using errcode = '40001', message = 'This history visit changed in another session. Reload before correcting it.';
    elsif target_visit_id not like 'attempt:%' and target_visit_id not like 'execution:%' and target_visit_id not like 'correction:%' then
      raise exception using errcode = '22023', message = 'Only recorded process visits can be removed.';
    end if;
    if exists (
      select 1 from public.process_events event
      where event.event_type = 'wafer_history_correction'
        and event.metadata ->> 'assignment_id' = assignment.id::text
        and event.metadata ->> 'kind' = 'remove'
        and event.metadata ->> 'target_visit_id' = target_visit_id
    ) then
      raise exception using errcode = '40001', message = 'This history visit was already removed. Reload before correcting it.';
    end if;
    insert into public.process_events (
      project_id, wafer_id, actor_id, event_type, notes, metadata, client_mutation_id
    ) values (
      wafer.project_id, wafer.id, auth.uid(), 'wafer_history_correction', trim(reason),
      jsonb_build_object(
        'assignment_id', assignment.id,
        'kind', 'remove',
        'target_visit_id', target_visit_id,
        'history_revision', history_revision + 1
      ), mutation_id
    ) returning * into correction_event;
    return jsonb_build_object('event_id', correction_event.id, 'history_revision', history_revision + 1, 'kind', 'remove');
  end if;

  if nullif(trim(anchor_visit_id), '') is null
     or placement not in ('before', 'after')
     or target_step_id is null
     or completed_at is null then
    raise exception using errcode = '22023', message = 'Choose a step, placement, and completion time for the historical visit.';
  end if;
  begin
    visit_source_id := split_part(anchor_visit_id, ':', 2)::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'This history anchor is no longer valid.';
  end;
  if anchor_visit_id like 'attempt:%' and not exists (
    select 1 from public.process_step_attempts attempt
    where attempt.id = visit_source_id and attempt.assignment_id = assignment.id
  ) then
    raise exception using errcode = '40001', message = 'This history anchor changed in another session. Reload before correcting it.';
  elsif anchor_visit_id like 'execution:%' and not exists (
    select 1 from public.step_executions execution
    where execution.id = visit_source_id and execution.assignment_id = assignment.id
  ) then
    raise exception using errcode = '40001', message = 'This history anchor changed in another session. Reload before correcting it.';
  elsif anchor_visit_id like 'correction:%' and not exists (
    select 1 from public.process_events event
    where event.id = visit_source_id
      and event.event_type = 'wafer_history_correction'
      and event.metadata ->> 'assignment_id' = assignment.id::text
      and event.metadata ->> 'kind' = 'insert'
  ) then
    raise exception using errcode = '40001', message = 'This history anchor changed in another session. Reload before correcting it.';
  elsif anchor_visit_id like 'current:%' and not (
    assignment.current_step_id = visit_source_id
    or exists (
      select 1 from public.step_executions execution
      where execution.id = visit_source_id
        and execution.assignment_id = assignment.id
        and execution.process_step_id = assignment.current_step_id
        and execution.status not in ('completed', 'skipped')
    )
  ) then
    raise exception using errcode = '40001', message = 'This live history anchor changed in another session. Reload before correcting it.';
  elsif anchor_visit_id not like 'attempt:%'
    and anchor_visit_id not like 'execution:%'
    and anchor_visit_id not like 'correction:%'
    and anchor_visit_id not like 'current:%' then
    raise exception using errcode = '22023', message = 'Choose a recorded process visit as the correction anchor.';
  end if;
  if exists (
    select 1 from public.process_events event
    where event.event_type = 'wafer_history_correction'
      and event.metadata ->> 'assignment_id' = assignment.id::text
      and event.metadata ->> 'kind' = 'remove'
      and event.metadata ->> 'target_visit_id' = anchor_visit_id
  ) then
    raise exception using errcode = '40001', message = 'This history anchor was removed in another session. Reload before correcting it.';
  end if;
  select * into step
  from public.process_steps
  where id = target_step_id
    and template_id = assignment.template_id
    and archived_at is null;
  if step.id is null then
    raise exception using errcode = '22023', message = 'Choose an active step from this process.';
  end if;
  if jsonb_typeof(parameter_values) <> 'object' or jsonb_typeof(parameter_notes) <> 'object' then
    raise exception using errcode = '22023', message = 'Historical parameters must be an object.';
  end if;

  -- Validate against the immutable snapshot that will be linked to this visit.
  for field in select value from jsonb_array_elements(coalesce(step.parameters_schema -> 'fields', '[]'::jsonb)) loop
    field_key := nullif(trim(field ->> 'key'), '');
    if field_key is null then continue; end if;
    field_type := coalesce(field ->> 'type', 'text');
    field_value := parameter_values -> field_key;
    if coalesce((field ->> 'required')::boolean, false)
       and (field_value is null or field_value = 'null'::jsonb or (jsonb_typeof(field_value) = 'string' and trim(field_value #>> '{}') = '')) then
      raise exception using errcode = '22023', message = format('%s is required.', coalesce(field ->> 'label', field_key));
    end if;
    if field_value is not null and field_value <> 'null'::jsonb then
      if field_type = 'number' and not (
        jsonb_typeof(field_value) = 'number'
        or (jsonb_typeof(field_value) = 'string' and (field_value #>> '{}') ~ '^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$')
      ) then
        raise exception using errcode = '22023', message = format('%s needs a valid number.', coalesce(field ->> 'label', field_key));
      end if;
      if field_type = 'boolean' and not (
        jsonb_typeof(field_value) = 'boolean'
        or (jsonb_typeof(field_value) = 'string' and lower(field_value #>> '{}') in ('true', 'false'))
      ) then
        raise exception using errcode = '22023', message = format('%s needs Yes or No.', coalesce(field ->> 'label', field_key));
      end if;
    end if;
  end loop;

  insert into public.process_events (
    project_id, wafer_id, actor_id, event_type, event_at, notes, metadata, client_mutation_id
  ) values (
    wafer.project_id, wafer.id, auth.uid(), 'wafer_history_correction', completed_at, trim(reason),
    jsonb_build_object(
      'assignment_id', assignment.id,
      'kind', 'insert',
      'anchor_visit_id', anchor_visit_id,
      'placement', placement,
      'target_step_id', step.id,
      'target_step_name_snapshot', step.name,
      'target_step_process_area_snapshot', step.process_area,
      'completed_at', completed_at,
      'history_revision', history_revision + 1
    ), mutation_id
  ) returning * into correction_event;

  schema_snapshot := step.parameters_schema || jsonb_build_object('recordNotes', parameter_notes);
  insert into public.step_parameter_records (
    project_id, wafer_id, assignment_id, process_step_id, step_execution_id,
    process_event_id, movement_mutation_id, schema_snapshot, global_values,
    local_parameters, notes, recorded_by
  ) values (
    wafer.project_id, wafer.id, assignment.id, step.id, null,
    correction_event.id, mutation_id, schema_snapshot, parameter_values,
    '[]'::jsonb, trim(reason), auth.uid()
  );

  return jsonb_build_object(
    'event_id', correction_event.id,
    'visit_id', 'correction:' || correction_event.id::text,
    'history_revision', history_revision + 1,
    'kind', 'insert'
  );
end;
$$;

revoke execute on function public.correct_wafer_process_history(uuid, text, text, text, text, uuid, timestamptz, text, integer, uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.correct_wafer_process_history(uuid, text, text, text, text, uuid, timestamptz, text, integer, uuid, jsonb, jsonb)
  to authenticated;

comment on function public.correct_wafer_process_history(uuid, text, text, text, text, uuid, timestamptz, text, integer, uuid, jsonb, jsonb) is
  'Adds or removes an effective historical visit without deleting checkpoint evidence.';

notify pgrst, 'reload schema';
