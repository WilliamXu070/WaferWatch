-- Canonical commands emit one committed revision. Suppress their compatibility
-- table broadcasts so clients do not receive a refresh storm for one mutation.

create or replace function public.broadcast_waferwatch_workflow_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_row jsonb;
  entity_id text;
  target_template_ids uuid[] := array[]::uuid[];
  target_template_id uuid;
  target_project_id uuid;
  target_wafer_id uuid;
  event_payload jsonb;
begin
  if current_setting('waferwatch.canonical_workflow_mutation', true) = 'on' then
    return null;
  end if;

  changed_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  entity_id := coalesce(changed_row ->> 'id', changed_row ->> 'event_id');

  case tg_table_name
    when 'process_templates' then
      if changed_row ->> 'id' is not null then
        target_template_ids := array[(changed_row ->> 'id')::uuid];
      end if;
    when 'process_steps', 'process_step_transitions', 'wafer_process_assignments',
         'process_step_attempts', 'checkpoint_decisions',
         'checkpoint_submission_withdrawals', 'checkpoint_reviewer_reassignments' then
      if changed_row ->> 'template_id' is not null then
        target_template_ids := array[(changed_row ->> 'template_id')::uuid];
      end if;
    when 'process_calendar_events' then
      if changed_row ->> 'process_template_id' is not null then
        target_template_ids := array[(changed_row ->> 'process_template_id')::uuid];
      end if;
    when 'process_calendar_event_people' then
      select array[event.process_template_id]
      into target_template_ids
      from public.process_calendar_events event
      where event.id = (changed_row ->> 'event_id')::uuid;
    when 'step_executions' then
      select array[assignment.template_id], assignment.wafer_id
      into target_template_ids, target_wafer_id
      from public.wafer_process_assignments assignment
      where assignment.id = (changed_row ->> 'assignment_id')::uuid;
    when 'wafers' then
      target_wafer_id := (changed_row ->> 'id')::uuid;
      target_project_id := (changed_row ->> 'project_id')::uuid;
    when 'process_events' then
      target_project_id := (changed_row ->> 'project_id')::uuid;
      if changed_row ->> 'wafer_id' is not null then
        target_wafer_id := (changed_row ->> 'wafer_id')::uuid;
      end if;
    when 'text_surfaces' then
      target_project_id := (changed_row ->> 'project_id')::uuid;
    when 'die_inspections' then
      target_wafer_id := (changed_row ->> 'wafer_id')::uuid;
      select wafer.project_id into target_project_id
      from public.wafers wafer where wafer.id = target_wafer_id;
    else
      null;
  end case;

  if coalesce(cardinality(target_template_ids), 0) = 0 and target_wafer_id is not null then
    select coalesce(array_agg(distinct assignment.template_id), array[]::uuid[])
    into target_template_ids
    from public.wafer_process_assignments assignment
    where assignment.wafer_id = target_wafer_id and assignment.deleted_at is null;
  end if;

  if coalesce(cardinality(target_template_ids), 0) = 0 and target_project_id is not null then
    select coalesce(array_agg(distinct assignment.template_id), array[]::uuid[])
    into target_template_ids
    from public.wafer_process_assignments assignment
    join public.wafers wafer on wafer.id = assignment.wafer_id
    where wafer.project_id = target_project_id and assignment.deleted_at is null;
  end if;

  event_payload := jsonb_build_object(
    'table', tg_table_name,
    'operation', tg_op,
    'entityId', entity_id,
    'projectId', target_project_id,
    'waferId', target_wafer_id,
    'changedAt', clock_timestamp()
  );

  foreach target_template_id in array coalesce(target_template_ids, array[]::uuid[])
  loop
    perform realtime.send(
      event_payload || jsonb_build_object('processTemplateId', target_template_id),
      'workflow_changed',
      'workflow:process:' || target_template_id::text,
      true
    );
  end loop;

  if tg_table_name in ('process_templates', 'process_people', 'profiles') then
    perform realtime.send(event_payload, 'workflow_changed', 'workflow:library', true);
  end if;
  return null;
end;
$$;

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
  if current_setting('waferwatch.canonical_workflow_mutation', true) = 'on' then
    return null;
  end if;
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

revoke execute on function public.broadcast_waferwatch_workflow_change() from public, anon, authenticated;
revoke execute on function public.broadcast_step_parameter_record_change() from public, anon, authenticated;
