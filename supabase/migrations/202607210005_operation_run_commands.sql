-- Atomic actual-operation commands. Every repeat is a new operation_runs row;
-- the mutable step_executions slot is maintained only as a compatibility write.

create or replace function public.derived_mutation_uuid(
  mutation_id uuid,
  entity_id uuid,
  purpose text
)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  hash text;
begin
  hash := encode(digest(mutation_id::text || ':' || entity_id::text || ':' || purpose, 'sha256'), 'hex');
  return (
    substr(hash, 1, 8) || '-' ||
    substr(hash, 9, 4) || '-' ||
    '4' || substr(hash, 14, 3) || '-' ||
    'a' || substr(hash, 18, 3) || '-' ||
    substr(hash, 21, 12)
  )::uuid;
end;
$$;

create or replace function public.ensure_compatibility_step_execution(
  target_assignment_id uuid,
  target_wafer_id uuid,
  target_step_id uuid,
  target_status public.step_status,
  target_run_id uuid,
  actor_id uuid
)
returns public.step_executions
language plpgsql
security definer
set search_path = public
as $$
declare
  execution public.step_executions%rowtype;
begin
  select * into execution
  from public.step_executions existing
  where existing.assignment_id = target_assignment_id
    and existing.process_step_id = target_step_id
  for update;

  -- A compatibility execution is a singleton per assignment/step. Never reopen
  -- completed evidence for a canonical repeat; the new operation run is the
  -- authoritative repeat record.
  if execution.id is not null
     and execution.status in ('awaiting_checkpoint', 'ready_to_move', 'completed', 'skipped', 'redo_required') then
    return execution;
  end if;

  if execution.id is null then
    insert into public.step_executions (
      assignment_id, wafer_id, process_step_id, status, queue_started_at, metadata
    ) values (
      target_assignment_id,
      target_wafer_id,
      target_step_id,
      'queued',
      now(),
      jsonb_build_object('operation_run_id', target_run_id)
    )
    returning * into execution;
  end if;

  if target_status = 'queued' then
    return execution;
  end if;

  update public.step_executions current_execution
  set status = target_status,
    queue_started_at = coalesce(current_execution.queue_started_at, now()),
    started_at = case
      when target_status = 'running' then coalesce(current_execution.started_at, now())
      else current_execution.started_at
    end,
    operator_id = case
      when target_status = 'running' then actor_id
      else current_execution.operator_id
    end,
    metadata = coalesce(current_execution.metadata, '{}'::jsonb)
      || jsonb_build_object('operation_run_id', target_run_id),
    updated_at = now()
  where current_execution.id = execution.id
  returning * into execution;
  return execution;
end;
$$;

revoke all on function public.ensure_compatibility_step_execution(uuid, uuid, uuid, public.step_status, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.start_operation_run(
  process_step_id uuid,
  planned_operation_id uuid,
  assignment_ids uuid[],
  expected_assignment_revisions jsonb,
  run_kind text,
  source_run_ids uuid[],
  reason text,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_step public.process_steps%rowtype;
  target_operation public.planned_operations%rowtype;
  target_assignment public.wafer_process_assignments%rowtype;
  target_run public.operation_runs%rowtype;
  execution public.step_executions%rowtype;
  run_member public.operation_run_members%rowtype;
  target_project_id uuid;
  changed_member_ids jsonb := '[]'::jsonb;
  superseded_run_ids jsonb := '[]'::jsonb;
  workflow_revision bigint;
  source_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  perform set_config('waferwatch.canonical_workflow_mutation', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  if coalesce(array_length(assignment_ids, 1), 0) < 1
     or array_length(assignment_ids, 1) > 256
     or array_length(assignment_ids, 1) <> (
       select count(distinct candidate.id) from unnest(assignment_ids) as candidate(id)
     ) then
    raise exception using errcode = '22023', message = 'An operation run requires between 1 and 256 unique assignments.';
  end if;
  if jsonb_typeof(expected_assignment_revisions) <> 'object' then
    raise exception using errcode = '22023', message = 'Expected assignment revisions must be an object keyed by assignment id.';
  end if;
  if run_kind not in ('normal', 'redo', 'rework', 'restore', 'ad_hoc') then
    raise exception using errcode = '22023', message = 'The operation run kind is invalid.';
  end if;
  if planned_operation_id is null and run_kind <> 'ad_hoc' then
    raise exception using errcode = '22023', message = 'Work without a planned operation must be recorded as ad hoc.';
  end if;
  if run_kind = 'ad_hoc' and nullif(trim(reason), '') is null then
    raise exception using errcode = '22023', message = 'Ad hoc work requires a reason.';
  end if;

  select * into target_step from public.process_steps step where step.id = process_step_id and step.archived_at is null;
  if target_step.id is null then
    raise exception using errcode = 'P0002', message = 'The executable process step no longer exists.';
  end if;
  if planned_operation_id is not null then
    select * into target_operation from public.planned_operations operation where operation.id = planned_operation_id;
    if target_operation.id is null or target_operation.process_step_id <> target_step.id then
      raise exception using errcode = '22023', message = 'The planned operation does not match the executable step.';
    end if;
  end if;

  select * into target_run
  from public.operation_runs run
  where run.template_id = target_step.template_id
    and run.client_mutation_id = mutation_id;
  if target_run.id is not null then
    if target_run.process_step_id <> target_step.id or target_run.run_kind <> run_kind then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different operation run.';
    end if;
    return jsonb_build_object(
      'run', to_jsonb(target_run),
      'members', (select coalesce(jsonb_agg(to_jsonb(existing) order by existing.id), '[]'::jsonb)
        from public.operation_run_members existing where existing.operation_run_id = target_run.id),
      'workflowRevision', (select revision from public.workflow_change_log
        where template_id = target_step.template_id and client_mutation_id = mutation_id)
    );
  end if;

  -- Stable lock ordering prevents batch deadlocks.
  for target_assignment in
    select assignment.*
    from public.wafer_process_assignments assignment
    where assignment.id = any(assignment_ids)
    order by assignment.id
    for update
  loop
    if target_assignment.template_id <> target_step.template_id
       or target_assignment.current_step_id is distinct from target_step.id
       or target_assignment.archived_at is not null
       or target_assignment.deleted_at is not null then
      raise exception using errcode = '40001', message = 'An assignment is no longer ready for this operation.';
    end if;
    if (expected_assignment_revisions ->> target_assignment.id::text)::bigint is distinct from target_assignment.revision then
      raise exception using errcode = '40001', message = 'An assignment changed before the operation started.';
    end if;
    if target_project_id is null then
      select wafer.project_id into target_project_id from public.wafers wafer where wafer.id = target_assignment.wafer_id;
    elsif target_project_id is distinct from (select wafer.project_id from public.wafers wafer where wafer.id = target_assignment.wafer_id) then
      raise exception using errcode = '22023', message = 'One operation run cannot span projects.';
    end if;
  end loop;
  if (select count(*) from public.wafer_process_assignments assignment where assignment.id = any(assignment_ids))
     <> array_length(assignment_ids, 1) then
    raise exception using errcode = 'P0002', message = 'One or more assignments no longer exist.';
  end if;
  if not public.can_edit_project(target_project_id) then
    raise exception using errcode = '42501', message = 'You cannot execute work for this project.';
  end if;
  if target_operation.id is not null and target_operation.planned_batch_id is not null and exists (
    select 1
    from unnest(assignment_ids) candidate(id)
    where not exists (
      select 1 from public.planned_batch_members member
      where member.planned_batch_id = target_operation.planned_batch_id
        and member.assignment_id = candidate.id
    )
  ) then
    raise exception using errcode = '22023', message = 'Every run member must belong to the planned batch.';
  end if;

  -- Recheck after the assignment locks for a concurrent retry.
  select * into target_run
  from public.operation_runs run
  where run.template_id = target_step.template_id
    and run.client_mutation_id = mutation_id;
  if target_run.id is not null then
    return jsonb_build_object('run', to_jsonb(target_run), 'alreadyApplied', true);
  end if;

  insert into public.operation_runs (
    template_id, process_step_id, planned_operation_id, run_kind, status,
    reason, started_at, created_by, client_mutation_id
  ) values (
    target_step.template_id, target_step.id, target_operation.id, run_kind, 'running',
    nullif(trim(reason), ''), now(), auth.uid(), mutation_id
  ) returning * into target_run;

  foreach source_id in array coalesce(source_run_ids, array[]::uuid[])
  loop
    if not exists (
      select 1 from public.operation_runs source
      where source.id = source_id and source.template_id = target_step.template_id
    ) then
      raise exception using errcode = '22023', message = 'A source run belongs to a different process.';
    end if;
    insert into public.operation_run_links (parent_run_id, child_run_id, link_kind)
    values (
      source_id,
      target_run.id,
      case run_kind when 'redo' then 'redo' when 'restore' then 'restore' else 'successor' end
    ) on conflict do nothing;
  end loop;

  for target_assignment in
    select assignment.*
    from public.wafer_process_assignments assignment
    where assignment.id = any(assignment_ids)
    order by assignment.id
  loop
    update public.operation_run_members prior
    set status = 'completed', completed_at = coalesce(prior.completed_at, now())
    where prior.assignment_id = target_assignment.id
      and prior.status in ('queued', 'running', 'blocked', 'awaiting_review');

    execution := public.ensure_compatibility_step_execution(
      target_assignment.id,
      target_assignment.wafer_id,
      target_step.id,
      'running',
      target_run.id,
      auth.uid()
    );
    insert into public.operation_run_members (
      operation_run_id, assignment_id, wafer_id, status, started_at,
      legacy_step_execution_id
    ) values (
      target_run.id, target_assignment.id, target_assignment.wafer_id,
      'running', now(), execution.id
    ) returning * into run_member;
    changed_member_ids := changed_member_ids || jsonb_build_array(run_member.id);
    update public.wafer_process_assignments assignment
    set current_operation_run_member_id = run_member.id,
        current_step_id = target_step.id,
        status = 'in_progress',
        started_at = coalesce(assignment.started_at, now()),
        completed_at = null
    where assignment.id = target_assignment.id;
    update public.wafers wafer set status = 'in_progress' where wafer.id = target_assignment.wafer_id;
  end loop;

  with finished as (
    update public.operation_runs prior_run
    set status = 'completed',
        completed_at = coalesce(prior_run.completed_at, now())
    where prior_run.id <> target_run.id
      and prior_run.id in (
        select distinct prior_member.operation_run_id
        from public.operation_run_members prior_member
        where prior_member.assignment_id = any(assignment_ids)
      )
      and prior_run.status in ('queued', 'running', 'blocked', 'awaiting_review')
      and not exists (
        select 1
        from public.operation_run_members unfinished
        where unfinished.operation_run_id = prior_run.id
          and unfinished.status in ('queued', 'running', 'blocked', 'awaiting_review')
      )
    returning prior_run.id
  )
  select coalesce(jsonb_agg(finished.id order by finished.id), '[]'::jsonb)
  into superseded_run_ids
  from finished;

  insert into public.process_events (
    project_id, actor_id, event_type, notes, metadata,
    client_mutation_id, operation_run_id, planned_operation_id
  ) values (
    target_project_id, auth.uid(), 'operation_run_started', nullif(trim(reason), ''),
    jsonb_build_object('assignment_ids', assignment_ids, 'run_kind', run_kind),
    mutation_id, target_run.id, target_operation.id
  );

  workflow_revision := public.commit_workflow_change(
    target_step.template_id,
    mutation_id,
    'operation_run.start',
    jsonb_build_object(
      'operationRunIds', jsonb_build_array(target_run.id) || superseded_run_ids,
      'operationRunMemberIds', changed_member_ids,
      'assignmentIds', to_jsonb(assignment_ids)
    )
  );
  return jsonb_build_object(
    'run', to_jsonb(target_run),
    'members', (select jsonb_agg(to_jsonb(created) order by created.id)
      from public.operation_run_members created where created.operation_run_id = target_run.id),
    'workflowRevision', workflow_revision
  );
end;
$$;

create or replace function public.complete_operation_run(
  run_id uuid,
  expected_revision bigint,
  member_results jsonb,
  parameters jsonb,
  resources jsonb,
  notes jsonb,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_run public.operation_runs%rowtype;
  result jsonb;
  entry jsonb;
  target_member public.operation_run_members%rowtype;
  target_project_id uuid;
  workflow_revision bigint;
  all_terminal boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  perform set_config('waferwatch.canonical_workflow_mutation', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  if jsonb_typeof(member_results) <> 'array' or jsonb_array_length(member_results) < 1
     or jsonb_array_length(member_results) > 256
     or jsonb_typeof(parameters) <> 'array' or jsonb_typeof(resources) <> 'array'
     or jsonb_typeof(notes) <> 'array' then
    raise exception using errcode = '22023', message = 'Completion evidence has an invalid shape.';
  end if;
  if exists (
    select 1 from public.workflow_change_log change
    join public.operation_runs existing on existing.template_id = change.template_id
    where existing.id = run_id and change.client_mutation_id = mutation_id
  ) then
    select * into target_run from public.operation_runs where id = run_id;
    return jsonb_build_object('run', to_jsonb(target_run), 'alreadyApplied', true);
  end if;

  select * into target_run from public.operation_runs where id = run_id for update;
  if target_run.id is null then
    raise exception using errcode = 'P0002', message = 'The operation run no longer exists.';
  end if;
  if target_run.revision <> expected_revision then
    return jsonb_build_object('ok', false, 'code', 'stale', 'current', to_jsonb(target_run));
  end if;
  if target_run.status not in ('running', 'blocked') then
    raise exception using errcode = '55000', message = 'Only running or blocked work can be completed.';
  end if;
  select wafer.project_id into target_project_id
  from public.operation_run_members member
  join public.wafers wafer on wafer.id = member.wafer_id
  where member.operation_run_id = target_run.id limit 1;
  if not public.can_edit_project(target_project_id) then
    raise exception using errcode = '42501', message = 'You cannot complete this operation run.';
  end if;
  if (select count(*) from jsonb_array_elements(member_results)) <> (
    select count(distinct value ->> 'memberId') from jsonb_array_elements(member_results)
  ) then
    raise exception using errcode = '22023', message = 'Each run member can have only one completion result.';
  end if;

  -- Lock the selected members in a stable order.
  for target_member in
    select member.*
    from public.operation_run_members member
    where member.id in (
      select (value ->> 'memberId')::uuid from jsonb_array_elements(member_results)
    )
    order by member.id
    for update
  loop
    null;
  end loop;

  for result in select value from jsonb_array_elements(member_results)
  loop
    select * into target_member
    from public.operation_run_members member
    where member.id = (result ->> 'memberId')::uuid;
    if target_member.id is null or target_member.operation_run_id <> target_run.id then
      raise exception using errcode = '22023', message = 'A completion result belongs to a different run.';
    end if;
    if target_member.revision <> (result ->> 'expectedRevision')::bigint then
      raise exception using errcode = '40001', message = 'A run member changed before completion.';
    end if;
    if result ->> 'status' not in ('completed', 'failed', 'skipped', 'blocked') then
      raise exception using errcode = '22023', message = 'A member completion status is invalid.';
    end if;
    update public.operation_run_members member
    set status = result ->> 'status',
        note = nullif(trim(result ->> 'note'), ''),
        completed_at = case when result ->> 'status' in ('completed', 'failed', 'skipped') then now() else null end
    where member.id = target_member.id;
    update public.step_executions execution
    set status = (case result ->> 'status'
      when 'completed' then 'completed'
      when 'failed' then 'failed'
      when 'skipped' then 'skipped'
      else 'blocked'
    end)::public.step_status,
      completed_at = case when result ->> 'status' in ('completed', 'failed') then now() else null end,
      skipped_at = case when result ->> 'status' = 'skipped' then now() else null end,
      completed_by = case when result ->> 'status' in ('completed', 'skipped') then auth.uid() else null end,
      run_notes = nullif(trim(result ->> 'note'), '')
    where execution.id = target_member.legacy_step_execution_id;
  end loop;

  for entry in select value from jsonb_array_elements(parameters)
  loop
    if jsonb_typeof(coalesce(entry -> 'values', '{}'::jsonb)) <> 'object'
       or jsonb_typeof(coalesce(entry -> 'schemaSnapshot', '{}'::jsonb)) <> 'object' then
      raise exception using errcode = '22023', message = 'Parameter evidence must contain object values and schema snapshots.';
    end if;
    insert into public.operation_run_parameter_records (
      operation_run_id, operation_run_member_id, scope, schema_snapshot,
      values, recorded_by, client_mutation_id
    ) values (
      target_run.id,
      nullif(entry ->> 'memberId', '')::uuid,
      coalesce(entry ->> 'scope', case when nullif(entry ->> 'memberId', '') is null then 'global' else 'member' end),
      coalesce(entry -> 'schemaSnapshot', '{}'::jsonb),
      coalesce(entry -> 'values', '{}'::jsonb),
      auth.uid(),
      null
    );
  end loop;

  for entry in select value from jsonb_array_elements(resources)
  loop
    insert into public.operation_run_resources (
      operation_run_id, operation_run_member_id, resource_kind,
      person_id, tool_id, recipe_id, location_id, resource_snapshot, recorded_by
    ) values (
      target_run.id,
      nullif(entry ->> 'memberId', '')::uuid,
      entry ->> 'kind',
      nullif(entry ->> 'personId', '')::uuid,
      nullif(entry ->> 'toolId', '')::uuid,
      nullif(entry ->> 'recipeId', '')::uuid,
      nullif(entry ->> 'locationId', '')::uuid,
      coalesce(entry -> 'snapshot', '{}'::jsonb),
      auth.uid()
    );
  end loop;

  for entry in select value from jsonb_array_elements(notes)
  loop
    insert into public.operation_run_notes (
      operation_run_id, operation_run_member_id, note_kind, body, created_by,
      client_mutation_id
    ) values (
      target_run.id,
      nullif(entry ->> 'memberId', '')::uuid,
      coalesce(entry ->> 'kind', 'completion'),
      entry ->> 'body',
      auth.uid(),
      null
    );
  end loop;

  select bool_and(member.status in ('completed', 'failed', 'skipped'))
  into all_terminal
  from public.operation_run_members member
  where member.operation_run_id = target_run.id;
  update public.operation_runs run
  set status = case
        when all_terminal then 'completed'
        when exists (select 1 from public.operation_run_members member where member.operation_run_id = run.id and member.status = 'blocked') then 'blocked'
        else 'running'
      end,
      completed_at = case when all_terminal then now() else null end
  where run.id = target_run.id
  returning * into target_run;

  insert into public.process_events (
    project_id, actor_id, event_type, metadata, client_mutation_id, operation_run_id
  ) values (
    target_project_id, auth.uid(), 'operation_run_completed',
    jsonb_build_object('member_results', member_results), mutation_id, target_run.id
  );
  workflow_revision := public.commit_workflow_change(
    target_run.template_id,
    mutation_id,
    'operation_run.complete',
    jsonb_build_object(
      'operationRunIds', jsonb_build_array(target_run.id),
      'operationRunMemberIds', (select jsonb_agg(value -> 'memberId') from jsonb_array_elements(member_results))
    )
  );
  return jsonb_build_object('ok', true, 'run', to_jsonb(target_run), 'workflowRevision', workflow_revision);
end;
$$;

create or replace function public.submit_operation_run(
  run_id uuid,
  expected_revision bigint,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_run public.operation_runs%rowtype;
  target_member public.operation_run_members%rowtype;
  assignment public.wafer_process_assignments%rowtype;
  wafer public.wafers%rowtype;
  step public.process_steps%rowtype;
  template public.process_templates%rowtype;
  attempt public.process_step_attempts%rowtype;
  attempt_ids jsonb := '[]'::jsonb;
  workflow_revision bigint;
  next_attempt integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  perform set_config('waferwatch.canonical_workflow_mutation', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  if exists (
    select 1 from public.workflow_change_log change
    join public.operation_runs existing on existing.template_id = change.template_id
    where existing.id = run_id and change.client_mutation_id = mutation_id
  ) then
    select * into target_run from public.operation_runs where id = run_id;
    return jsonb_build_object('run', to_jsonb(target_run), 'alreadyApplied', true);
  end if;
  select * into target_run from public.operation_runs where id = run_id for update;
  if target_run.id is null then
    raise exception using errcode = 'P0002', message = 'The operation run no longer exists.';
  end if;
  if target_run.revision <> expected_revision then
    return jsonb_build_object('ok', false, 'code', 'stale', 'current', to_jsonb(target_run));
  end if;
  if target_run.status <> 'completed' then
    raise exception using errcode = '55000', message = 'Complete the operation before submitting it for review.';
  end if;
  select * into step from public.process_steps where id = target_run.process_step_id;
  select * into template from public.process_templates where id = target_run.template_id;

  for target_member in
    select member.* from public.operation_run_members member
    where member.operation_run_id = target_run.id and member.status = 'completed'
    order by member.assignment_id
    for update
  loop
    select * into assignment from public.wafer_process_assignments where id = target_member.assignment_id for update;
    select * into wafer from public.wafers where id = target_member.wafer_id;
    if not public.can_edit_project(wafer.project_id) then
      raise exception using errcode = '42501', message = 'You cannot submit this operation run.';
    end if;
    select coalesce(max(existing.attempt_number), 0) + 1 into next_attempt
    from public.process_step_attempts existing
    where existing.assignment_id = assignment.id and existing.process_step_id = step.id;
    insert into public.process_step_attempts (
      assignment_id, wafer_id, template_id, process_step_id, step_execution_id,
      attempt_number, submitted_by, started_at_snapshot, submission_notes,
      evidence_snapshot, wafer_code_snapshot, template_name_snapshot,
      template_version_snapshot, process_step_name_snapshot, process_step_order_snapshot,
      reviewer_id_snapshot, reviewer_name_snapshot, submitted_by_name_snapshot,
      prior_step_status, client_mutation_id, operation_run_member_id, submission_group_id
    ) values (
      assignment.id, wafer.id, template.id, step.id, target_member.legacy_step_execution_id,
      next_attempt, auth.uid(), target_member.started_at, target_member.note,
      jsonb_build_object('_waferwatch_batch_id', target_run.id),
      wafer.wafer_code, template.name, template.version, step.name, step.step_order,
      step.required_reviewer_id,
      coalesce(public.checkpoint_actor_name(step.required_reviewer_id), 'Unassigned reviewer'),
      coalesce(public.checkpoint_actor_name(auth.uid()), 'Unknown operator'),
      'completed',
      public.derived_mutation_uuid(mutation_id, target_member.id, 'submit'),
      target_member.id,
      mutation_id
    ) returning * into attempt;
    attempt_ids := attempt_ids || jsonb_build_array(attempt.id);
    update public.operation_run_members member
    set status = 'awaiting_review'
    where member.id = target_member.id;
    update public.step_executions execution
    set status = 'awaiting_checkpoint'
    where execution.id = target_member.legacy_step_execution_id;
  end loop;
  if jsonb_array_length(attempt_ids) = 0 then
    raise exception using errcode = '55000', message = 'This run has no completed members to submit.';
  end if;
  update public.operation_runs run
  set status = 'awaiting_review'
  where run.id = target_run.id
  returning * into target_run;
  insert into public.process_events (
    project_id, actor_id, event_type, metadata, client_mutation_id, operation_run_id
  ) values (
    (select event_wafer.project_id
      from public.operation_run_members event_member
      join public.wafers event_wafer on event_wafer.id = event_member.wafer_id
      where event_member.operation_run_id = target_run.id
      limit 1),
    auth.uid(), 'operation_run_submitted', jsonb_build_object('attempt_ids', attempt_ids),
    mutation_id, target_run.id
  );
  workflow_revision := public.commit_workflow_change(
    target_run.template_id,
    mutation_id,
    'operation_run.submit',
    jsonb_build_object('operationRunIds', jsonb_build_array(target_run.id), 'checkpointAttemptIds', attempt_ids)
  );
  return jsonb_build_object('ok', true, 'run', to_jsonb(target_run), 'attemptIds', attempt_ids, 'workflowRevision', workflow_revision);
end;
$$;

create or replace function public.review_operation_run_members(
  run_id uuid,
  decisions jsonb,
  expected_member_revisions jsonb,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_run public.operation_runs%rowtype;
  source_member public.operation_run_members%rowtype;
  target_assignment public.wafer_process_assignments%rowtype;
  child_assignment public.wafer_process_assignments%rowtype;
  target_attempt public.process_step_attempts%rowtype;
  source_step public.process_steps%rowtype;
  target_step public.process_steps%rowtype;
  decision jsonb;
  decision_kind text;
  redo_step_id uuid;
  approved_run_id uuid;
  redo_run_id uuid;
  destination_run_id uuid;
  destination_member public.operation_run_members%rowtype;
  destination_execution public.step_executions%rowtype;
  target_plan public.process_plans%rowtype;
  target_project_id uuid;
  changed_run_ids jsonb := '[]'::jsonb;
  changed_member_ids jsonb := '[]'::jsonb;
  workflow_revision bigint;
  is_dicing_review boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  perform set_config('waferwatch.canonical_workflow_mutation', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  if jsonb_typeof(decisions) <> 'array' or jsonb_array_length(decisions) < 1
     or jsonb_array_length(decisions) > 256
     or jsonb_typeof(expected_member_revisions) <> 'object' then
    raise exception using errcode = '22023', message = 'Review decisions have an invalid shape.';
  end if;
  if (select count(*) from jsonb_array_elements(decisions)) <> (
    select count(distinct value ->> 'memberId') from jsonb_array_elements(decisions)
  ) then
    raise exception using errcode = '22023', message = 'Each run member can be reviewed only once per command.';
  end if;
  if exists (
    select 1 from public.workflow_change_log change
    join public.operation_runs existing on existing.template_id = change.template_id
    where existing.id = run_id and change.client_mutation_id = mutation_id
  ) then
    select * into target_run from public.operation_runs where id = run_id;
    return jsonb_build_object('run', to_jsonb(target_run), 'alreadyApplied', true);
  end if;
  select * into target_run from public.operation_runs where id = run_id for update;
  if target_run.id is null or target_run.status <> 'awaiting_review' then
    raise exception using errcode = '55000', message = 'This operation run is not awaiting review.';
  end if;
  select * into source_step from public.process_steps where id = target_run.process_step_id;
  if source_step.required_reviewer_id is not null and source_step.required_reviewer_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'Only the assigned reviewer can decide this run.';
  end if;
  select wafer.project_id into target_project_id
  from public.operation_run_members member
  join public.wafers wafer on wafer.id = member.wafer_id
  where member.operation_run_id = target_run.id limit 1;
  if not public.can_edit_project(target_project_id) then
    raise exception using errcode = '42501', message = 'You cannot review this operation run.';
  end if;

  for source_member in
    select member.*
    from public.operation_run_members member
    where member.id in (select (value ->> 'memberId')::uuid from jsonb_array_elements(decisions))
    order by member.id
    for update
  loop
    null;
  end loop;

  for decision in select value from jsonb_array_elements(decisions)
  loop
    select * into source_member
    from public.operation_run_members member
    where member.id = (decision ->> 'memberId')::uuid;
    if source_member.id is null or source_member.operation_run_id <> target_run.id
       or source_member.status <> 'awaiting_review' then
      raise exception using errcode = '40001', message = 'A selected member is no longer awaiting this review.';
    end if;
    if source_member.revision <> (expected_member_revisions ->> source_member.id::text)::bigint then
      raise exception using errcode = '40001', message = 'A selected run member changed before review.';
    end if;
    decision_kind := decision ->> 'decision';
    if decision_kind not in ('approved', 'redo') then
      raise exception using errcode = '22023', message = 'Review decisions must be approved or redo.';
    end if;
    if decision_kind = 'redo' and nullif(trim(decision ->> 'note'), '') is null then
      raise exception using errcode = '22023', message = 'Redo decisions require a note.';
    end if;
    select * into target_attempt
    from public.process_step_attempts attempt
    where attempt.operation_run_member_id = source_member.id
      and not exists (select 1 from public.checkpoint_decisions prior where prior.attempt_id = attempt.id)
      and not exists (select 1 from public.checkpoint_submission_withdrawals withdrawal where withdrawal.attempt_id = attempt.id)
    order by attempt.attempt_number desc
    limit 1
    for update;
    if target_attempt.id is null then
      raise exception using errcode = 'P0002', message = 'The member checkpoint submission no longer exists.';
    end if;
    redo_step_id := nullif(decision ->> 'targetStepId', '')::uuid;

    is_dicing_review := decision_kind = 'approved'
      and public.checkpoint_step_is_dicing(source_step.name, source_step.slug, source_step.process_area);
    if is_dicing_review then
      perform public.review_dicing_step_checkpoint(
        target_attempt.id,
        public.derived_mutation_uuid(mutation_id, source_member.id, 'review'),
        nullif(trim(decision ->> 'note'), ''),
        coalesce(decision -> 'childSpecs', '[]'::jsonb)
      );
    else
      perform public.review_step_checkpoint(
        target_attempt.id,
        decision_kind,
        public.derived_mutation_uuid(mutation_id, source_member.id, 'review'),
        nullif(trim(decision ->> 'note'), ''),
        case when decision_kind = 'redo' then redo_step_id else null end
      );
    end if;

    update public.operation_run_members member
    set status = case when decision_kind = 'approved' then 'completed' else 'rejected' end,
        note = coalesce(nullif(trim(decision ->> 'note'), ''), member.note),
        completed_at = now()
    where member.id = source_member.id;
    changed_member_ids := changed_member_ids || jsonb_build_array(source_member.id);
    select * into target_assignment
    from public.wafer_process_assignments assignment
    where assignment.id = source_member.assignment_id
    for update;

    if target_assignment.status = 'completed' then
      update public.wafer_process_assignments assignment
      set current_operation_run_member_id = source_member.id
      where assignment.id = target_assignment.id;
      if is_dicing_review then
        for child_assignment in
          select assignment.*
          from public.wafer_process_assignments assignment
          join public.wafers child on child.id = assignment.wafer_id
          where child.parent_wafer_id = source_member.wafer_id
            and assignment.template_id = target_run.template_id
            and assignment.deleted_at is null
          order by assignment.id
          for update of assignment
        loop
          select * into target_step from public.process_steps where id = child_assignment.current_step_id;
          if target_step.id is null then
            raise exception using errcode = '55000', message = 'A diced child has no destination process step.';
          end if;
          if approved_run_id is null then
            insert into public.operation_runs (
              template_id, process_step_id, run_kind, status, created_by
            ) values (
              target_run.template_id, target_step.id, 'normal', 'queued', auth.uid()
            ) returning id into approved_run_id;
            insert into public.operation_run_links (parent_run_id, child_run_id, link_kind)
            values (target_run.id, approved_run_id, 'split');
            changed_run_ids := changed_run_ids || jsonb_build_array(approved_run_id);
          elsif exists (
            select 1 from public.operation_runs
            where id = approved_run_id and process_step_id <> target_step.id
          ) then
            raise exception using errcode = '22023', message = 'Diced children resolved to different destination steps.';
          end if;
          select * into destination_execution
          from public.step_executions execution
          where execution.assignment_id = child_assignment.id
            and execution.process_step_id = target_step.id;
          if destination_execution.id is null then
            destination_execution := public.ensure_compatibility_step_execution(
              child_assignment.id, child_assignment.wafer_id, target_step.id,
              'queued', approved_run_id, auth.uid()
            );
          end if;
          insert into public.operation_run_members (
            operation_run_id, assignment_id, wafer_id, status, legacy_step_execution_id
          ) values (
            approved_run_id, child_assignment.id, child_assignment.wafer_id,
            'queued', destination_execution.id
          ) on conflict (operation_run_id, assignment_id) do update
            set legacy_step_execution_id = excluded.legacy_step_execution_id
          returning * into destination_member;
          changed_member_ids := changed_member_ids || jsonb_build_array(destination_member.id);
          update public.wafer_process_assignments assignment
          set current_operation_run_member_id = destination_member.id
          where assignment.id = child_assignment.id;
        end loop;
      end if;
      continue;
    end if;
    select * into target_step from public.process_steps where id = target_assignment.current_step_id;
    if target_step.id is null then
      raise exception using errcode = '55000', message = 'The review did not produce a valid destination step.';
    end if;

    if decision_kind = 'approved' then
      if approved_run_id is null then
        insert into public.operation_runs (
          template_id, process_step_id, run_kind, status, created_by
        ) values (
          target_run.template_id, target_step.id, 'normal', 'queued', auth.uid()
        ) returning id into approved_run_id;
        insert into public.operation_run_links (parent_run_id, child_run_id, link_kind)
        values (target_run.id, approved_run_id, 'successor');
        changed_run_ids := changed_run_ids || jsonb_build_array(approved_run_id);
      elsif exists (select 1 from public.operation_runs where id = approved_run_id and process_step_id <> target_step.id) then
        raise exception using errcode = '22023', message = 'Approved members resolved to different destination steps.';
      end if;
      destination_run_id := approved_run_id;
    else
      if redo_run_id is null then
        insert into public.operation_runs (
          template_id, process_step_id, planned_operation_id, run_kind, status, reason, created_by
        ) values (
          target_run.template_id, target_step.id, target_run.planned_operation_id,
          'redo', 'queued', nullif(trim(decision ->> 'note'), ''), auth.uid()
        ) returning id into redo_run_id;
        insert into public.operation_run_links (parent_run_id, child_run_id, link_kind)
        values (target_run.id, redo_run_id, 'redo');
        changed_run_ids := changed_run_ids || jsonb_build_array(redo_run_id);
      elsif exists (select 1 from public.operation_runs where id = redo_run_id and process_step_id <> target_step.id) then
        raise exception using errcode = '22023', message = 'Rejected members must share one redo destination per batch review.';
      end if;
      destination_run_id := redo_run_id;
    end if;

    update public.operation_run_members prior
    set status = 'completed', completed_at = coalesce(prior.completed_at, now())
    where prior.assignment_id = target_assignment.id
      and prior.id <> source_member.id
      and prior.status in ('queued', 'running', 'blocked', 'awaiting_review');
    select * into destination_execution
    from public.step_executions execution
    where execution.assignment_id = target_assignment.id
      and execution.process_step_id = target_step.id;
    if destination_execution.id is null then
      destination_execution := public.ensure_compatibility_step_execution(
        target_assignment.id, target_assignment.wafer_id, target_step.id,
        'queued', destination_run_id, auth.uid()
      );
    end if;
    insert into public.operation_run_members (
      operation_run_id, assignment_id, wafer_id, status, legacy_step_execution_id
    ) values (
      destination_run_id, target_assignment.id, target_assignment.wafer_id,
      'queued', destination_execution.id
    ) returning * into destination_member;
    changed_member_ids := changed_member_ids || jsonb_build_array(destination_member.id);
    update public.wafer_process_assignments assignment
    set current_operation_run_member_id = destination_member.id
    where assignment.id = target_assignment.id;
  end loop;

  update public.operation_runs run
  set status = case
        when exists (
          select 1 from public.operation_run_members member
          where member.operation_run_id = run.id and member.status = 'awaiting_review'
        ) then 'awaiting_review'
        when exists (
          select 1 from public.operation_run_members member
          where member.operation_run_id = run.id and member.status = 'rejected'
        ) then 'redo_required'
        else 'completed'
      end,
      completed_at = case when not exists (
        select 1 from public.operation_run_members member
        where member.operation_run_id = run.id and member.status = 'awaiting_review'
      ) then coalesce(run.completed_at, now()) else run.completed_at end
  where run.id = target_run.id
  returning * into target_run;

  if redo_run_id is not null and target_run.planned_operation_id is not null then
    select plan.* into target_plan
    from public.planned_operations operation
    join public.process_plan_revisions revision on revision.id = operation.revision_id
    join public.process_plans plan on plan.id = revision.plan_id
    where operation.id = target_run.planned_operation_id
      and plan.is_active
    limit 1;
    if target_plan.id is not null then
      insert into public.plan_replan_requests (
        plan_id, draft_revision_id, source_run_id, request_kind,
        requested_change, requested_by, client_mutation_id
      ) values (
        target_plan.id, target_plan.shared_draft_revision_id, target_run.id, 'redo',
        jsonb_build_object('redoRunId', redo_run_id, 'decisions', decisions),
        auth.uid(), mutation_id
      ) on conflict (client_mutation_id) do nothing;
    end if;
  end if;

  insert into public.process_events (
    project_id, actor_id, event_type, metadata, client_mutation_id, operation_run_id
  ) values (
    target_project_id, auth.uid(), 'operation_run_members_reviewed',
    jsonb_build_object('decisions', decisions, 'redo_run_id', redo_run_id, 'successor_run_id', approved_run_id),
    mutation_id, target_run.id
  );
  workflow_revision := public.commit_workflow_change(
    target_run.template_id,
    mutation_id,
    'operation_run.review',
    jsonb_build_object(
      'operationRunIds', jsonb_build_array(target_run.id) || changed_run_ids,
      'operationRunMemberIds', changed_member_ids
    )
  );
  return jsonb_build_object(
    'ok', true,
    'run', to_jsonb(target_run),
    'successorRunId', approved_run_id,
    'redoRunId', redo_run_id,
    'workflowRevision', workflow_revision
  );
end;
$$;

revoke all on function public.start_operation_run(uuid, uuid, uuid[], jsonb, text, uuid[], text, uuid) from public, anon;
revoke all on function public.complete_operation_run(uuid, bigint, jsonb, jsonb, jsonb, jsonb, uuid) from public, anon;
revoke all on function public.submit_operation_run(uuid, bigint, uuid) from public, anon;
revoke all on function public.review_operation_run_members(uuid, jsonb, jsonb, uuid) from public, anon;

grant execute on function public.start_operation_run(uuid, uuid, uuid[], jsonb, text, uuid[], text, uuid) to authenticated;
grant execute on function public.complete_operation_run(uuid, bigint, jsonb, jsonb, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.submit_operation_run(uuid, bigint, uuid) to authenticated;
grant execute on function public.review_operation_run_members(uuid, jsonb, jsonb, uuid) to authenticated;
