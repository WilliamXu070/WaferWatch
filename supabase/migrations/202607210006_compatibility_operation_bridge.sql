-- One-write compatibility bridge for the existing Process Flow UI. Legacy
-- movement/checkpoint functions run inside this transaction, then their result
-- is attached to the canonical operation run and workflow revision.

create or replace function public.record_compatibility_operation_arrival(
  target_batch_id uuid,
  target_step_execution_id uuid,
  target_parent_run_id uuid,
  target_run_kind text,
  target_note text,
  movement_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  execution public.step_executions%rowtype;
  assignment public.wafer_process_assignments%rowtype;
  target_run public.operation_runs%rowtype;
  target_member public.operation_run_members%rowtype;
  parent_legacy_batch_id uuid;
begin
  select * into execution from public.step_executions where id = target_step_execution_id;
  select * into assignment from public.wafer_process_assignments where id = execution.assignment_id for update;
  if execution.id is null or assignment.id is null then
    raise exception using errcode = 'P0002', message = 'The destination execution no longer exists.';
  end if;
  if target_run_kind not in ('normal', 'redo', 'rework', 'restore') then
    raise exception using errcode = '22023', message = 'The compatibility run kind is invalid.';
  end if;

  insert into public.process_batches (
    id, template_id, process_step_id, created_by, note, origin
  ) values (
    target_batch_id, assignment.template_id, execution.process_step_id,
    auth.uid(), nullif(trim(target_note), ''),
    case when target_run_kind = 'restore' then 'restore' else 'arrival' end
  )
  on conflict (id) do update set
    note = coalesce(process_batches.note, excluded.note);

  insert into public.operation_runs (
    id, template_id, process_step_id, run_kind, status, reason,
    created_by, legacy_batch_id, started_at
  ) values (
    target_batch_id, assignment.template_id, execution.process_step_id,
    target_run_kind, 'queued',
    case when target_run_kind in ('redo', 'rework', 'restore') then nullif(trim(target_note), '') else null end,
    auth.uid(), target_batch_id, null
  )
  on conflict (id) do nothing;

  select * into target_run from public.operation_runs where id = target_batch_id for update;
  if target_run.template_id <> assignment.template_id
     or target_run.process_step_id <> execution.process_step_id then
    raise exception using errcode = '22023', message = 'The batch id already belongs to different process work.';
  end if;

  update public.operation_run_members prior
  set status = 'completed', completed_at = coalesce(prior.completed_at, now())
  where prior.assignment_id = assignment.id
    and prior.operation_run_id <> target_run.id
    and prior.status in ('queued', 'running', 'blocked', 'awaiting_review');

  insert into public.operation_run_members (
    operation_run_id, assignment_id, wafer_id, status, note,
    legacy_step_execution_id
  ) values (
    target_run.id, assignment.id, execution.wafer_id, 'queued',
    nullif(trim(target_note), ''), execution.id
  )
  on conflict (operation_run_id, assignment_id) do update set
    legacy_step_execution_id = excluded.legacy_step_execution_id,
    note = coalesce(operation_run_members.note, excluded.note)
  returning * into target_member;

  insert into public.process_batch_members (
    batch_id, assignment_id, wafer_id, process_step_id, step_execution_id
  ) values (
    target_batch_id, assignment.id, execution.wafer_id,
    execution.process_step_id, execution.id
  ) on conflict (batch_id, step_execution_id) do nothing;

  if target_parent_run_id is not null and target_parent_run_id <> target_run.id
     and exists (select 1 from public.operation_runs where id = target_parent_run_id) then
    insert into public.operation_run_links (parent_run_id, child_run_id, link_kind)
    values (
      target_parent_run_id,
      target_run.id,
      case target_run_kind when 'redo' then 'redo' when 'restore' then 'restore' else 'successor' end
    ) on conflict do nothing;
    select legacy_batch_id into parent_legacy_batch_id
    from public.operation_runs where id = target_parent_run_id;
    if parent_legacy_batch_id is not null and parent_legacy_batch_id <> target_batch_id then
      insert into public.process_batch_links (parent_batch_id, child_batch_id, link_kind)
      values (
        parent_legacy_batch_id,
        target_batch_id,
        case target_run_kind when 'restore' then 'restore' else 'successor' end
      ) on conflict do nothing;
    end if;
  end if;

  update public.wafer_process_assignments target
  set current_operation_run_member_id = target_member.id
  where target.id = assignment.id;

  update public.process_events event
  set operation_run_id = target_run.id,
      operation_run_member_id = target_member.id
  where event.client_mutation_id = movement_mutation_id;

  if nullif(trim(target_note), '') is not null and not exists (
    select 1 from public.operation_run_notes note
    where note.operation_run_member_id = target_member.id
      and note.body = trim(target_note)
  ) then
    insert into public.operation_run_notes (
      operation_run_id, operation_run_member_id, note_kind, body, created_by
    ) values (
      target_run.id,
      target_member.id,
      case when target_run_kind = 'redo' then 'redo' else 'general' end,
      trim(target_note),
      auth.uid()
    );
  end if;

  return jsonb_build_object('runId', target_run.id, 'memberId', target_member.id);
end;
$$;

revoke all on function public.record_compatibility_operation_arrival(uuid, uuid, uuid, text, text, uuid)
  from public, anon, authenticated;

create or replace function public.execute_process_flow_mutations_batch(
  mutations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mutation jsonb;
  mutation_kind text;
  operation_id uuid;
  command_mutation_id uuid;
  target_template_id uuid;
  current_template_id uuid;
  current_assignment_id uuid;
  result jsonb;
  arrival jsonb;
  attempt public.process_step_attempts%rowtype;
  source_member public.operation_run_members%rowtype;
  source_run public.operation_runs%rowtype;
  target_execution_id uuid;
  target_batch_id uuid;
  parent_batch_id uuid;
  route_decision text;
  outcomes jsonb := '[]'::jsonb;
  changed_run_ids jsonb := '[]'::jsonb;
  changed_member_ids jsonb := '[]'::jsonb;
  changed_assignment_ids jsonb := '[]'::jsonb;
  workflow_revision bigint;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  perform set_config('waferwatch.canonical_workflow_mutation', 'on', true);
  if jsonb_typeof(mutations) <> 'array' or jsonb_array_length(mutations) < 1
     or jsonb_array_length(mutations) > 256 then
    raise exception using errcode = '22023', message = 'A Process Flow batch requires between 1 and 256 mutations.';
  end if;
  command_mutation_id := case
    when mutations -> 0 ->> 'kind' = 'route' then (mutations -> 0 ->> 'movementMutationId')::uuid
    else (mutations -> 0 ->> 'mutationId')::uuid
  end;
  perform pg_advisory_xact_lock(hashtextextended(command_mutation_id::text, 0));

  for mutation in select value from jsonb_array_elements(mutations)
  loop
    mutation_kind := mutation ->> 'kind';
    if mutation_kind not in ('submit', 'move', 'route') then
      raise exception using errcode = '22023', message = 'The Process Flow mutation kind is invalid.';
    end if;
    operation_id := case
      when mutation_kind = 'route' then (mutation ->> 'movementMutationId')::uuid
      else (mutation ->> 'mutationId')::uuid
    end;
    if mutation_kind = 'submit' then
      select step.template_id, execution.assignment_id into current_template_id, current_assignment_id
      from public.step_executions execution
      join public.process_steps step on step.id = execution.process_step_id
      where execution.id = (mutation ->> 'stepExecutionId')::uuid;
    elsif mutation_kind = 'move' then
      select assignment.template_id, assignment.id into current_template_id, current_assignment_id
      from public.wafer_process_assignments assignment
      where assignment.id = (mutation ->> 'assignmentId')::uuid;
    else
      select attempt.template_id, attempt.assignment_id into current_template_id, current_assignment_id
      from public.process_step_attempts attempt
      where attempt.id = (mutation ->> 'attemptId')::uuid;
    end if;
    if current_template_id is null then
      raise exception using errcode = 'P0002', message = 'A Process Flow mutation target no longer exists.';
    end if;
    if target_template_id is null then
      target_template_id := current_template_id;
    elsif target_template_id <> current_template_id then
      raise exception using errcode = '22023', message = 'One Process Flow batch cannot span process templates.';
    end if;

    if mutation_kind = 'submit' then
      target_batch_id := coalesce(
        (
          select member.batch_id
          from public.process_batch_members member
          where member.step_execution_id = (mutation ->> 'stepExecutionId')::uuid
          order by member.created_at desc limit 1
        ),
        (mutation ->> 'batchId')::uuid
      );
      select * into attempt from public.submit_step_checkpoint(
        (mutation ->> 'stepExecutionId')::uuid,
        (mutation ->> 'mutationId')::uuid,
        nullif(trim(mutation ->> 'notes'), ''),
        coalesce(mutation -> 'evidence', '{}'::jsonb)
          || jsonb_build_object('_waferwatch_batch_id', target_batch_id)
      );
      select * into source_member
      from public.operation_run_members member
      where member.id = attempt.operation_run_member_id;
      select * into source_run
      from public.operation_runs run
      where run.id = source_member.operation_run_id;
      if source_member.id is not null then
        update public.operation_run_members member
        set status = 'awaiting_review',
            started_at = coalesce(member.started_at, attempt.started_at_snapshot, member.created_at),
            completed_at = coalesce(member.completed_at, attempt.submitted_at),
            note = coalesce(nullif(trim(mutation ->> 'notes'), ''), member.note)
        where member.id = source_member.id;
        update public.operation_runs run
        set status = 'awaiting_review',
            started_at = coalesce(run.started_at, run.created_at),
            completed_at = coalesce(run.completed_at, attempt.submitted_at)
        where run.id = source_run.id;
        update public.process_events event
        set operation_run_id = source_run.id,
            operation_run_member_id = source_member.id
        where event.client_mutation_id = (mutation ->> 'mutationId')::uuid;
        changed_run_ids := changed_run_ids || jsonb_build_array(source_run.id);
        changed_member_ids := changed_member_ids || jsonb_build_array(source_member.id);
      end if;
      result := to_jsonb(attempt);
    elsif mutation_kind = 'move' then
      select member.* into source_member
      from public.wafer_process_assignments assignment
      left join public.operation_run_members member on member.id = assignment.current_operation_run_member_id
      where assignment.id = (mutation ->> 'assignmentId')::uuid;
      select * into source_run
      from public.operation_runs run
      where run.id = source_member.operation_run_id;
      if coalesce((mutation ->> 'correctCheckpointRoute')::boolean, false) then
        result := public.correct_checkpoint_route_assignment(
          (mutation ->> 'assignmentId')::uuid,
          (mutation ->> 'targetStepId')::uuid,
          (mutation ->> 'mutationId')::uuid,
          mutation ->> 'note'
        );
      else
        result := public.move_approved_checkpoint_assignment(
          (mutation ->> 'assignmentId')::uuid,
          (mutation ->> 'targetStepId')::uuid,
          (mutation ->> 'mutationId')::uuid,
          mutation ->> 'note'
        );
      end if;
      target_execution_id := (result ->> 'step_execution_id')::uuid;
      target_batch_id := (mutation ->> 'batchId')::uuid;
      arrival := public.record_compatibility_operation_arrival(
        target_batch_id, target_execution_id, source_run.id, 'normal',
        mutation ->> 'note', (mutation ->> 'mutationId')::uuid
      );
      changed_run_ids := changed_run_ids || jsonb_build_array((arrival ->> 'runId')::uuid);
      changed_member_ids := changed_member_ids || jsonb_build_array((arrival ->> 'memberId')::uuid);
    else
      select * into attempt
      from public.process_step_attempts
      where id = (mutation ->> 'attemptId')::uuid;
      select * into source_member
      from public.operation_run_members member
      where member.id = attempt.operation_run_member_id;
      select * into source_run
      from public.operation_runs run
      where run.id = source_member.operation_run_id;
      result := public.route_checkpoint_submission(
        (mutation ->> 'attemptId')::uuid,
        (mutation ->> 'targetStepId')::uuid,
        (mutation ->> 'decisionMutationId')::uuid,
        (mutation ->> 'movementMutationId')::uuid,
        mutation ->> 'note',
        coalesce(mutation -> 'childSpecs', '[]'::jsonb)
      );
      select decision.decision into route_decision
      from public.checkpoint_decisions decision
      where decision.client_mutation_id = (mutation ->> 'decisionMutationId')::uuid;
      target_execution_id := (result ->> 'step_execution_id')::uuid;
      target_batch_id := (mutation ->> 'batchId')::uuid;
      arrival := public.record_compatibility_operation_arrival(
        target_batch_id,
        target_execution_id,
        source_run.id,
        case when route_decision = 'redo' then 'redo' else 'normal' end,
        mutation ->> 'note',
        (mutation ->> 'movementMutationId')::uuid
      );
      changed_run_ids := changed_run_ids || jsonb_build_array((arrival ->> 'runId')::uuid);
      changed_member_ids := changed_member_ids || jsonb_build_array((arrival ->> 'memberId')::uuid);
    end if;

    changed_assignment_ids := changed_assignment_ids || jsonb_build_array(current_assignment_id);
    outcomes := outcomes || jsonb_build_array(jsonb_build_object(
      'operationId', operation_id,
      'assignmentId', current_assignment_id,
      'ok', true,
      'data', result
    ));
  end loop;

  workflow_revision := public.commit_workflow_change(
    target_template_id,
    command_mutation_id,
    'compatibility.process_flow_batch',
    jsonb_build_object(
      'operationRunIds', changed_run_ids,
      'operationRunMemberIds', changed_member_ids,
      'assignmentIds', changed_assignment_ids
    )
  );
  return jsonb_build_object('outcomes', outcomes, 'workflowRevision', workflow_revision);
end;
$$;

revoke all on function public.execute_process_flow_mutations_batch(jsonb) from public, anon;
grant execute on function public.execute_process_flow_mutations_batch(jsonb) to authenticated;

comment on function public.execute_process_flow_mutations_batch(jsonb) is
  'Atomically executes up to 256 legacy Process Flow mutations and attaches them to canonical operation-run history.';
