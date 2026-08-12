-- Keep the legacy singleton execution and canonical operation-run identity in
-- lockstep. Compatibility Process Flow commands still use the legacy
-- checkpoint functions, so the transition guard must recognize both a valid
-- canonical identity and the existing scoped checkpoint authorization.

update public.step_executions execution
set metadata = coalesce(execution.metadata, '{}'::jsonb)
  || jsonb_build_object('operation_run_id', member.operation_run_id)
from public.wafer_process_assignments assignment
join public.operation_run_members member
  on member.id = assignment.current_operation_run_member_id
join public.operation_runs run
  on run.id = member.operation_run_id
where execution.id = member.legacy_step_execution_id
  and execution.assignment_id = assignment.id
  and execution.process_step_id = assignment.current_step_id
  and member.assignment_id = assignment.id
  and member.history_effective
  and run.template_id = assignment.template_id
  and run.process_step_id = execution.process_step_id
  and execution.metadata ->> 'operation_run_id' is distinct from member.operation_run_id::text;

create or replace function public.sync_current_operation_run_execution_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.operation_run_members%rowtype;
  current_run public.operation_runs%rowtype;
  current_execution public.step_executions%rowtype;
begin
  if new.current_operation_run_member_id is null then
    return new;
  end if;

  select * into current_member
  from public.operation_run_members member
  where member.id = new.current_operation_run_member_id;
  select * into current_run
  from public.operation_runs run
  where run.id = current_member.operation_run_id;
  select * into current_execution
  from public.step_executions execution
  where execution.id = current_member.legacy_step_execution_id;

  if current_member.id is null
     or current_member.assignment_id <> new.id
     or not current_member.history_effective
     or current_run.id is null
     or current_run.template_id <> new.template_id
     or current_execution.id is null
     or current_execution.assignment_id <> new.id
     or current_execution.process_step_id <> current_run.process_step_id
     or current_execution.process_step_id <> new.current_step_id then
    raise exception using
      errcode = '55000',
      message = 'The current operation-run member does not match the Process Flow execution.';
  end if;

  update public.step_executions execution
  set metadata = coalesce(execution.metadata, '{}'::jsonb)
    || jsonb_build_object('operation_run_id', current_run.id)
  where execution.id = current_execution.id
    and execution.metadata ->> 'operation_run_id' is distinct from current_run.id::text;

  return new;
end;
$$;

revoke execute on function public.sync_current_operation_run_execution_identity()
  from public, anon, authenticated;

drop trigger if exists sync_current_operation_run_execution_identity
  on public.wafer_process_assignments;
create trigger sync_current_operation_run_execution_identity
after insert or update of current_operation_run_member_id
on public.wafer_process_assignments
for each row
execute function public.sync_current_operation_run_execution_identity();

create or replace function public.enforce_checkpoint_execution_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment public.wafer_process_assignments%rowtype;
  execution_step public.process_steps%rowtype;
  current_step public.process_steps%rowtype;
  authorized boolean := false;
  canonical_run_id uuid;
  canonical_run_text text;
  canonical_current_context boolean := false;
begin
  if tg_op = 'UPDATE' and (
    new.assignment_id is distinct from old.assignment_id
    or new.wafer_id is distinct from old.wafer_id
    or new.process_step_id is distinct from old.process_step_id
  ) then
    raise exception using errcode = '55000', message = 'Step execution identity is immutable.';
  end if;

  select * into assignment
  from public.wafer_process_assignments
  where id = new.assignment_id;
  select * into execution_step
  from public.process_steps
  where id = new.process_step_id;
  select * into current_step
  from public.process_steps
  where id = assignment.current_step_id;

  if new.wafer_id is distinct from assignment.wafer_id
     or execution_step.template_id is distinct from assignment.template_id then
    raise exception using errcode = '55000', message = 'Step executions must match their assignment and process.';
  end if;

  authorized := public.checkpoint_transition_is_authorized(assignment.id, new.id)
    or public.checkpoint_dicing_child_is_authorized(
      assignment.wafer_id,
      assignment.template_id,
      execution_step.id
    );

  if current_setting('waferwatch.canonical_workflow_mutation', true) = 'on' then
    canonical_run_text := nullif(new.metadata ->> 'operation_run_id', '');
    if canonical_run_text is not null then
      begin
        canonical_run_id := canonical_run_text::uuid;
      exception when invalid_text_representation then
        raise exception using errcode = '55000', message = 'The canonical operation-run transition is invalid.';
      end;
      if exists (
        select 1
        from public.operation_runs run
        where run.id = canonical_run_id
          and run.template_id = assignment.template_id
          and run.process_step_id = execution_step.id
      ) then
        return new;
      end if;
      raise exception using errcode = '55000', message = 'The canonical operation-run transition is invalid.';
    end if;

    -- Reviewer routes, anytime moves, undo, and dicing already carry a
    -- persisted assignment-scoped authorization token. Let the ordinary guard
    -- below validate that token instead of rejecting it for missing metadata.
    if not authorized then
      -- A checkpoint-route correction can create its destination execution
      -- before record_compatibility_operation_arrival creates the successor
      -- run. The batch RPC is trusted only while the assignment still has a
      -- coherent canonical current member and the actor can edit its project.
      select exists (
        select 1
        from public.operation_run_members member
        join public.operation_runs run on run.id = member.operation_run_id
        join public.step_executions current_execution
          on current_execution.id = member.legacy_step_execution_id
        join public.wafers wafer on wafer.id = assignment.wafer_id
        where member.id = assignment.current_operation_run_member_id
          and member.assignment_id = assignment.id
          and member.history_effective
          and current_execution.assignment_id = assignment.id
          and current_execution.process_step_id = assignment.current_step_id
          and run.template_id = assignment.template_id
          and run.process_step_id = assignment.current_step_id
          and auth.uid() is not null
          and public.can_edit_project(wafer.project_id)
      ) into canonical_current_context;
      if not canonical_current_context then
        raise exception using errcode = '55000', message = 'The canonical operation-run transition is invalid.';
      end if;
      return new;
    end if;
  end if;

  if tg_op = 'INSERT' then
    if authorized then
      if new.status not in ('queued', 'redo_required', 'ready_to_move') then
        raise exception using errcode = '55000', message = 'Checkpoint actions created an invalid execution state.';
      end if;
    elsif execution_step.id = current_step.id then
      if new.status <> 'queued' then
        raise exception using errcode = '55000', message = 'The current step must begin queued.';
      end if;
    elsif new.status <> 'pending' then
      raise exception using errcode = '55000', message = 'Non-current steps must begin pending.';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and new.process_step_id is distinct from assignment.current_step_id
     and not authorized then
    raise exception using errcode = '55000', message = 'Only the current step can be worked before a checkpoint action.';
  end if;
  if new.status is distinct from old.status
     and (
       new.status in ('awaiting_checkpoint', 'ready_to_move', 'completed', 'redo_required')
       or old.status in ('awaiting_checkpoint', 'ready_to_move', 'completed')
     )
     and not authorized then
    raise exception using errcode = '55000', message = 'Protected status changes require an explicit checkpoint action.';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_checkpoint_execution_transition()
  from public, anon, authenticated;

create or replace function public.enforce_checkpoint_assignment_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  template_status text;
  canonical_current_context boolean := false;
begin
  if new.wafer_id is distinct from old.wafer_id
     or new.template_id is distinct from old.template_id then
    raise exception using errcode = '55000', message = 'Published assignment identity is immutable.';
  end if;

  select template.lifecycle_status
  into template_status
  from public.process_templates template
  where template.id = old.template_id;

  if template_status is distinct from 'published' then
    return new;
  end if;

  if new.current_step_id is distinct from old.current_step_id
     or new.completed_at is distinct from old.completed_at
     or (new.status = 'completed' and old.status is distinct from 'completed') then
    if public.checkpoint_transition_is_authorized(new.id, null) then
      return new;
    end if;

    if current_setting('waferwatch.canonical_workflow_mutation', true) = 'on' then
      select exists (
        select 1
        from public.operation_run_members member
        join public.operation_runs run on run.id = member.operation_run_id
        join public.step_executions execution
          on execution.id = member.legacy_step_execution_id
        join public.wafers wafer on wafer.id = old.wafer_id
        where member.id = old.current_operation_run_member_id
          and member.assignment_id = old.id
          and member.history_effective
          and execution.assignment_id = old.id
          and execution.process_step_id = old.current_step_id
          and run.template_id = old.template_id
          and run.process_step_id = old.current_step_id
          and auth.uid() is not null
          and public.can_edit_project(wafer.project_id)
      ) into canonical_current_context;
    end if;

    if not canonical_current_context then
      raise exception using
        errcode = '55000',
        message = 'Published workflows advance or complete only through an explicit checkpoint decision.';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_checkpoint_assignment_transition()
  from public, anon, authenticated;

comment on function public.sync_current_operation_run_execution_identity() is
  'Copies the canonical current run id onto its legacy Process Flow execution after every current-member change.';

-- The compatibility batch previously used `attempt` as both a PL/pgSQL record
-- variable and a table alias. PostgreSQL treats the reviewer-route lookup as
-- ambiguous, so route actions failed before their checkpoint decision ran.
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
  checkpoint_attempt public.process_step_attempts%rowtype;
  source_member public.operation_run_members%rowtype;
  source_run public.operation_runs%rowtype;
  target_execution_id uuid;
  target_batch_id uuid;
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
      select step.template_id, execution.assignment_id
      into current_template_id, current_assignment_id
      from public.step_executions execution
      join public.process_steps step on step.id = execution.process_step_id
      where execution.id = (mutation ->> 'stepExecutionId')::uuid;
    elsif mutation_kind = 'move' then
      select assignment.template_id, assignment.id
      into current_template_id, current_assignment_id
      from public.wafer_process_assignments assignment
      where assignment.id = (mutation ->> 'assignmentId')::uuid;
    else
      select attempt_row.template_id, attempt_row.assignment_id
      into current_template_id, current_assignment_id
      from public.process_step_attempts attempt_row
      where attempt_row.id = (mutation ->> 'attemptId')::uuid;
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
      select * into checkpoint_attempt
      from public.submit_step_checkpoint(
        (mutation ->> 'stepExecutionId')::uuid,
        (mutation ->> 'mutationId')::uuid,
        nullif(trim(mutation ->> 'notes'), ''),
        coalesce(mutation -> 'evidence', '{}'::jsonb)
          || jsonb_build_object('_waferwatch_batch_id', target_batch_id)
      );
      select * into source_member
      from public.operation_run_members member
      where member.id = checkpoint_attempt.operation_run_member_id;
      select * into source_run
      from public.operation_runs run
      where run.id = source_member.operation_run_id;
      if source_member.id is not null then
        update public.operation_run_members member
        set status = 'awaiting_review',
            started_at = coalesce(member.started_at, checkpoint_attempt.started_at_snapshot, member.created_at),
            completed_at = coalesce(member.completed_at, checkpoint_attempt.submitted_at),
            note = coalesce(nullif(trim(mutation ->> 'notes'), ''), member.note)
        where member.id = source_member.id;
        update public.operation_runs run
        set status = 'awaiting_review',
            started_at = coalesce(run.started_at, run.created_at),
            completed_at = coalesce(run.completed_at, checkpoint_attempt.submitted_at)
        where run.id = source_run.id;
        update public.process_events event
        set operation_run_id = source_run.id,
            operation_run_member_id = source_member.id
        where event.client_mutation_id = (mutation ->> 'mutationId')::uuid;
        changed_run_ids := changed_run_ids || jsonb_build_array(source_run.id);
        changed_member_ids := changed_member_ids || jsonb_build_array(source_member.id);
      end if;
      result := to_jsonb(checkpoint_attempt);
    elsif mutation_kind = 'move' then
      select member.* into source_member
      from public.wafer_process_assignments assignment
      left join public.operation_run_members member
        on member.id = assignment.current_operation_run_member_id
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
      target_execution_id := coalesce(
        nullif(result ->> 'step_execution_id', '')::uuid,
        (
          select event.step_execution_id
          from public.process_events event
          where event.client_mutation_id = (mutation ->> 'mutationId')::uuid
        )
      );
      if target_execution_id is null then
        raise exception using errcode = 'P0002', message = 'The destination execution no longer exists.';
      end if;
      target_batch_id := (mutation ->> 'batchId')::uuid;
      arrival := public.record_compatibility_operation_arrival(
        target_batch_id,
        target_execution_id,
        source_run.id,
        'normal',
        mutation ->> 'note',
        (mutation ->> 'mutationId')::uuid
      );
      changed_run_ids := changed_run_ids || jsonb_build_array((arrival ->> 'runId')::uuid);
      changed_member_ids := changed_member_ids || jsonb_build_array((arrival ->> 'memberId')::uuid);
    else
      select * into checkpoint_attempt
      from public.process_step_attempts attempt_row
      where attempt_row.id = (mutation ->> 'attemptId')::uuid;
      select * into source_member
      from public.operation_run_members member
      where member.id = checkpoint_attempt.operation_run_member_id;
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

revoke all on function public.execute_process_flow_mutations_batch(jsonb)
  from public, anon;
grant execute on function public.execute_process_flow_mutations_batch(jsonb)
  to authenticated;

notify pgrst, 'reload schema';
