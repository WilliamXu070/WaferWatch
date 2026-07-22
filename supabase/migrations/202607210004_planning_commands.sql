-- Optimistic, idempotent commands for the shared planning draft. Each accepted
-- command advances the workflow revision exactly once.

create or replace function public.commit_workflow_change(
  target_template_id uuid,
  mutation_id uuid,
  mutation_kind text,
  changed_entities jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  existing public.workflow_change_log%rowtype;
  next_revision bigint;
begin
  if mutation_id is null then
    raise exception using errcode = '22023', message = 'A workflow mutation id is required.';
  end if;
  if jsonb_typeof(changed_entities) <> 'object' then
    raise exception using errcode = '22023', message = 'Changed entities must be a JSON object.';
  end if;

  select * into existing
  from public.workflow_change_log change
  where change.template_id = target_template_id
    and change.client_mutation_id = mutation_id;
  if existing.id is not null then
    if existing.mutation_kind <> mutation_kind then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different workflow command.';
    end if;
    return existing.revision;
  end if;

  insert into public.workflow_revisions (template_id)
  values (target_template_id)
  on conflict (template_id) do nothing;

  perform 1
  from public.workflow_revisions revision
  where revision.template_id = target_template_id
  for update;

  select * into existing
  from public.workflow_change_log change
  where change.template_id = target_template_id
    and change.client_mutation_id = mutation_id;
  if existing.id is not null then
    return existing.revision;
  end if;

  update public.workflow_revisions revision
  set current_revision = revision.current_revision + 1,
      updated_at = now()
  where revision.template_id = target_template_id
  returning current_revision into next_revision;

  insert into public.workflow_change_log (
    template_id, revision, client_mutation_id, mutation_kind,
    changed_entities, actor_id
  ) values (
    target_template_id, next_revision, mutation_id, mutation_kind,
    changed_entities, auth.uid()
  );

  perform realtime.send(
    jsonb_build_object(
      'processTemplateId', target_template_id,
      'revision', next_revision,
      'mutationId', mutation_id,
      'mutationKind', mutation_kind,
      'changedEntities', changed_entities,
      'changedAt', clock_timestamp()
    ),
    'workflow_revision_committed',
    'workflow:process:' || target_template_id::text,
    true
  );

  return next_revision;
end;
$$;

revoke all on function public.commit_workflow_change(uuid, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.require_editable_plan_revision(target_revision_id uuid)
returns public.process_plan_revisions
language plpgsql
security definer
set search_path = public
as $$
declare
  target_revision public.process_plan_revisions%rowtype;
  target_plan public.process_plans%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  select * into target_revision
  from public.process_plan_revisions revision
  where revision.id = target_revision_id;
  if target_revision.id is null then
    raise exception using errcode = 'P0002', message = 'The plan revision no longer exists.';
  end if;
  select * into target_plan from public.process_plans where id = target_revision.plan_id;
  if target_plan.id is null or not public.can_edit_project(target_plan.project_id) then
    raise exception using errcode = '42501', message = 'You cannot edit this fabrication plan.';
  end if;
  if target_revision.status <> 'draft' or target_plan.shared_draft_revision_id is distinct from target_revision.id then
    raise exception using errcode = '55000', message = 'Only the current shared draft can be edited.';
  end if;
  return target_revision;
end;
$$;

revoke all on function public.require_editable_plan_revision(uuid) from public, anon, authenticated;

create or replace function public.touch_plan_draft(target_revision_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version bigint;
begin
  update public.process_plan_revisions revision
  set row_version = revision.row_version + 1
  where revision.id = target_revision_id
    and revision.status = 'draft'
  returning row_version into next_version;
  if next_version is null then
    raise exception using errcode = '55000', message = 'The shared draft is no longer editable.';
  end if;
  return next_version;
end;
$$;

revoke all on function public.touch_plan_draft(uuid) from public, anon, authenticated;

create or replace function public.validate_planned_operation_schedule(target_operation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select operation.*
    from public.planned_operations operation
    where operation.id = target_operation_id
  ),
  target_resources as (
    select resource.*
    from public.planned_operation_resources resource
    where resource.planned_operation_id = target_operation_id
  ),
  conflicts as (
    select jsonb_build_object(
      'kind', 'dependency',
      'operationId', target_operation_id,
      'conflictingOperationId', predecessor.id,
      'message', 'The operation starts before a predecessor and its lag are complete.'
    ) as conflict
    from target
    join public.planned_operation_dependencies dependency
      on dependency.revision_id = target.revision_id
     and dependency.successor_operation_id = target.id
    join public.planned_operations predecessor on predecessor.id = dependency.predecessor_operation_id
    where target.scheduled_start_at < predecessor.scheduled_end_at + make_interval(mins => dependency.lag_minutes)

    union all

    select jsonb_build_object(
      'kind', resource.resource_kind,
      'operationId', target_operation_id,
      'conflictingOperationId', other.id,
      'message', 'A required person or tool is already allocated during this interval.'
    )
    from target
    join target_resources resource on resource.resource_kind in ('person', 'tool')
    join public.planned_operation_resources other_resource
      on other_resource.id <> resource.id
     and other_resource.resource_kind = resource.resource_kind
     and other_resource.person_id is not distinct from resource.person_id
     and other_resource.tool_id is not distinct from resource.tool_id
    join public.planned_operations other
      on other.id = other_resource.planned_operation_id
     and other.revision_id = target.revision_id
     and other.id <> target.id
     and other.status <> 'cancelled'
     and tstzrange(other.scheduled_start_at, other.scheduled_end_at, '[)')
       && tstzrange(target.scheduled_start_at, target.scheduled_end_at, '[)')

    union all

    select jsonb_build_object(
      'kind', 'tool_status',
      'operationId', target_operation_id,
      'resourceId', tool.id,
      'message', 'A required tool is not currently available.'
    )
    from target_resources resource
    join public.fabrication_tools tool on tool.id = resource.tool_id
    where resource.resource_kind = 'tool' and tool.status <> 'available'

    union all

    select jsonb_build_object(
      'kind', 'tool_reservation',
      'operationId', target_operation_id,
      'resourceId', reservation.tool_id,
      'reservationId', reservation.id,
      'message', 'A required tool has a conflicting reservation.'
    )
    from target
    join target_resources resource on resource.resource_kind = 'tool'
    join public.tool_reservations reservation
      on reservation.tool_id = resource.tool_id
     and reservation.status = 'scheduled'
     and tstzrange(reservation.starts_at, reservation.ends_at, '[)')
       && tstzrange(target.scheduled_start_at, target.scheduled_end_at, '[)')

    union all

    select jsonb_build_object(
      'kind', 'travel_buffer',
      'operationId', target_operation_id,
      'conflictingOperationId', other.id,
      'message', 'A shared person needs a one-hour travel buffer between different locations.'
    )
    from target
    join target_resources person on person.resource_kind = 'person'
    join target_resources location on location.resource_kind = 'location'
    join public.planned_operation_resources other_person
      on other_person.resource_kind = 'person' and other_person.person_id = person.person_id
    join public.planned_operations other
      on other.id = other_person.planned_operation_id
     and other.id <> target.id
     and other.revision_id = target.revision_id
     and other.status <> 'cancelled'
    join public.planned_operation_resources other_location
      on other_location.planned_operation_id = other.id
     and other_location.resource_kind = 'location'
     and other_location.location_id <> location.location_id
    where tstzrange(
      other.scheduled_start_at - interval '1 hour',
      other.scheduled_end_at + interval '1 hour',
      '[)'
    ) && tstzrange(target.scheduled_start_at, target.scheduled_end_at, '[)')
  )
  select coalesce(jsonb_agg(conflict), '[]'::jsonb) from conflicts
$$;

revoke all on function public.validate_planned_operation_schedule(uuid) from public, anon, authenticated;

create or replace function public.create_process_plan(
  target_project_id uuid,
  target_template_id uuid,
  planning_starts_at timestamptz,
  planning_ends_at timestamptz,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_plan public.process_plans%rowtype;
  draft public.process_plan_revisions%rowtype;
  workflow_revision bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  if auth.uid() is null or not public.can_edit_project(target_project_id) then
    raise exception using errcode = '42501', message = 'You cannot create a plan for this project.';
  end if;
  if planning_ends_at <= planning_starts_at then
    raise exception using errcode = '22023', message = 'The plan window must end after it starts.';
  end if;
  if not exists (
    select 1 from public.process_templates template
    where template.id = target_template_id
      and (template.owner_project_id is null or template.owner_project_id = target_project_id)
  ) then
    raise exception using errcode = '22023', message = 'The process template cannot be used by this project.';
  end if;

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
      target_plan.id, 1, 'draft', planning_starts_at, planning_ends_at, auth.uid()
    ) returning * into draft;
    update public.process_plans
    set shared_draft_revision_id = draft.id, updated_at = now()
    where id = target_plan.id
    returning * into target_plan;
  else
    select * into draft from public.process_plan_revisions where id = target_plan.shared_draft_revision_id;
  end if;

  workflow_revision := public.commit_workflow_change(
    target_template_id,
    mutation_id,
    'plan.create',
    jsonb_build_object('planIds', jsonb_build_array(target_plan.id), 'planRevisionIds', jsonb_build_array(draft.id))
  );
  return jsonb_build_object('plan', to_jsonb(target_plan), 'draft', to_jsonb(draft), 'workflowRevision', workflow_revision);
end;
$$;

create or replace function public.create_planned_batch(
  target_revision_id uuid,
  logical_id uuid,
  batch_name text,
  batch_note text,
  assignment_ids uuid[],
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  draft public.process_plan_revisions%rowtype;
  target_plan public.process_plans%rowtype;
  target_batch public.planned_batches%rowtype;
  workflow_revision bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  draft := public.require_editable_plan_revision(target_revision_id);
  select * into target_plan from public.process_plans where id = draft.plan_id;
  if logical_id is null or nullif(trim(batch_name), '') is null then
    raise exception using errcode = '22023', message = 'A logical id and batch name are required.';
  end if;
  if coalesce(array_length(assignment_ids, 1), 0) > 256 then
    raise exception using errcode = '22023', message = 'A planned batch supports at most 256 assignments.';
  end if;

  select * into target_batch
  from public.planned_batches batch
  where batch.revision_id = target_revision_id and batch.logical_id = create_planned_batch.logical_id;
  if target_batch.id is null then
    insert into public.planned_batches (
      revision_id, logical_id, name, note, created_by
    ) values (
      target_revision_id, logical_id, trim(batch_name), nullif(trim(batch_note), ''), auth.uid()
    ) returning * into target_batch;
    insert into public.planned_batch_members (planned_batch_id, assignment_id, added_by)
    select target_batch.id, assignment.id, auth.uid()
    from public.wafer_process_assignments assignment
    join public.wafers wafer on wafer.id = assignment.wafer_id
    where assignment.id = any(coalesce(assignment_ids, array[]::uuid[]))
      and assignment.template_id = target_plan.template_id
      and wafer.project_id = target_plan.project_id;
    if (select count(*) from public.planned_batch_members member where member.planned_batch_id = target_batch.id)
      <> coalesce(array_length(assignment_ids, 1), 0) then
      raise exception using errcode = '22023', message = 'Every planned batch member must belong to the plan project and template.';
    end if;
    perform public.touch_plan_draft(target_revision_id);
  end if;

  workflow_revision := public.commit_workflow_change(
    target_plan.template_id,
    mutation_id,
    'plan.batch.create',
    jsonb_build_object('plannedBatchIds', jsonb_build_array(target_batch.id))
  );
  return jsonb_build_object('batch', to_jsonb(target_batch), 'workflowRevision', workflow_revision);
end;
$$;

create or replace function public.replace_planned_batch_members(
  target_batch_id uuid,
  expected_revision bigint,
  assignment_ids uuid[],
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_batch public.planned_batches%rowtype;
  draft public.process_plan_revisions%rowtype;
  target_plan public.process_plans%rowtype;
  workflow_revision bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  select * into target_batch from public.planned_batches where id = target_batch_id for update;
  if target_batch.id is null then
    raise exception using errcode = 'P0002', message = 'The planned batch no longer exists.';
  end if;
  draft := public.require_editable_plan_revision(target_batch.revision_id);
  select * into target_plan from public.process_plans where id = draft.plan_id;
  select change.revision into workflow_revision
  from public.workflow_change_log change
  where change.template_id = target_plan.template_id
    and change.client_mutation_id = mutation_id;
  if workflow_revision is not null then
    return jsonb_build_object('ok', true, 'batch', to_jsonb(target_batch), 'workflowRevision', workflow_revision, 'alreadyApplied', true);
  end if;
  if target_batch.row_version <> expected_revision then
    return jsonb_build_object('ok', false, 'code', 'stale', 'current', to_jsonb(target_batch));
  end if;
  if coalesce(array_length(assignment_ids, 1), 0) > 256
     or coalesce(array_length(assignment_ids, 1), 0) <> (
       select count(distinct id) from unnest(coalesce(assignment_ids, array[]::uuid[])) id
     ) then
    raise exception using errcode = '22023', message = 'Batch membership must contain at most 256 unique assignments.';
  end if;

  delete from public.planned_batch_members member where member.planned_batch_id = target_batch.id;
  insert into public.planned_batch_members (planned_batch_id, assignment_id, added_by)
  select target_batch.id, assignment.id, auth.uid()
  from public.wafer_process_assignments assignment
  join public.wafers wafer on wafer.id = assignment.wafer_id
  where assignment.id = any(coalesce(assignment_ids, array[]::uuid[]))
    and assignment.template_id = target_plan.template_id
    and wafer.project_id = target_plan.project_id;
  if (select count(*) from public.planned_batch_members member where member.planned_batch_id = target_batch.id)
    <> coalesce(array_length(assignment_ids, 1), 0) then
    raise exception using errcode = '22023', message = 'Every planned batch member must belong to the plan project and template.';
  end if;
  update public.planned_batches batch
  set updated_at = now()
  where batch.id = target_batch.id
  returning * into target_batch;
  perform public.touch_plan_draft(target_batch.revision_id);
  workflow_revision := public.commit_workflow_change(
    target_plan.template_id,
    mutation_id,
    'plan.batch.members.replace',
    jsonb_build_object('plannedBatchIds', jsonb_build_array(target_batch.id), 'assignmentIds', to_jsonb(assignment_ids))
  );
  return jsonb_build_object('ok', true, 'batch', to_jsonb(target_batch), 'workflowRevision', workflow_revision);
end;
$$;

create or replace function public.replace_planned_operation_inputs(
  target_operation_id uuid,
  parameter_rows jsonb,
  resource_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  target_assignment_id uuid;
begin
  if jsonb_typeof(parameter_rows) <> 'array' or jsonb_typeof(resource_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'Parameters and resources must be arrays.';
  end if;
  delete from public.planned_operation_parameters parameter where parameter.planned_operation_id = target_operation_id;
  for entry in select value from jsonb_array_elements(parameter_rows)
  loop
    target_assignment_id := nullif(entry ->> 'assignmentId', '')::uuid;
    insert into public.planned_operation_parameters (
      planned_operation_id, assignment_id, parameter_key, scope, value, schema_snapshot
    ) values (
      target_operation_id,
      target_assignment_id,
      entry ->> 'key',
      coalesce(entry ->> 'scope', case when target_assignment_id is null then 'global' else 'member' end),
      coalesce(entry -> 'value', 'null'::jsonb),
      coalesce(entry -> 'schemaSnapshot', '{}'::jsonb)
    );
  end loop;

  delete from public.planned_operation_resources resource where resource.planned_operation_id = target_operation_id;
  for entry in select value from jsonb_array_elements(resource_rows)
  loop
    insert into public.planned_operation_resources (
      planned_operation_id, resource_kind, person_id, tool_id, recipe_id, location_id, quantity
    ) values (
      target_operation_id,
      entry ->> 'kind',
      nullif(entry ->> 'personId', '')::uuid,
      nullif(entry ->> 'toolId', '')::uuid,
      nullif(entry ->> 'recipeId', '')::uuid,
      nullif(entry ->> 'locationId', '')::uuid,
      coalesce((entry ->> 'quantity')::numeric, 1)
    );
  end loop;
end;
$$;

revoke all on function public.replace_planned_operation_inputs(uuid, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.create_planned_operation(
  target_revision_id uuid,
  logical_id uuid,
  target_step_id uuid,
  target_batch_id uuid,
  operation_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  user_pinned boolean,
  parameter_rows jsonb,
  resource_rows jsonb,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  draft public.process_plan_revisions%rowtype;
  target_plan public.process_plans%rowtype;
  target_operation public.planned_operations%rowtype;
  conflicts jsonb;
  workflow_revision bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  draft := public.require_editable_plan_revision(target_revision_id);
  select * into target_plan from public.process_plans where id = draft.plan_id;
  if logical_id is null or ends_at <= starts_at or starts_at < draft.planning_starts_at or ends_at > draft.planning_ends_at then
    raise exception using errcode = '22023', message = 'The operation needs a logical id and a valid interval inside the plan window.';
  end if;
  if not exists (
    select 1 from public.process_steps step
    where step.id = target_step_id and step.template_id = target_plan.template_id and step.archived_at is null
  ) then
    raise exception using errcode = '22023', message = 'The process step does not belong to this plan.';
  end if;
  if target_batch_id is not null and not exists (
    select 1 from public.planned_batches batch
    where batch.id = target_batch_id and batch.revision_id = target_revision_id
  ) then
    raise exception using errcode = '22023', message = 'The planned batch belongs to a different plan revision.';
  end if;

  select * into target_operation
  from public.planned_operations operation
  where operation.revision_id = target_revision_id
    and operation.logical_id = create_planned_operation.logical_id;
  if target_operation.id is null then
    insert into public.planned_operations (
      revision_id, logical_id, process_step_id, planned_batch_id, name,
      scheduled_start_at, scheduled_end_at, user_pinned, created_by
    ) values (
      target_revision_id, logical_id, target_step_id, target_batch_id,
      coalesce(nullif(trim(operation_name), ''), (select name from public.process_steps where id = target_step_id)),
      starts_at, ends_at, user_pinned, auth.uid()
    ) returning * into target_operation;
    perform public.replace_planned_operation_inputs(target_operation.id, parameter_rows, resource_rows);
    conflicts := public.validate_planned_operation_schedule(target_operation.id);
    if jsonb_array_length(conflicts) > 0 then
      raise exception using errcode = '23P01', message = conflicts::text;
    end if;
    perform public.touch_plan_draft(target_revision_id);
  end if;
  workflow_revision := public.commit_workflow_change(
    target_plan.template_id,
    mutation_id,
    'plan.operation.create',
    jsonb_build_object('plannedOperationIds', jsonb_build_array(target_operation.id))
  );
  return jsonb_build_object('operation', to_jsonb(target_operation), 'workflowRevision', workflow_revision);
end;
$$;

create or replace function public.update_planned_operation(
  target_operation_id uuid,
  expected_revision bigint,
  patch jsonb,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_operation public.planned_operations%rowtype;
  draft public.process_plan_revisions%rowtype;
  target_plan public.process_plans%rowtype;
  next_start timestamptz;
  next_end timestamptz;
  conflicts jsonb;
  workflow_revision bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  if jsonb_typeof(patch) <> 'object' then
    raise exception using errcode = '22023', message = 'The operation patch must be a JSON object.';
  end if;
  select * into target_operation from public.planned_operations where id = target_operation_id for update;
  if target_operation.id is null then
    raise exception using errcode = 'P0002', message = 'The planned operation no longer exists.';
  end if;
  draft := public.require_editable_plan_revision(target_operation.revision_id);
  select * into target_plan from public.process_plans where id = draft.plan_id;
  select change.revision into workflow_revision
  from public.workflow_change_log change
  where change.template_id = target_plan.template_id
    and change.client_mutation_id = mutation_id;
  if workflow_revision is not null then
    return jsonb_build_object('ok', true, 'operation', to_jsonb(target_operation), 'workflowRevision', workflow_revision, 'alreadyApplied', true);
  end if;
  if target_operation.row_version <> expected_revision then
    return jsonb_build_object('ok', false, 'code', 'stale', 'current', to_jsonb(target_operation));
  end if;

  next_start := coalesce(nullif(patch ->> 'startsAt', '')::timestamptz, target_operation.scheduled_start_at);
  next_end := coalesce(nullif(patch ->> 'endsAt', '')::timestamptz, target_operation.scheduled_end_at);
  if next_end <= next_start or next_start < draft.planning_starts_at or next_end > draft.planning_ends_at then
    raise exception using errcode = '22023', message = 'The operation interval must remain inside the plan window.';
  end if;

  update public.planned_operations operation
  set name = case when patch ? 'name' then coalesce(nullif(trim(patch ->> 'name'), ''), operation.name) else operation.name end,
      scheduled_start_at = next_start,
      scheduled_end_at = next_end,
      planned_batch_id = case when patch ? 'plannedBatchId' then nullif(patch ->> 'plannedBatchId', '')::uuid else operation.planned_batch_id end,
      status = case when patch ? 'status' then patch ->> 'status' else operation.status end,
      user_pinned = case when patch ? 'userPinned' then (patch ->> 'userPinned')::boolean else operation.user_pinned end
  where operation.id = target_operation.id
  returning * into target_operation;

  if patch ? 'parameters' or patch ? 'resources' then
    perform public.replace_planned_operation_inputs(
      target_operation.id,
      case when patch ? 'parameters' then patch -> 'parameters' else (
        select coalesce(jsonb_agg(jsonb_build_object(
          'assignmentId', parameter.assignment_id,
          'key', parameter.parameter_key,
          'scope', parameter.scope,
          'value', parameter.value,
          'schemaSnapshot', parameter.schema_snapshot
        ) order by parameter.id), '[]'::jsonb)
        from public.planned_operation_parameters parameter
        where parameter.planned_operation_id = target_operation.id
      ) end,
      case when patch ? 'resources' then patch -> 'resources' else (
        select coalesce(jsonb_agg(jsonb_build_object(
          'kind', resource.resource_kind,
          'personId', resource.person_id,
          'toolId', resource.tool_id,
          'recipeId', resource.recipe_id,
          'locationId', resource.location_id,
          'quantity', resource.quantity
        ) order by resource.id), '[]'::jsonb)
        from public.planned_operation_resources resource
        where resource.planned_operation_id = target_operation.id
      ) end
    );
  end if;

  conflicts := public.validate_planned_operation_schedule(target_operation.id);
  if jsonb_array_length(conflicts) > 0 then
    raise exception using errcode = '23P01', message = conflicts::text;
  end if;
  perform public.touch_plan_draft(target_operation.revision_id);
  workflow_revision := public.commit_workflow_change(
    target_plan.template_id,
    mutation_id,
    'plan.operation.update',
    jsonb_build_object('plannedOperationIds', jsonb_build_array(target_operation.id))
  );
  return jsonb_build_object('ok', true, 'operation', to_jsonb(target_operation), 'workflowRevision', workflow_revision);
end;
$$;

create or replace function public.delete_planned_operation(
  target_operation_id uuid,
  expected_revision bigint,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_operation public.planned_operations%rowtype;
  draft public.process_plan_revisions%rowtype;
  target_plan public.process_plans%rowtype;
  workflow_revision bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  select change.revision into workflow_revision
  from public.workflow_change_log change
  where change.client_mutation_id = mutation_id
    and change.mutation_kind = 'plan.operation.delete';
  if workflow_revision is not null then
    return jsonb_build_object('ok', true, 'deletedId', target_operation_id, 'workflowRevision', workflow_revision, 'alreadyApplied', true);
  end if;
  select * into target_operation from public.planned_operations where id = target_operation_id for update;
  if target_operation.id is null then
    raise exception using errcode = 'P0002', message = 'The planned operation no longer exists.';
  end if;
  draft := public.require_editable_plan_revision(target_operation.revision_id);
  select * into target_plan from public.process_plans where id = draft.plan_id;
  if target_operation.row_version <> expected_revision then
    return jsonb_build_object('ok', false, 'code', 'stale', 'current', to_jsonb(target_operation));
  end if;
  if exists (select 1 from public.operation_runs run where run.planned_operation_id = target_operation.id) then
    raise exception using errcode = '55000', message = 'An operation with actual run history must be cancelled rather than deleted.';
  end if;
  delete from public.planned_operation_dependencies dependency
  where dependency.predecessor_operation_id = target_operation.id
     or dependency.successor_operation_id = target_operation.id;
  delete from public.planned_operation_parameters parameter where parameter.planned_operation_id = target_operation.id;
  delete from public.planned_operation_resources resource where resource.planned_operation_id = target_operation.id;
  delete from public.planned_operations operation where operation.id = target_operation.id;
  perform public.touch_plan_draft(target_operation.revision_id);
  workflow_revision := public.commit_workflow_change(
    target_plan.template_id,
    mutation_id,
    'plan.operation.delete',
    jsonb_build_object('plannedOperationIds', jsonb_build_array(target_operation.id))
  );
  return jsonb_build_object('ok', true, 'deletedId', target_operation.id, 'workflowRevision', workflow_revision);
end;
$$;

create or replace function public.publish_process_plan(
  target_revision_id uuid,
  expected_revision bigint,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  draft public.process_plan_revisions%rowtype;
  target_plan public.process_plans%rowtype;
  next_draft public.process_plan_revisions%rowtype;
  cycle_exists boolean;
  workflow_revision bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  select plan.* into target_plan
  from public.process_plan_revisions revision
  join public.process_plans plan on plan.id = revision.plan_id
  where revision.id = target_revision_id;
  select change.revision into workflow_revision
  from public.workflow_change_log change
  where change.template_id = target_plan.template_id
    and change.client_mutation_id = mutation_id;
  if workflow_revision is not null then
    select * into draft from public.process_plan_revisions where id = target_plan.current_published_revision_id;
    select * into next_draft from public.process_plan_revisions where id = target_plan.shared_draft_revision_id;
    return jsonb_build_object(
      'ok', true,
      'publishedRevision', to_jsonb(draft),
      'draftRevision', to_jsonb(next_draft),
      'workflowRevision', workflow_revision,
      'alreadyApplied', true
    );
  end if;
  select * into draft from public.process_plan_revisions where id = target_revision_id for update;
  if draft.id is null then
    raise exception using errcode = 'P0002', message = 'The plan revision no longer exists.';
  end if;
  perform public.require_editable_plan_revision(draft.id);
  select * into target_plan from public.process_plans where id = draft.plan_id for update;
  if draft.row_version <> expected_revision then
    return jsonb_build_object('ok', false, 'code', 'stale', 'current', to_jsonb(draft));
  end if;

  with recursive walk(origin_id, current_id, path, cycle) as (
    select dependency.predecessor_operation_id,
      dependency.successor_operation_id,
      array[dependency.predecessor_operation_id, dependency.successor_operation_id],
      dependency.predecessor_operation_id = dependency.successor_operation_id
    from public.planned_operation_dependencies dependency
    where dependency.revision_id = draft.id
    union all
    select walk.origin_id,
      dependency.successor_operation_id,
      walk.path || dependency.successor_operation_id,
      dependency.successor_operation_id = any(walk.path)
    from walk
    join public.planned_operation_dependencies dependency
      on dependency.revision_id = draft.id
     and dependency.predecessor_operation_id = walk.current_id
    where not walk.cycle
  )
  select exists(select 1 from walk where cycle) into cycle_exists;
  if cycle_exists then
    raise exception using errcode = '23514', message = 'Plan dependencies contain a cycle.';
  end if;
  if exists (
    select 1 from public.planned_operations operation
    where operation.revision_id = draft.id
      and jsonb_array_length(public.validate_planned_operation_schedule(operation.id)) > 0
  ) then
    raise exception using errcode = '23P01', message = 'Resolve scheduling and resource conflicts before publishing.';
  end if;

  if target_plan.current_published_revision_id is not null then
    update public.process_plan_revisions revision
    set status = 'superseded', superseded_at = now()
    where revision.id = target_plan.current_published_revision_id
      and revision.status = 'published';
  end if;
  update public.process_plan_revisions revision
  set status = 'published',
      published_by = auth.uid(),
      published_at = now(),
      row_version = revision.row_version + 1
  where revision.id = draft.id
  returning * into draft;

  insert into public.process_plan_revisions (
    plan_id, revision_number, status, based_on_revision_id,
    planning_starts_at, planning_ends_at, created_by
  ) values (
    target_plan.id,
    (select coalesce(max(revision_number), 0) + 1 from public.process_plan_revisions where plan_id = target_plan.id),
    'draft', draft.id, draft.planning_starts_at, draft.planning_ends_at, auth.uid()
  ) returning * into next_draft;

  insert into public.planned_batches (
    revision_id, logical_id, name, note, row_version, user_pinned, created_by
  )
  select next_draft.id, logical_id, name, note, 1, user_pinned, auth.uid()
  from public.planned_batches batch where batch.revision_id = draft.id;

  insert into public.planned_batch_members (planned_batch_id, assignment_id, added_by)
  select next_batch.id, member.assignment_id, auth.uid()
  from public.planned_batch_members member
  join public.planned_batches prior_batch on prior_batch.id = member.planned_batch_id
  join public.planned_batches next_batch
    on next_batch.revision_id = next_draft.id and next_batch.logical_id = prior_batch.logical_id
  where prior_batch.revision_id = draft.id;

  insert into public.planned_operations (
    revision_id, logical_id, process_step_id, planned_batch_id, name,
    description, scheduled_start_at, scheduled_end_at, status, user_pinned, row_version,
    created_by
  )
  select
    next_draft.id,
    operation.logical_id,
    operation.process_step_id,
    next_batch.id,
    operation.name,
    operation.description,
    operation.scheduled_start_at,
    operation.scheduled_end_at,
    operation.status,
    operation.user_pinned,
    1,
    auth.uid()
  from public.planned_operations operation
  left join public.planned_batches prior_batch on prior_batch.id = operation.planned_batch_id
  left join public.planned_batches next_batch
    on next_batch.revision_id = next_draft.id and next_batch.logical_id = prior_batch.logical_id
  where operation.revision_id = draft.id;

  insert into public.planned_operation_dependencies (
    revision_id, predecessor_operation_id, successor_operation_id, dependency_kind, lag_minutes
  )
  select
    next_draft.id,
    next_predecessor.id,
    next_successor.id,
    dependency.dependency_kind,
    dependency.lag_minutes
  from public.planned_operation_dependencies dependency
  join public.planned_operations prior_predecessor on prior_predecessor.id = dependency.predecessor_operation_id
  join public.planned_operations prior_successor on prior_successor.id = dependency.successor_operation_id
  join public.planned_operations next_predecessor
    on next_predecessor.revision_id = next_draft.id and next_predecessor.logical_id = prior_predecessor.logical_id
  join public.planned_operations next_successor
    on next_successor.revision_id = next_draft.id and next_successor.logical_id = prior_successor.logical_id
  where dependency.revision_id = draft.id;

  insert into public.planned_operation_parameters (
    planned_operation_id, assignment_id, parameter_key, scope, value, schema_snapshot
  )
  select next_operation.id, parameter.assignment_id, parameter.parameter_key,
    parameter.scope, parameter.value, parameter.schema_snapshot
  from public.planned_operation_parameters parameter
  join public.planned_operations prior_operation on prior_operation.id = parameter.planned_operation_id
  join public.planned_operations next_operation
    on next_operation.revision_id = next_draft.id and next_operation.logical_id = prior_operation.logical_id
  where prior_operation.revision_id = draft.id;

  insert into public.planned_operation_resources (
    planned_operation_id, resource_kind, person_id, tool_id, recipe_id, location_id, quantity
  )
  select next_operation.id, resource.resource_kind, resource.person_id,
    resource.tool_id, resource.recipe_id, resource.location_id, resource.quantity
  from public.planned_operation_resources resource
  join public.planned_operations prior_operation on prior_operation.id = resource.planned_operation_id
  join public.planned_operations next_operation
    on next_operation.revision_id = next_draft.id and next_operation.logical_id = prior_operation.logical_id
  where prior_operation.revision_id = draft.id;

  update public.process_plans plan
  set current_published_revision_id = draft.id,
      shared_draft_revision_id = next_draft.id,
      updated_at = now()
  where plan.id = target_plan.id;

  workflow_revision := public.commit_workflow_change(
    target_plan.template_id,
    mutation_id,
    'plan.publish',
    jsonb_build_object(
      'planIds', jsonb_build_array(target_plan.id),
      'planRevisionIds', jsonb_build_array(draft.id, next_draft.id)
    )
  );
  return jsonb_build_object(
    'ok', true,
    'publishedRevision', to_jsonb(draft),
    'draftRevision', to_jsonb(next_draft),
    'workflowRevision', workflow_revision
  );
end;
$$;

create or replace function public.create_plan_replan_request(
  target_plan_id uuid,
  source_run_id uuid,
  request_kind text,
  requested_change jsonb,
  mutation_id uuid
)
returns public.plan_replan_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  target_plan public.process_plans%rowtype;
  existing public.plan_replan_requests%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  select * into existing from public.plan_replan_requests request where request.client_mutation_id = mutation_id;
  if existing.id is not null then return existing; end if;
  select * into target_plan from public.process_plans where id = target_plan_id;
  if target_plan.id is null or not public.can_edit_project(target_plan.project_id) then
    raise exception using errcode = '42501', message = 'You cannot request changes to this plan.';
  end if;
  if request_kind not in ('redo', 'delay', 'resource_change', 'manual') or jsonb_typeof(requested_change) <> 'object' then
    raise exception using errcode = '22023', message = 'The replanning request is invalid.';
  end if;
  insert into public.plan_replan_requests (
    plan_id, draft_revision_id, source_run_id, request_kind,
    requested_change, requested_by, client_mutation_id
  ) values (
    target_plan.id, target_plan.shared_draft_revision_id, source_run_id, request_kind,
    requested_change, auth.uid(), mutation_id
  ) returning * into existing;
  return existing;
end;
$$;

create or replace function public.store_plan_adjustment_proposal(
  target_request_id uuid,
  expected_draft_version bigint,
  moved_operations jsonb,
  unresolved_conflicts jsonb,
  scheduler_version text
)
returns public.plan_adjustment_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.plan_replan_requests%rowtype;
  draft public.process_plan_revisions%rowtype;
  proposal public.plan_adjustment_proposals%rowtype;
begin
  select * into target_request from public.plan_replan_requests where id = target_request_id for update;
  if target_request.id is null then
    raise exception using errcode = 'P0002', message = 'The replanning request no longer exists.';
  end if;
  draft := public.require_editable_plan_revision(target_request.draft_revision_id);
  if draft.row_version <> expected_draft_version then
    raise exception using errcode = '40001', message = 'The shared draft changed while the proposal was generated.';
  end if;
  if jsonb_typeof(moved_operations) <> 'array' or jsonb_typeof(unresolved_conflicts) <> 'array' then
    raise exception using errcode = '22023', message = 'Proposal moves and conflicts must be arrays.';
  end if;
  insert into public.plan_adjustment_proposals (
    request_id, plan_id, draft_revision_id, base_draft_row_version,
    moved_operations, unresolved_conflicts, scheduler_version
  ) values (
    target_request.id, target_request.plan_id, draft.id, draft.row_version,
    moved_operations, unresolved_conflicts, coalesce(nullif(trim(scheduler_version), ''), 'v1')
  )
  on conflict (request_id) do update set
    draft_revision_id = excluded.draft_revision_id,
    base_draft_row_version = excluded.base_draft_row_version,
    status = 'ready',
    moved_operations = excluded.moved_operations,
    unresolved_conflicts = excluded.unresolved_conflicts,
    scheduler_version = excluded.scheduler_version,
    generated_at = now(),
    applied_by = null,
    applied_at = null
  returning * into proposal;
  update public.plan_replan_requests
  set status = 'proposed', processed_at = now()
  where id = target_request.id;
  return proposal;
end;
$$;

create or replace function public.apply_plan_adjustment_proposal(
  target_proposal_id uuid,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal public.plan_adjustment_proposals%rowtype;
  target_request public.plan_replan_requests%rowtype;
  target_plan public.process_plans%rowtype;
  draft public.process_plan_revisions%rowtype;
  move jsonb;
  operation public.planned_operations%rowtype;
  regenerated_request public.plan_replan_requests%rowtype;
  conflicts jsonb;
  workflow_revision bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  select * into proposal from public.plan_adjustment_proposals where id = target_proposal_id for update;
  if proposal.id is null then
    raise exception using errcode = 'P0002', message = 'The plan proposal no longer exists.';
  end if;
  select * into target_request from public.plan_replan_requests where id = proposal.request_id;
  select * into target_plan from public.process_plans where id = proposal.plan_id;
  draft := public.require_editable_plan_revision(target_plan.shared_draft_revision_id);
  if proposal.status = 'applied' then
    return jsonb_build_object('ok', true, 'proposal', to_jsonb(proposal), 'alreadyApplied', true);
  end if;
  if proposal.status <> 'ready' then
    raise exception using errcode = '55000', message = 'This proposal is no longer available to apply.';
  end if;
  if proposal.draft_revision_id is distinct from draft.id
     or proposal.base_draft_row_version <> draft.row_version then
    update public.plan_adjustment_proposals set status = 'stale' where id = proposal.id;
    insert into public.plan_replan_requests (
      plan_id, draft_revision_id, source_run_id, request_kind, requested_change,
      requested_by, client_mutation_id
    ) values (
      target_plan.id, draft.id, target_request.source_run_id, target_request.request_kind,
      target_request.requested_change, auth.uid(), mutation_id
    ) returning * into regenerated_request;
    return jsonb_build_object(
      'ok', false,
      'code', 'stale',
      'regeneratedRequest', to_jsonb(regenerated_request)
    );
  end if;

  -- Lock in stable id order before applying the proposal to avoid deadlocks.
  for operation in
    select candidate.*
    from public.planned_operations candidate
    where candidate.id in (
      select (value ->> 'operationId')::uuid from jsonb_array_elements(proposal.moved_operations)
    )
    order by candidate.id
    for update
  loop
    null;
  end loop;

  for move in select value from jsonb_array_elements(proposal.moved_operations)
  loop
    select * into operation
    from public.planned_operations candidate
    where candidate.id = (move ->> 'operationId')::uuid;
    if operation.id is null or operation.revision_id <> draft.id
       or operation.status = 'cancelled' or operation.user_pinned
       or operation.row_version <> (move ->> 'expectedRowVersion')::bigint then
      raise exception using errcode = '40001', message = 'A proposed operation changed or became locked.';
    end if;
    update public.planned_operations candidate
    set scheduled_start_at = (move ->> 'startsAt')::timestamptz,
        scheduled_end_at = (move ->> 'endsAt')::timestamptz
    where candidate.id = operation.id;
    conflicts := public.validate_planned_operation_schedule(operation.id);
    if jsonb_array_length(conflicts) > 0 then
      raise exception using errcode = '23P01', message = conflicts::text;
    end if;
  end loop;

  perform public.touch_plan_draft(draft.id);
  update public.plan_adjustment_proposals
  set status = 'applied', applied_by = auth.uid(), applied_at = now()
  where id = proposal.id
  returning * into proposal;
  update public.plan_replan_requests
  set status = 'applied', processed_at = now()
  where id = target_request.id;
  workflow_revision := public.commit_workflow_change(
    target_plan.template_id,
    mutation_id,
    'plan.proposal.apply',
    jsonb_build_object(
      'planRevisionIds', jsonb_build_array(draft.id),
      'plannedOperationIds', (
        select coalesce(jsonb_agg(value -> 'operationId'), '[]'::jsonb)
        from jsonb_array_elements(proposal.moved_operations)
      )
    )
  );
  return jsonb_build_object('ok', true, 'proposal', to_jsonb(proposal), 'workflowRevision', workflow_revision);
end;
$$;

revoke all on function public.create_process_plan(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.create_planned_batch(uuid, uuid, text, text, uuid[], uuid) from public, anon;
revoke all on function public.replace_planned_batch_members(uuid, bigint, uuid[], uuid) from public, anon;
revoke all on function public.create_planned_operation(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, boolean, jsonb, jsonb, uuid) from public, anon;
revoke all on function public.update_planned_operation(uuid, bigint, jsonb, uuid) from public, anon;
revoke all on function public.delete_planned_operation(uuid, bigint, uuid) from public, anon;
revoke all on function public.publish_process_plan(uuid, bigint, uuid) from public, anon;
revoke all on function public.create_plan_replan_request(uuid, uuid, text, jsonb, uuid) from public, anon;
revoke all on function public.store_plan_adjustment_proposal(uuid, bigint, jsonb, jsonb, text) from public, anon;
revoke all on function public.apply_plan_adjustment_proposal(uuid, uuid) from public, anon;

grant execute on function public.create_process_plan(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.create_planned_batch(uuid, uuid, text, text, uuid[], uuid) to authenticated;
grant execute on function public.replace_planned_batch_members(uuid, bigint, uuid[], uuid) to authenticated;
grant execute on function public.create_planned_operation(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, boolean, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.update_planned_operation(uuid, bigint, jsonb, uuid) to authenticated;
grant execute on function public.delete_planned_operation(uuid, bigint, uuid) to authenticated;
grant execute on function public.publish_process_plan(uuid, bigint, uuid) to authenticated;
grant execute on function public.create_plan_replan_request(uuid, uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.store_plan_adjustment_proposal(uuid, bigint, jsonb, jsonb, text) to authenticated;
grant execute on function public.apply_plan_adjustment_proposal(uuid, uuid) to authenticated;
