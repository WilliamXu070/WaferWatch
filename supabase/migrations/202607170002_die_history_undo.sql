-- Undo advances the selected die's effective process-history head backward by
-- one persisted state. The underlying audit rows remain append-only; a single
-- `wafer_history_undone` event records which visit, checkpoint, or decision is
-- superseded so Process Flow and Wafer / Die Status project the same result.

alter table public.checkpoint_decisions
  drop constraint if exists checkpoint_decisions_attempt_id_key;

create index if not exists checkpoint_decisions_attempt_time_idx
  on public.checkpoint_decisions (attempt_id, decided_at desc, id desc);

create or replace function public.checkpoint_transition_is_authorized(
  target_assignment_id uuid,
  target_step_execution_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  transition_token text := current_setting('waferwatch.checkpoint_transition', true);
  token_kind text;
  token_id uuid;
begin
  if transition_token is null or transition_token = '' or position(':' in transition_token) = 0 then
    return false;
  end if;
  token_kind := split_part(transition_token, ':', 1);
  begin token_id := split_part(transition_token, ':', 2)::uuid;
  exception when invalid_text_representation then return false;
  end;
  if token_kind = 'attempt' then
    return exists (
      select 1 from public.process_step_attempts attempt
      where attempt.id = token_id and attempt.assignment_id = target_assignment_id
        and (target_step_execution_id is null or attempt.step_execution_id = target_step_execution_id)
    );
  end if;
  if token_kind = 'withdrawal' then
    return exists (
      select 1 from public.checkpoint_submission_withdrawals withdrawal
      where withdrawal.id = token_id and withdrawal.assignment_id = target_assignment_id
        and (target_step_execution_id is null or withdrawal.step_execution_id = target_step_execution_id)
    );
  end if;
  if token_kind = 'decision' then
    return exists (
      select 1
      from public.checkpoint_decisions decision
      join public.wafer_process_assignments assignment on assignment.id = target_assignment_id
      where decision.id = token_id
        and decision.template_id = assignment.template_id
        and (
          decision.assignment_id = target_assignment_id
          or exists (
            select 1 from public.wafers child
            join public.wafers parent on parent.id = decision.wafer_id
            where child.id = assignment.wafer_id
              and child.project_id = parent.project_id
              and child.metadata ->> 'parent_wafer_id' = parent.id::text
          )
        )
        and (
          target_step_execution_id is null
          or decision.step_execution_id = target_step_execution_id
          or decision.decision in ('redo', 'approved')
        )
    );
  end if;
  if token_kind = 'anytime' then
    return exists (
      select 1
      from public.process_events movement
      where movement.id = token_id
        and movement.actor_id = auth.uid()
        and movement.event_type = 'checkpoint_step_entered'
        and movement.metadata ->> 'movement_kind' = 'anytime_enter'
        and movement.metadata ->> 'assignment_id' = target_assignment_id::text
        and (
          target_step_execution_id is null
          or exists (
            select 1
            from public.step_executions execution
            where execution.id = target_step_execution_id
              and execution.assignment_id = target_assignment_id
              and execution.process_step_id::text in (
                movement.metadata ->> 'from_step_id',
                movement.metadata ->> 'target_step_id'
              )
          )
        )
    );
  end if;
  if token_kind = 'history_undo' then
    return exists (
      select 1
      from public.process_events undo_event
      where undo_event.id = token_id
        and undo_event.event_type = 'wafer_history_undone'
        and undo_event.actor_id = auth.uid()
        and undo_event.metadata ->> 'assignment_id' = target_assignment_id::text
    );
  end if;
  return false;
end;
$$;

create or replace function public.review_step_checkpoint(
  target_attempt_id uuid,
  review_decision text,
  mutation_id uuid,
  notes text default null,
  redo_target_step_id uuid default null
)
returns public.checkpoint_decisions
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_decision public.checkpoint_decisions%rowtype;
  decision_row public.checkpoint_decisions%rowtype;
  attempt public.process_step_attempts%rowtype;
  execution public.step_executions%rowtype;
  assignment public.wafer_process_assignments%rowtype;
  wafer public.wafers%rowtype;
  step public.process_steps%rowtype;
  target_step public.process_steps%rowtype;
  target_execution public.step_executions%rowtype;
  reviewer_name text;
  process_completed boolean := false;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = auth.uid() and profile.is_active = true) then
    raise exception using errcode = '42501', message = 'An active account is required.';
  end if;
  if review_decision not in ('approved', 'redo') then
    raise exception using errcode = '22023', message = 'Checkpoint decision must be approved or redo.';
  end if;
  if review_decision = 'redo' and (nullif(trim(notes), '') is null or redo_target_step_id is null) then
    raise exception using errcode = '22023', message = 'Redo requires a reason and destination step.';
  end if;

  select * into existing_decision from public.checkpoint_decisions where client_mutation_id = mutation_id;
  if existing_decision.id is not null then
    if existing_decision.attempt_id <> target_attempt_id
       or existing_decision.decision <> review_decision
       or existing_decision.decided_by is distinct from auth.uid()
       or (review_decision = 'redo' and existing_decision.target_step_id is distinct from redo_target_step_id) then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different checkpoint decision.';
    end if;
    return existing_decision;
  end if;

  select * into attempt from public.process_step_attempts where id = target_attempt_id for update;
  if attempt.id is null then
    raise exception using errcode = 'P0002', message = 'The checkpoint submission no longer exists.';
  end if;
  select * into execution from public.step_executions where id = attempt.step_execution_id for update;
  select * into assignment from public.wafer_process_assignments where id = attempt.assignment_id for update;
  select * into wafer from public.wafers where id = attempt.wafer_id for update;
  select * into step from public.process_steps where id = attempt.process_step_id;

  if review_decision = 'approved'
     and public.checkpoint_step_is_dicing(step.name, step.slug, step.process_area)
     and current_setting('waferwatch.atomic_dicing_review', true) is distinct from
       attempt.id::text || ':' || mutation_id::text then
    raise exception using errcode = '55000', message = 'Dicing checkpoints must be approved through the atomic child handoff.';
  end if;
  if not public.can_edit_project(wafer.project_id)
     or step.required_reviewer_id is distinct from auth.uid()
     or not public.checkpoint_reviewer_can_edit_project(auth.uid(), wafer.project_id) then
    raise exception using errcode = '42501', message = 'Only the assigned checkpoint reviewer can decide this submission.';
  end if;
  if exists (select 1 from public.checkpoint_submission_withdrawals withdrawal where withdrawal.attempt_id = attempt.id) then
    raise exception using errcode = '55000', message = 'This checkpoint submission was withdrawn.';
  end if;
  if exists (
    select 1
    from public.checkpoint_decisions prior
    where prior.attempt_id = attempt.id
      and not exists (
        select 1
        from public.process_events undo_event
        where undo_event.event_type = 'wafer_history_undone'
          and undo_event.metadata ->> 'undone_decision_id' = prior.id::text
      )
  ) then
    raise exception using errcode = '55000', message = 'This checkpoint submission was already decided.';
  end if;
  if execution.status <> 'awaiting_checkpoint' or assignment.current_step_id is distinct from step.id then
    raise exception using errcode = '40001', message = 'This wafer is no longer awaiting this checkpoint decision.';
  end if;

  if review_decision = 'redo' then
    select * into target_step
    from public.process_steps
    where id = redo_target_step_id
      and template_id = attempt.template_id
      and archived_at is null;
    if target_step.id is null then
      raise exception using errcode = '22023', message = 'Choose an active step from this process for redo.';
    end if;
  end if;

  process_completed := review_decision = 'approved'
    and step.node_type = 'end'
    and not public.checkpoint_step_is_dicing(step.name, step.slug, step.process_area);
  reviewer_name := coalesce(public.checkpoint_actor_name(auth.uid()), attempt.reviewer_name_snapshot);

  insert into public.checkpoint_decisions (
    attempt_id, assignment_id, wafer_id, template_id, process_step_id,
    step_execution_id, decision, decided_by, decision_notes, target_step_id,
    wafer_code_snapshot, process_step_name_snapshot, process_step_order_snapshot,
    target_step_name_snapshot, target_step_order_snapshot, decided_by_name_snapshot,
    client_mutation_id
  ) values (
    attempt.id, attempt.assignment_id, attempt.wafer_id, attempt.template_id,
    attempt.process_step_id, attempt.step_execution_id, review_decision, auth.uid(),
    nullif(trim(notes), ''), target_step.id, attempt.wafer_code_snapshot,
    attempt.process_step_name_snapshot, attempt.process_step_order_snapshot,
    target_step.name, target_step.step_order, reviewer_name, mutation_id
  ) returning * into decision_row;

  perform set_config('waferwatch.checkpoint_transition', 'decision:' || decision_row.id::text, true);

  if review_decision = 'approved' then
    update public.step_executions
    set status = case when process_completed then 'completed'::public.step_status else 'ready_to_move'::public.step_status end,
        completed_at = now(),
        completed_by = auth.uid(),
        run_notes = coalesce(nullif(trim(notes), ''), run_notes)
    where id = execution.id;

    if process_completed then
      update public.wafer_process_assignments
      set status = 'completed', completed_at = now(), current_step_id = step.id,
          started_at = coalesce(started_at, now())
      where id = assignment.id;
      update public.wafers set status = 'completed' where id = wafer.id;
    else
      update public.wafer_process_assignments
      set status = 'in_progress', current_step_id = step.id, completed_at = null,
          started_at = coalesce(started_at, now())
      where id = assignment.id;
      update public.wafers set status = 'in_progress' where id = wafer.id;
    end if;
  else
    update public.step_executions
    set status = 'pending', queue_started_at = null, started_at = null,
        completed_at = null, skipped_at = null, completed_by = null,
        operator_id = null, planned_end_at = null
    where assignment_id = assignment.id and id <> execution.id
      and status in ('queued', 'running', 'blocked', 'awaiting_checkpoint', 'ready_to_move', 'redo_required');

    select * into target_execution from public.step_executions
    where assignment_id = assignment.id and process_step_id = target_step.id for update;
    if target_execution.id is null then
      insert into public.step_executions (
        assignment_id, wafer_id, process_step_id, status, queue_started_at, metadata
      ) values (
        assignment.id, wafer.id, target_step.id, 'redo_required', now(), '{}'::jsonb
      ) returning * into target_execution;
    else
      update public.step_executions
      set status = 'redo_required', queue_started_at = now(), started_at = null,
          completed_at = null, skipped_at = null, completed_by = null,
          operator_id = null, planned_end_at = null,
          run_notes = coalesce(nullif(trim(notes), ''), run_notes)
      where id = target_execution.id returning * into target_execution;
    end if;
    update public.wafer_process_assignments
    set status = 'in_progress', current_step_id = target_step.id,
        completed_at = null, started_at = coalesce(started_at, now())
    where id = assignment.id;
    update public.wafers set status = 'in_progress' where id = wafer.id;
  end if;

  insert into public.process_events (
    project_id, wafer_id, step_execution_id, actor_id, event_type,
    notes, metadata, client_mutation_id
  ) values (
    wafer.project_id, wafer.id, execution.id, auth.uid(),
    case when review_decision = 'approved' then 'checkpoint_approved' else 'checkpoint_redo_requested' end,
    nullif(trim(notes), ''),
    jsonb_build_object(
      'assignment_id', assignment.id,
      'attempt_id', attempt.id,
      'decision_id', decision_row.id,
      'from_step_id', step.id,
      'from_step_name', step.name,
      'target_step_id', target_step.id,
      'target_step_name', target_step.name,
      'process_completed', process_completed
    ),
    mutation_id
  );
  return decision_row;
end;
$$;

create or replace function public.undo_die_process_history_state(
  target_assignment_id uuid,
  expected_step_id uuid,
  expected_step_status text,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment public.wafer_process_assignments%rowtype;
  wafer public.wafers%rowtype;
  current_execution public.step_executions%rowtype;
  previous_execution public.step_executions%rowtype;
  movement public.process_events%rowtype;
  previous_movement public.process_events%rowtype;
  undo_event public.process_events%rowtype;
  existing_undo public.process_events%rowtype;
  attempt public.process_step_attempts%rowtype;
  decision public.checkpoint_decisions%rowtype;
  source_step_id uuid;
  previous_status public.step_status;
  previous_state text;
  undone_decision_id uuid := null;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = auth.uid() and profile.is_active = true) then
    raise exception using errcode = '42501', message = 'An active account is required.';
  end if;

  select * into existing_undo
  from public.process_events
  where client_mutation_id = mutation_id;
  if existing_undo.id is not null then
    if existing_undo.event_type <> 'wafer_history_undone'
       or existing_undo.actor_id is distinct from auth.uid()
       or existing_undo.metadata ->> 'assignment_id' is distinct from target_assignment_id::text then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different history undo.';
    end if;
    return jsonb_build_object('event_id', existing_undo.id, 'already_undone', true) || existing_undo.metadata;
  end if;

  select * into assignment
  from public.wafer_process_assignments
  where id = target_assignment_id
  for update;
  if assignment.id is null or assignment.current_step_id is null then
    raise exception using errcode = 'P0002', message = 'This die is no longer active in the process.';
  end if;
  select * into wafer from public.wafers where id = assignment.wafer_id for update;
  if wafer.id is null or wafer.metadata ->> 'parent_wafer_id' is null then
    raise exception using errcode = '22023', message = 'History undo is available only for one selected die.';
  end if;
  if not public.can_edit_project(wafer.project_id) then
    raise exception using errcode = '42501', message = 'You cannot undo this die history.';
  end if;
  if assignment.current_step_id is distinct from expected_step_id then
    raise exception using errcode = '40001', message = 'This die moved in another session. Reload the process flow and try again.';
  end if;

  select * into current_execution
  from public.step_executions
  where assignment_id = assignment.id and process_step_id = assignment.current_step_id
  for update;
  if current_execution.id is null or current_execution.status::text is distinct from expected_step_status then
    raise exception using errcode = '40001', message = 'This die history changed in another session. Reload the process flow and try again.';
  end if;

  if current_execution.status in ('ready_to_move', 'completed') then
    select * into decision
    from public.checkpoint_decisions candidate
    where candidate.assignment_id = assignment.id
      and candidate.step_execution_id = current_execution.id
      and not exists (
        select 1 from public.process_events prior_undo
        where prior_undo.event_type = 'wafer_history_undone'
          and prior_undo.metadata ->> 'undone_decision_id' = candidate.id::text
      )
    order by candidate.decided_at desc, candidate.id desc
    limit 1;
    if decision.id is null then
      raise exception using errcode = '55000', message = 'This checkpoint has no previous history state to restore.';
    end if;

    insert into public.process_events (
      project_id, wafer_id, step_execution_id, actor_id, event_type, metadata, client_mutation_id
    ) values (
      wafer.project_id, wafer.id, current_execution.id, auth.uid(), 'wafer_history_undone',
      jsonb_build_object(
        'assignment_id', assignment.id,
        'undone_decision_id', decision.id,
        'from_step_id', assignment.current_step_id,
        'from_status', current_execution.status,
        'target_step_id', assignment.current_step_id,
        'target_status', 'awaiting_checkpoint'
      ), mutation_id
    ) returning * into undo_event;
    perform set_config('waferwatch.checkpoint_transition', 'history_undo:' || undo_event.id::text, true);

    update public.step_executions
    set status = 'awaiting_checkpoint', completed_at = null, completed_by = null
    where id = current_execution.id;
    update public.wafer_process_assignments
    set status = 'in_progress', completed_at = null
    where id = assignment.id;
    update public.wafers set status = 'in_progress' where id = wafer.id;
    return jsonb_build_object('event_id', undo_event.id, 'state', 'awaiting_checkpoint', 'step_id', assignment.current_step_id);
  end if;

  if current_execution.status = 'awaiting_checkpoint' then
    select * into attempt
    from public.process_step_attempts candidate
    where candidate.assignment_id = assignment.id
      and candidate.step_execution_id = current_execution.id
      and not exists (
        select 1 from public.process_events prior_undo
        where prior_undo.event_type = 'wafer_history_undone'
          and prior_undo.metadata ->> 'undone_attempt_id' = candidate.id::text
      )
    order by candidate.attempt_number desc, candidate.id desc
    limit 1;
    if attempt.id is null then
      raise exception using errcode = '55000', message = 'This checkpoint has no previous Beginning state to restore.';
    end if;

    insert into public.process_events (
      project_id, wafer_id, step_execution_id, actor_id, event_type, metadata, client_mutation_id
    ) values (
      wafer.project_id, wafer.id, current_execution.id, auth.uid(), 'wafer_history_undone',
      jsonb_build_object(
        'assignment_id', assignment.id,
        'undone_attempt_id', attempt.id,
        'from_step_id', assignment.current_step_id,
        'from_status', current_execution.status,
        'target_step_id', assignment.current_step_id,
        'target_status', attempt.prior_step_status
      ), mutation_id
    ) returning * into undo_event;
    perform set_config('waferwatch.checkpoint_transition', 'history_undo:' || undo_event.id::text, true);

    update public.step_executions
    set status = attempt.prior_step_status,
        completed_at = null,
        completed_by = null
    where id = current_execution.id;
    return jsonb_build_object('event_id', undo_event.id, 'state', attempt.prior_step_status, 'step_id', assignment.current_step_id);
  end if;

  if current_execution.status not in ('queued', 'running', 'blocked', 'redo_required') then
    raise exception using errcode = '55000', message = 'This die has no previous process state to undo.';
  end if;

  select * into movement
  from public.process_events candidate
  where candidate.wafer_id = wafer.id
    and candidate.event_type in ('checkpoint_step_entered', 'wafer_step_moved', 'wafer_step_reverted')
    and candidate.metadata ->> 'assignment_id' = assignment.id::text
    and coalesce(candidate.metadata ->> 'target_step_id', candidate.metadata ->> 'to_step_id') = assignment.current_step_id::text
    and not exists (
      select 1 from public.process_events prior_undo
      where prior_undo.event_type = 'wafer_history_undone'
        and prior_undo.metadata ->> 'undone_process_event_id' = candidate.id::text
    )
    and not exists (
      select 1 from public.process_events active_correction
      where active_correction.event_type = 'checkpoint_step_entered'
        and active_correction.metadata ->> 'corrected_event_id' = candidate.id::text
        and not exists (
          select 1 from public.process_events correction_undo
          where correction_undo.event_type = 'wafer_history_undone'
            and correction_undo.metadata ->> 'undone_process_event_id' = active_correction.id::text
        )
    )
  order by candidate.event_at desc, candidate.id desc
  limit 1;

  if movement.id is null then
    raise exception using errcode = '55000', message = 'This die is at its first Beginning state and cannot be undone.';
  end if;

  if movement.metadata ->> 'corrected_event_id' is not null then
    select * into previous_movement
    from public.process_events
    where id = (movement.metadata ->> 'corrected_event_id')::uuid;
    source_step_id := coalesce(
      nullif(previous_movement.metadata ->> 'target_step_id', '')::uuid,
      nullif(previous_movement.metadata ->> 'to_step_id', '')::uuid
    );
    previous_status := case
      when coalesce(previous_movement.metadata ->> 'route_decision', '') = 'redo'
        or coalesce(previous_movement.metadata ->> 'movement_kind', '') = 'checkpoint_redo_route'
      then 'redo_required'::public.step_status
      else 'queued'::public.step_status
    end;
    previous_state := 'Beginning';
  else
    source_step_id := nullif(movement.metadata ->> 'from_step_id', '')::uuid;
    begin
      select * into decision
      from public.checkpoint_decisions candidate
      where candidate.id = nullif(movement.metadata ->> 'checkpoint_decision_id', '')::uuid
        and candidate.assignment_id = assignment.id
        and not exists (
          select 1 from public.process_events prior_undo
          where prior_undo.event_type = 'wafer_history_undone'
            and prior_undo.metadata ->> 'undone_decision_id' = candidate.id::text
        );
    exception when invalid_text_representation then
      decision := null;
    end;
    if decision.id is not null then
      previous_status := 'awaiting_checkpoint'::public.step_status;
      previous_state := 'Complete';
      undone_decision_id := decision.id;
    elsif coalesce(movement.metadata ->> 'movement_kind', '') = 'checkpoint_move' then
      previous_status := 'ready_to_move'::public.step_status;
      previous_state := 'Complete';
    elsif coalesce(movement.metadata ->> 'movement_kind', '') = 'anytime_return' then
      previous_status := 'ready_to_move'::public.step_status;
      previous_state := 'Complete';
    else
      previous_status := 'queued'::public.step_status;
      previous_state := 'Beginning';
    end if;
  end if;

  if source_step_id is null then
    raise exception using errcode = '55000', message = 'This die movement has no prior step to restore.';
  end if;
  select * into previous_execution
  from public.step_executions
  where assignment_id = assignment.id and process_step_id = source_step_id
  for update;
  if previous_execution.id is null then
    raise exception using errcode = '55000', message = 'The prior die step history is no longer available.';
  end if;

  insert into public.process_events (
    project_id, wafer_id, step_execution_id, actor_id, event_type, metadata, client_mutation_id
  ) values (
    wafer.project_id, wafer.id, current_execution.id, auth.uid(), 'wafer_history_undone',
    jsonb_build_object(
      'assignment_id', assignment.id,
      'undone_process_event_id', movement.id,
      'undone_decision_id', undone_decision_id,
      'from_step_id', assignment.current_step_id,
      'from_status', current_execution.status,
      'target_step_id', source_step_id,
      'target_status', previous_status,
      'target_phase', previous_state
    ), mutation_id
  ) returning * into undo_event;
  perform set_config('waferwatch.checkpoint_transition', 'history_undo:' || undo_event.id::text, true);

  update public.step_executions
  set status = 'pending', queue_started_at = null, started_at = null,
      completed_at = null, skipped_at = null, completed_by = null,
      operator_id = null, planned_end_at = null
  where id = current_execution.id;

  update public.step_executions
  set status = previous_status,
      queue_started_at = case when previous_status in ('queued', 'redo_required') then now() else queue_started_at end,
      started_at = case when previous_status = 'awaiting_checkpoint' then null else started_at end,
      completed_at = case when previous_status = 'awaiting_checkpoint' then null else completed_at end,
      completed_by = case when previous_status = 'awaiting_checkpoint' then null else completed_by end
  where id = previous_execution.id;
  update public.wafer_process_assignments
  set status = 'in_progress', current_step_id = source_step_id, completed_at = null
  where id = assignment.id;
  update public.wafers set status = 'in_progress' where id = wafer.id;

  return jsonb_build_object(
    'event_id', undo_event.id,
    'state', previous_status,
    'step_id', source_step_id,
    'undone_process_event_id', movement.id,
    'undone_decision_id', undone_decision_id
  );
end;
$$;

revoke execute on function public.undo_die_process_history_state(uuid, uuid, text, uuid)
  from public, anon;
grant execute on function public.undo_die_process_history_state(uuid, uuid, text, uuid)
  to authenticated;

comment on function public.undo_die_process_history_state(uuid, uuid, text, uuid) is
  'Moves one selected die to its immediately previous effective process state while keeping the source audit append-only.';

notify pgrst, 'reload schema';
