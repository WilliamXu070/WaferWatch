-- Calendar is a presentation of the shared plan plus manual-only events.
-- Process-linked edits mutate the shared draft; manual events keep their
-- compatibility table and use the same workflow revision stream.

alter table public.process_calendar_events
  add column if not exists client_mutation_id uuid;

create unique index if not exists process_calendar_events_client_mutation_idx
  on public.process_calendar_events (client_mutation_id)
  where client_mutation_id is not null;

create or replace function public.ensure_calendar_plan_draft(
  target_project_id uuid,
  target_template_id uuid,
  starts_at timestamptz,
  ends_at timestamptz
)
returns public.process_plan_revisions
language plpgsql
security definer
set search_path = public
as $$
declare
  target_plan public.process_plans%rowtype;
  draft public.process_plan_revisions%rowtype;
begin
  select * into target_plan
  from public.process_plans plan
  where plan.project_id = target_project_id
    and plan.template_id = target_template_id
    and plan.is_active
  for update;
  if target_plan.id is null then
    insert into public.process_plans (project_id, template_id, created_by)
    values (target_project_id, target_template_id, auth.uid())
    returning * into target_plan;
    insert into public.process_plan_revisions (
      plan_id, revision_number, status, planning_starts_at, planning_ends_at, created_by
    ) values (
      target_plan.id, 1, 'draft', starts_at - interval '7 days', ends_at + interval '30 days', auth.uid()
    ) returning * into draft;
    update public.process_plans set shared_draft_revision_id = draft.id where id = target_plan.id;
  else
    select * into draft from public.process_plan_revisions
    where id = target_plan.shared_draft_revision_id for update;
  end if;
  if draft.status <> 'draft' then
    raise exception using errcode = '55000', message = 'The shared plan draft is unavailable.';
  end if;
  if starts_at < draft.planning_starts_at or ends_at > draft.planning_ends_at then
    update public.process_plan_revisions revision
    set planning_starts_at = least(revision.planning_starts_at, starts_at - interval '7 days'),
        planning_ends_at = greatest(revision.planning_ends_at, ends_at + interval '30 days'),
        row_version = revision.row_version + 1
    where revision.id = draft.id
    returning * into draft;
  end if;
  return draft;
end;
$$;

revoke all on function public.ensure_calendar_plan_draft(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

create or replace function public.calendar_schedule_item_json(target_item_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select to_jsonb(item)
  from public.vw_process_calendar_state item
  where item.id = target_item_id
  limit 1
$$;

create or replace function public.create_calendar_schedule_item(
  target_template_id uuid,
  target_wafer_id uuid,
  target_location text,
  starts_at timestamptz,
  ends_at timestamptz,
  target_step_id uuid,
  manual_action text,
  description text,
  person_ids uuid[],
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  template public.process_templates%rowtype;
  step public.process_steps%rowtype;
  assignment public.wafer_process_assignments%rowtype;
  target_project_id uuid;
  location public.fabrication_locations%rowtype;
  draft public.process_plan_revisions%rowtype;
  target_batch public.planned_batches%rowtype;
  operation public.planned_operations%rowtype;
  event public.process_calendar_events%rowtype;
  workflow_revision bigint;
  conflicts jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  perform set_config('waferwatch.canonical_workflow_mutation', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  if ends_at <= starts_at or coalesce(array_length(person_ids, 1), 0) < 1 then
    raise exception using errcode = '22023', message = 'A schedule item needs a positive interval and at least one person.';
  end if;
  if array_length(person_ids, 1) <> (select count(distinct candidate.id) from unnest(person_ids) candidate(id))
     or exists (
       select 1 from unnest(person_ids) candidate(id)
       where not exists (
         select 1 from public.process_people person
         where person.id = candidate.id and person.is_active and person.profile_id is not null
       )
     ) then
    raise exception using errcode = '22023', message = 'Selected people must be unique active accounts.';
  end if;
  select * into template from public.process_templates where id = target_template_id;
  select * into location from public.fabrication_locations
  where name = target_location and is_active;
  if template.id is null or location.id is null then
    raise exception using errcode = '22023', message = 'The process or fabrication location is invalid.';
  end if;

  if target_step_id is null then
    if nullif(trim(manual_action), '') is null then
      raise exception using errcode = '22023', message = 'A manual schedule item requires an action.';
    end if;
    target_project_id := template.owner_project_id;
    if target_project_id is null and target_wafer_id is not null then
      select project_id into target_project_id from public.wafers where id = target_wafer_id;
    end if;
    if target_project_id is not null and not public.can_edit_project(target_project_id) then
      raise exception using errcode = '42501', message = 'You cannot edit this project schedule.';
    end if;
    select * into event from public.process_calendar_events where client_mutation_id = mutation_id;
    if event.id is null then
      insert into public.process_calendar_events (
        id, process_template_id, wafer_id, location, location_id,
        starts_at, ends_at, manual_action, description, created_by, client_mutation_id
      ) values (
        mutation_id, template.id, target_wafer_id, location.name, location.id,
        starts_at, ends_at, trim(manual_action), nullif(trim(description), ''), auth.uid(), mutation_id
      ) returning * into event;
      insert into public.process_calendar_event_people (event_id, person_id)
      select event.id, candidate.id from unnest(person_ids) candidate(id);
    end if;
    workflow_revision := public.commit_workflow_change(
      template.id, mutation_id, 'calendar.manual.create',
      jsonb_build_object('calendarEventIds', jsonb_build_array(event.id))
    );
    return jsonb_build_object('item', public.calendar_schedule_item_json(event.id), 'workflowRevision', workflow_revision);
  end if;

  select * into step from public.process_steps
  where id = target_step_id and template_id = template.id and archived_at is null;
  if step.id is null then
    raise exception using errcode = '22023', message = 'The selected process step is invalid.';
  end if;
  if target_wafer_id is not null then
    select candidate.* into assignment
    from public.wafer_process_assignments candidate
    where candidate.template_id = template.id
      and candidate.wafer_id = target_wafer_id
      and candidate.deleted_at is null
    order by candidate.assigned_at desc limit 1;
    select project_id into target_project_id from public.wafers where id = target_wafer_id;
    if assignment.id is null then
      raise exception using errcode = '22023', message = 'The selected wafer is not assigned to this process.';
    end if;
  else
    target_project_id := template.owner_project_id;
  end if;
  if target_project_id is null then
    raise exception using errcode = '22023', message = 'Select a wafer so this planned operation has a project.';
  end if;
  if not public.can_edit_project(target_project_id) then
    raise exception using errcode = '42501', message = 'You cannot edit this project plan.';
  end if;
  draft := public.ensure_calendar_plan_draft(target_project_id, template.id, starts_at, ends_at);
  select * into operation from public.planned_operations
  where revision_id = draft.id and logical_id = mutation_id;
  if operation.id is null then
    if assignment.id is not null then
      insert into public.planned_batches (
        revision_id, logical_id, name, created_by
      ) values (
        draft.id,
        public.derived_mutation_uuid(mutation_id, assignment.id, 'planned-batch'),
        'Batch · ' || (select wafer_code from public.wafers where id = assignment.wafer_id),
        auth.uid()
      ) returning * into target_batch;
      insert into public.planned_batch_members (planned_batch_id, assignment_id, added_by)
      values (target_batch.id, assignment.id, auth.uid());
    end if;
    insert into public.planned_operations (
      id, revision_id, logical_id, process_step_id, planned_batch_id,
      name, description, scheduled_start_at, scheduled_end_at, created_by
    ) values (
      mutation_id, draft.id, mutation_id, step.id, target_batch.id,
      step.name, nullif(trim(description), ''), starts_at, ends_at, auth.uid()
    ) returning * into operation;
    insert into public.planned_operation_resources (planned_operation_id, resource_kind, location_id)
    values (operation.id, 'location', location.id);
    insert into public.planned_operation_resources (planned_operation_id, resource_kind, person_id)
    select operation.id, 'person', candidate.id from unnest(person_ids) candidate(id);
    conflicts := public.validate_planned_operation_schedule(operation.id);
    if jsonb_array_length(conflicts) > 0 then
      raise exception using errcode = '23P01', message = conflicts::text;
    end if;
    perform public.touch_plan_draft(draft.id);
  end if;
  workflow_revision := public.commit_workflow_change(
    template.id, mutation_id, 'calendar.plan.create',
    jsonb_build_object(
      'plannedOperationIds', jsonb_build_array(operation.id),
      'plannedBatchIds', case when target_batch.id is null then '[]'::jsonb else jsonb_build_array(target_batch.id) end
    )
  );
  return jsonb_build_object('item', public.calendar_schedule_item_json(operation.id), 'workflowRevision', workflow_revision);
end;
$$;

create or replace function public.move_calendar_schedule_item(
  target_item_id uuid,
  expected_revision bigint,
  target_location text,
  starts_at timestamptz,
  ends_at timestamptz,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  operation public.planned_operations%rowtype;
  event public.process_calendar_events%rowtype;
  draft public.process_plan_revisions%rowtype;
  target_plan public.process_plans%rowtype;
  location public.fabrication_locations%rowtype;
  conflicts jsonb;
  workflow_revision bigint;
begin
  if auth.uid() is null or ends_at <= starts_at then
    raise exception using errcode = '22023', message = 'The schedule interval is invalid.';
  end if;
  perform set_config('waferwatch.canonical_workflow_mutation', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  select change.revision into workflow_revision
  from public.workflow_change_log change
  where change.client_mutation_id = mutation_id
    and change.mutation_kind in ('calendar.plan.move', 'calendar.manual.move');
  if workflow_revision is not null then
    return jsonb_build_object(
      'ok', true,
      'item', public.calendar_schedule_item_json(target_item_id),
      'workflowRevision', workflow_revision,
      'alreadyApplied', true
    );
  end if;
  select * into location from public.fabrication_locations where name = target_location and is_active;
  if location.id is null then
    raise exception using errcode = '22023', message = 'The fabrication location is invalid.';
  end if;
  select * into operation from public.planned_operations where id = target_item_id for update;
  if operation.id is not null then
    draft := public.require_editable_plan_revision(operation.revision_id);
    select * into target_plan from public.process_plans where id = draft.plan_id;
    if operation.row_version <> expected_revision then
      return jsonb_build_object('ok', false, 'code', 'stale', 'current', public.calendar_schedule_item_json(operation.id));
    end if;
    if starts_at < draft.planning_starts_at or ends_at > draft.planning_ends_at then
      raise exception using errcode = '22023', message = 'Move the operation inside the current planning window.';
    end if;
    update public.planned_operations target
    set scheduled_start_at = starts_at, scheduled_end_at = ends_at
    where target.id = operation.id;
    delete from public.planned_operation_resources resource
    where resource.planned_operation_id = operation.id and resource.resource_kind = 'location';
    insert into public.planned_operation_resources (planned_operation_id, resource_kind, location_id)
    values (operation.id, 'location', location.id);
    conflicts := public.validate_planned_operation_schedule(operation.id);
    if jsonb_array_length(conflicts) > 0 then
      raise exception using errcode = '23P01', message = conflicts::text;
    end if;
    perform public.touch_plan_draft(draft.id);
    workflow_revision := public.commit_workflow_change(
      target_plan.template_id, mutation_id, 'calendar.plan.move',
      jsonb_build_object('plannedOperationIds', jsonb_build_array(operation.id))
    );
    return jsonb_build_object('ok', true, 'item', public.calendar_schedule_item_json(operation.id), 'workflowRevision', workflow_revision);
  end if;

  select * into event from public.process_calendar_events where id = target_item_id for update;
  if event.id is null then
    raise exception using errcode = 'P0002', message = 'The schedule item no longer exists.';
  end if;
  if event.revision <> expected_revision then
    return jsonb_build_object('ok', false, 'code', 'stale', 'current', public.calendar_schedule_item_json(event.id));
  end if;
  if not exists (
    select 1 from public.process_templates template
    where template.id = event.process_template_id
      and (template.owner_project_id is null or public.can_edit_project(template.owner_project_id))
  ) then
    raise exception using errcode = '42501', message = 'You cannot move this schedule item.';
  end if;
  update public.process_calendar_events target
  set location = location.name, location_id = location.id,
      starts_at = move_calendar_schedule_item.starts_at,
      ends_at = move_calendar_schedule_item.ends_at
  where target.id = event.id
  returning * into event;
  workflow_revision := public.commit_workflow_change(
    event.process_template_id, mutation_id, 'calendar.manual.move',
    jsonb_build_object('calendarEventIds', jsonb_build_array(event.id))
  );
  return jsonb_build_object('ok', true, 'item', public.calendar_schedule_item_json(event.id), 'workflowRevision', workflow_revision);
end;
$$;

create or replace function public.update_calendar_schedule_item(
  target_item_id uuid,
  expected_revision bigint,
  target_wafer_id uuid,
  target_step_id uuid,
  manual_action text,
  description text,
  person_ids uuid[],
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  operation public.planned_operations%rowtype;
  event public.process_calendar_events%rowtype;
  draft public.process_plan_revisions%rowtype;
  target_plan public.process_plans%rowtype;
  step public.process_steps%rowtype;
  assignment public.wafer_process_assignments%rowtype;
  target_batch public.planned_batches%rowtype;
  conflicts jsonb;
  workflow_revision bigint;
begin
  if auth.uid() is null or coalesce(array_length(person_ids, 1), 0) < 1 then
    raise exception using errcode = '42501', message = 'Authentication and at least one person are required.';
  end if;
  perform set_config('waferwatch.canonical_workflow_mutation', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  select change.revision into workflow_revision
  from public.workflow_change_log change
  where change.client_mutation_id = mutation_id
    and change.mutation_kind in ('calendar.plan.update', 'calendar.manual.update');
  if workflow_revision is not null then
    return jsonb_build_object(
      'ok', true,
      'item', public.calendar_schedule_item_json(target_item_id),
      'workflowRevision', workflow_revision,
      'alreadyApplied', true
    );
  end if;
  if exists (
    select 1 from unnest(person_ids) candidate(id)
    where not exists (
      select 1 from public.process_people person
      where person.id = candidate.id and person.is_active and person.profile_id is not null
    )
  ) then
    raise exception using errcode = '22023', message = 'One or more selected people are unavailable.';
  end if;

  select * into operation from public.planned_operations where id = target_item_id for update;
  if operation.id is not null then
    if target_step_id is null then
      raise exception using errcode = '22023', message = 'Delete this planned operation before replacing it with a manual event.';
    end if;
    draft := public.require_editable_plan_revision(operation.revision_id);
    select * into target_plan from public.process_plans where id = draft.plan_id;
    if operation.row_version <> expected_revision then
      return jsonb_build_object('ok', false, 'code', 'stale', 'current', public.calendar_schedule_item_json(operation.id));
    end if;
    select * into step from public.process_steps
    where id = target_step_id and template_id = target_plan.template_id and archived_at is null;
    if step.id is null then
      raise exception using errcode = '22023', message = 'The selected process step is invalid.';
    end if;
    if target_wafer_id is not null then
      select candidate.* into assignment
      from public.wafer_process_assignments candidate
      join public.wafers wafer on wafer.id = candidate.wafer_id
      where candidate.template_id = target_plan.template_id
        and candidate.wafer_id = target_wafer_id
        and wafer.project_id = target_plan.project_id
        and candidate.deleted_at is null
      order by candidate.assigned_at desc limit 1;
      if assignment.id is null then
        raise exception using errcode = '22023', message = 'The selected wafer does not belong to this plan.';
      end if;
      insert into public.planned_batches (revision_id, logical_id, name, created_by)
      values (
        draft.id,
        public.derived_mutation_uuid(mutation_id, assignment.id, 'planned-batch'),
        'Batch · ' || (select wafer_code from public.wafers where id = assignment.wafer_id),
        auth.uid()
      ) returning * into target_batch;
      insert into public.planned_batch_members (planned_batch_id, assignment_id, added_by)
      values (target_batch.id, assignment.id, auth.uid());
    end if;
    update public.planned_operations target
    set process_step_id = step.id,
        planned_batch_id = target_batch.id,
        name = step.name,
        description = nullif(trim(update_calendar_schedule_item.description), '')
    where target.id = operation.id;
    delete from public.planned_operation_resources resource
    where resource.planned_operation_id = operation.id and resource.resource_kind = 'person';
    insert into public.planned_operation_resources (planned_operation_id, resource_kind, person_id)
    select operation.id, 'person', candidate.id from unnest(person_ids) candidate(id);
    conflicts := public.validate_planned_operation_schedule(operation.id);
    if jsonb_array_length(conflicts) > 0 then
      raise exception using errcode = '23P01', message = conflicts::text;
    end if;
    perform public.touch_plan_draft(draft.id);
    workflow_revision := public.commit_workflow_change(
      target_plan.template_id, mutation_id, 'calendar.plan.update',
      jsonb_build_object('plannedOperationIds', jsonb_build_array(operation.id))
    );
    return jsonb_build_object('ok', true, 'item', public.calendar_schedule_item_json(operation.id), 'workflowRevision', workflow_revision);
  end if;

  if target_step_id is not null then
    raise exception using errcode = '22023', message = 'Delete this manual event before replacing it with a planned operation.';
  end if;
  select * into event from public.process_calendar_events where id = target_item_id for update;
  if event.id is null then
    raise exception using errcode = 'P0002', message = 'The schedule item no longer exists.';
  end if;
  if event.revision <> expected_revision then
    return jsonb_build_object('ok', false, 'code', 'stale', 'current', public.calendar_schedule_item_json(event.id));
  end if;
  if nullif(trim(manual_action), '') is null then
    raise exception using errcode = '22023', message = 'A manual event requires an action.';
  end if;
  update public.process_calendar_events target
  set wafer_id = target_wafer_id,
      manual_action = trim(update_calendar_schedule_item.manual_action),
      description = nullif(trim(update_calendar_schedule_item.description), '')
  where target.id = event.id
  returning * into event;
  delete from public.process_calendar_event_people where event_id = event.id;
  insert into public.process_calendar_event_people (event_id, person_id)
  select event.id, candidate.id from unnest(person_ids) candidate(id);
  workflow_revision := public.commit_workflow_change(
    event.process_template_id, mutation_id, 'calendar.manual.update',
    jsonb_build_object('calendarEventIds', jsonb_build_array(event.id))
  );
  return jsonb_build_object('ok', true, 'item', public.calendar_schedule_item_json(event.id), 'workflowRevision', workflow_revision);
end;
$$;

create or replace function public.delete_calendar_schedule_item(
  target_item_id uuid,
  expected_revision bigint,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  operation public.planned_operations%rowtype;
  event public.process_calendar_events%rowtype;
  draft public.process_plan_revisions%rowtype;
  target_plan public.process_plans%rowtype;
  workflow_revision bigint;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  perform set_config('waferwatch.canonical_workflow_mutation', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  select change.revision into workflow_revision
  from public.workflow_change_log change
  where change.client_mutation_id = mutation_id
    and change.mutation_kind in ('calendar.plan.delete', 'calendar.manual.delete');
  if workflow_revision is not null then
    return jsonb_build_object(
      'ok', true,
      'id', target_item_id,
      'workflowRevision', workflow_revision,
      'alreadyApplied', true
    );
  end if;
  select * into operation from public.planned_operations where id = target_item_id for update;
  if operation.id is not null then
    draft := public.require_editable_plan_revision(operation.revision_id);
    select * into target_plan from public.process_plans where id = draft.plan_id;
    if operation.row_version <> expected_revision then
      return jsonb_build_object('ok', false, 'code', 'stale', 'current', public.calendar_schedule_item_json(operation.id));
    end if;
    if exists (select 1 from public.operation_runs run where run.planned_operation_id = operation.id) then
      update public.planned_operations set status = 'cancelled' where id = operation.id;
    else
      delete from public.planned_operation_dependencies
      where predecessor_operation_id = operation.id or successor_operation_id = operation.id;
      delete from public.planned_operation_parameters where planned_operation_id = operation.id;
      delete from public.planned_operation_resources where planned_operation_id = operation.id;
      delete from public.planned_operations where id = operation.id;
    end if;
    perform public.touch_plan_draft(draft.id);
    workflow_revision := public.commit_workflow_change(
      target_plan.template_id, mutation_id, 'calendar.plan.delete',
      jsonb_build_object('plannedOperationIds', jsonb_build_array(operation.id))
    );
    return jsonb_build_object('ok', true, 'id', operation.id, 'workflowRevision', workflow_revision);
  end if;
  select * into event from public.process_calendar_events where id = target_item_id for update;
  if event.id is null then
    raise exception using errcode = 'P0002', message = 'The schedule item no longer exists.';
  end if;
  if event.revision <> expected_revision then
    return jsonb_build_object('ok', false, 'code', 'stale', 'current', public.calendar_schedule_item_json(event.id));
  end if;
  delete from public.process_calendar_events where id = event.id;
  workflow_revision := public.commit_workflow_change(
    event.process_template_id, mutation_id, 'calendar.manual.delete',
    jsonb_build_object('calendarEventIds', jsonb_build_array(event.id))
  );
  return jsonb_build_object('ok', true, 'id', event.id, 'workflowRevision', workflow_revision);
end;
$$;

revoke all on function public.create_calendar_schedule_item(uuid, uuid, text, timestamptz, timestamptz, uuid, text, text, uuid[], uuid) from public, anon;
revoke all on function public.move_calendar_schedule_item(uuid, bigint, text, timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.update_calendar_schedule_item(uuid, bigint, uuid, uuid, text, text, uuid[], uuid) from public, anon;
revoke all on function public.delete_calendar_schedule_item(uuid, bigint, uuid) from public, anon;
grant execute on function public.create_calendar_schedule_item(uuid, uuid, text, timestamptz, timestamptz, uuid, text, text, uuid[], uuid) to authenticated;
grant execute on function public.move_calendar_schedule_item(uuid, bigint, text, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.update_calendar_schedule_item(uuid, bigint, uuid, uuid, text, text, uuid[], uuid) to authenticated;
grant execute on function public.delete_calendar_schedule_item(uuid, bigint, uuid) to authenticated;
