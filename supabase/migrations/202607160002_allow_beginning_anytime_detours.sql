-- Anytime procedures are true detours: active Beginning-side work can enter
-- them without completing the interrupted main-flow checkpoint first.

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
          or decision.decision = 'redo'
          or decision.decision = 'approved'
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
  return false;
end;
$$;

create or replace function public.move_approved_checkpoint_assignment(
  target_assignment_id uuid,
  target_step_id uuid,
  mutation_id uuid,
  notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment public.wafer_process_assignments%rowtype;
  wafer public.wafers%rowtype;
  source_step public.process_steps%rowtype;
  destination_step public.process_steps%rowtype;
  source_execution public.step_executions%rowtype;
  destination_execution public.step_executions%rowtype;
  decision public.checkpoint_decisions%rowtype;
  existing_event public.process_events%rowtype;
  active_anytime_detour boolean := false;
begin
  if auth.uid() is null or nullif(trim(notes), '') is null then
    raise exception using errcode = '22023', message = 'Authentication and a process note are required.';
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = auth.uid() and profile.is_active = true) then
    raise exception using errcode = '42501', message = 'An active account is required.';
  end if;
  select * into existing_event from public.process_events where client_mutation_id = mutation_id;
  if existing_event.id is not null then
    if existing_event.actor_id is distinct from auth.uid()
       or existing_event.metadata ->> 'assignment_id' is distinct from target_assignment_id::text
       or existing_event.metadata ->> 'target_step_id' is distinct from target_step_id::text then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different step move.';
    end if;
    return jsonb_build_object('event_id', existing_event.id, 'already_moved', true)
      || existing_event.metadata;
  end if;

  select * into assignment from public.wafer_process_assignments where id = target_assignment_id for update;
  select * into wafer from public.wafers where id = assignment.wafer_id for update;
  select * into source_step from public.process_steps where id = assignment.current_step_id;
  select * into destination_step from public.process_steps
  where id = target_step_id and template_id = assignment.template_id and archived_at is null;
  select * into source_execution from public.step_executions
  where assignment_id = assignment.id and process_step_id = source_step.id for update;
  select checkpoint_decision.* into decision
  from public.checkpoint_decisions checkpoint_decision
  where checkpoint_decision.decision = 'approved'
    and checkpoint_decision.process_step_id = source_step.id
    and (
      (
        checkpoint_decision.assignment_id = assignment.id
        and checkpoint_decision.step_execution_id = source_execution.id
      )
      or (
        wafer.metadata ->> 'parent_wafer_id' = checkpoint_decision.wafer_id::text
      )
    )
  order by checkpoint_decision.decided_at desc, checkpoint_decision.created_at desc limit 1;

  if assignment.id is null or destination_step.id is null or destination_step.id = source_step.id then
    raise exception using errcode = '22023', message = 'Choose another active step from this process.';
  end if;
  if not public.can_edit_project(wafer.project_id) then
    raise exception using errcode = '42501', message = 'You cannot move this wafer.';
  end if;

  active_anytime_detour := source_step.execution_mode = 'main'
    and destination_step.execution_mode = 'anytime'
    and source_execution.status in ('queued', 'running', 'blocked', 'redo_required');

  if active_anytime_detour then
    select * into destination_execution from public.step_executions
    where assignment_id = assignment.id and process_step_id = destination_step.id for update;
    if destination_execution.id is null then
      insert into public.step_executions (
        assignment_id, wafer_id, process_step_id, status, queue_started_at, metadata
      ) values (
        assignment.id, wafer.id, destination_step.id, 'pending', null, '{}'::jsonb
      ) returning * into destination_execution;
    end if;

    insert into public.process_events (
      project_id, wafer_id, step_execution_id, actor_id, event_type,
      notes, metadata, client_mutation_id
    ) values (
      wafer.project_id, wafer.id, destination_execution.id, auth.uid(),
      'checkpoint_step_entered', trim(notes),
      jsonb_build_object(
        'assignment_id', assignment.id,
        'from_step_id', source_step.id,
        'from_step_name', source_step.name,
        'target_step_id', destination_step.id,
        'target_step_name', destination_step.name,
        'movement_kind', 'anytime_enter'
      ),
      mutation_id
    ) returning * into existing_event;

    perform set_config('waferwatch.checkpoint_transition', 'anytime:' || existing_event.id::text, true);
    update public.step_executions
    set status = 'pending'
    where id = source_execution.id;
    update public.wafer_process_assignments
    set status = 'in_progress', current_step_id = destination_step.id,
        completed_at = null, started_at = coalesce(started_at, now())
    where id = assignment.id;
    update public.step_executions
    set status = 'queued', queue_started_at = now(), started_at = null,
        completed_at = null, skipped_at = null, completed_by = null,
        operator_id = null, planned_end_at = null
    where id = destination_execution.id
    returning * into destination_execution;
    update public.wafers set status = 'in_progress' where id = wafer.id;

    return jsonb_build_object(
      'event_id', existing_event.id,
      'assignment_id', assignment.id,
      'step_execution_id', destination_execution.id,
      'target_step_id', destination_step.id,
      'anytime_return_step_id', source_step.id
    );
  end if;

  if source_execution.status <> 'ready_to_move' or decision.id is null then
    raise exception using errcode = '55000', message = 'This step must be approved before the wafer can move.';
  end if;

  perform set_config('waferwatch.checkpoint_transition', 'decision:' || decision.id::text, true);
  update public.step_executions set status = 'completed' where id = source_execution.id;

  select * into destination_execution from public.step_executions
  where assignment_id = assignment.id and process_step_id = destination_step.id for update;
  if destination_execution.id is null then
    insert into public.step_executions (
      assignment_id, wafer_id, process_step_id, status, queue_started_at, metadata
    ) values (
      assignment.id, wafer.id, destination_step.id, 'queued', now(), '{}'::jsonb
    ) returning * into destination_execution;
  else
    update public.step_executions
    set status = 'queued', queue_started_at = now(), started_at = null,
        completed_at = null, skipped_at = null, completed_by = null,
        operator_id = null, planned_end_at = null
    where id = destination_execution.id returning * into destination_execution;
  end if;

  update public.wafer_process_assignments
  set status = 'in_progress', current_step_id = destination_step.id,
      completed_at = null, started_at = coalesce(started_at, now())
  where id = assignment.id;
  update public.wafers set status = 'in_progress' where id = wafer.id;

  insert into public.process_events (
    project_id, wafer_id, step_execution_id, actor_id, event_type,
    notes, metadata, client_mutation_id
  ) values (
    wafer.project_id, wafer.id, destination_execution.id, auth.uid(),
    'checkpoint_step_entered', trim(notes),
    jsonb_build_object(
      'assignment_id', assignment.id,
      'checkpoint_decision_id', decision.id,
      'from_step_id', source_step.id,
      'from_step_name', source_step.name,
      'target_step_id', destination_step.id,
      'target_step_name', destination_step.name,
      'movement_kind', 'checkpoint_move'
    ),
    mutation_id
  ) returning * into existing_event;
  return jsonb_build_object(
    'event_id', existing_event.id,
    'assignment_id', assignment.id,
    'step_execution_id', destination_execution.id,
    'target_step_id', destination_step.id
  );
end;
$$;

revoke execute on function public.move_approved_checkpoint_assignment(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.move_approved_checkpoint_assignment(uuid, uuid, uuid, text)
  to authenticated;

create or replace function public.route_checkpoint_submission(
  target_attempt_id uuid,
  target_step_id uuid,
  decision_mutation_id uuid,
  movement_mutation_id uuid,
  notes text,
  child_specs jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.process_step_attempts%rowtype;
  source_step public.process_steps%rowtype;
  destination_step public.process_steps%rowtype;
  wafer public.wafers%rowtype;
  target_execution public.step_executions%rowtype;
  decision public.checkpoint_decisions%rowtype;
  existing_event public.process_events%rowtype;
  movement jsonb;
  child_movements jsonb := '[]'::jsonb;
  child_spec jsonb;
  child_wafer public.wafers%rowtype;
  child_assignment public.wafer_process_assignments%rowtype;
  child_movement_mutation_id uuid;
  route_is_redo boolean;
begin
  if auth.uid() is null or nullif(trim(notes), '') is null then
    raise exception using errcode = '22023', message = 'Authentication and a process note are required.';
  end if;

  select * into existing_event from public.process_events where client_mutation_id = movement_mutation_id;
  if existing_event.id is not null then
    if existing_event.actor_id is distinct from auth.uid()
       or existing_event.metadata ->> 'target_step_id' is distinct from target_step_id::text then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different reviewer route.';
    end if;
    return jsonb_build_object(
      'event_id', existing_event.id,
      'step_execution_id', existing_event.step_execution_id,
      'already_routed', true
    ) || existing_event.metadata;
  end if;

  select * into attempt from public.process_step_attempts where id = target_attempt_id for update;
  select * into source_step from public.process_steps where id = attempt.process_step_id;
  select * into destination_step from public.process_steps
  where id = target_step_id and template_id = attempt.template_id and archived_at is null;
  select * into wafer from public.wafers where id = attempt.wafer_id for update;

  if attempt.id is null then
    raise exception using errcode = 'P0002', message = 'The checkpoint submission no longer exists.';
  end if;
  if destination_step.id is null then
    raise exception using errcode = '22023', message = 'Choose an active destination from this process.';
  end if;

  route_is_redo := source_step.execution_mode = 'main'
    and destination_step.execution_mode = 'main'
    and destination_step.step_order <= source_step.step_order;
  if route_is_redo then
    select * into decision from public.review_step_checkpoint(
      attempt.id,
      'redo',
      decision_mutation_id,
      notes,
      destination_step.id
    );
    select * into target_execution from public.step_executions
    where assignment_id = attempt.assignment_id and process_step_id = destination_step.id;
    insert into public.process_events (
      project_id, wafer_id, step_execution_id, actor_id, event_type,
      notes, metadata, client_mutation_id
    ) values (
      wafer.project_id, wafer.id, target_execution.id, auth.uid(),
      'checkpoint_step_entered', trim(notes),
      jsonb_build_object(
        'assignment_id', attempt.assignment_id,
        'attempt_id', attempt.id,
        'checkpoint_decision_id', decision.id,
        'from_step_id', source_step.id,
        'from_step_name', source_step.name,
        'target_step_id', destination_step.id,
        'target_step_name', destination_step.name,
        'movement_kind', 'checkpoint_redo_route'
      ),
      movement_mutation_id
    ) returning * into existing_event;
    return jsonb_build_object(
      'event_id', existing_event.id,
      'decision_id', decision.id,
      'assignment_id', attempt.assignment_id,
      'step_execution_id', target_execution.id,
      'target_step_id', destination_step.id,
      'route_decision', 'redo'
    );
  end if;

  if public.checkpoint_step_is_dicing(source_step.name, source_step.slug, source_step.process_area) then
    select * into decision from public.review_dicing_step_checkpoint(
      attempt.id,
      decision_mutation_id,
      notes,
      child_specs
    );
    for child_spec in select value from jsonb_array_elements(child_specs)
    loop
      begin
        child_movement_mutation_id := (child_spec ->> 'movement_mutation_id')::uuid;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'Every dicing child route needs a valid movement mutation id.';
      end;
      if child_movement_mutation_id is null then
        raise exception using errcode = '22023', message = 'Every dicing child route needs a movement mutation id.';
      end if;
      select * into child_wafer from public.wafers child
      where child.project_id = wafer.project_id
        and child.wafer_code = trim(child_spec ->> 'wafer_code')
        and child.metadata ->> 'parent_wafer_id' = wafer.id::text;
      select * into child_assignment from public.wafer_process_assignments
      where wafer_id = child_wafer.id and template_id = attempt.template_id;
      movement := public.move_approved_checkpoint_assignment(
        child_assignment.id,
        destination_step.id,
        child_movement_mutation_id,
        notes
      );
      child_movements := child_movements || jsonb_build_array(movement);
    end loop;
    insert into public.process_events (
      project_id, wafer_id, step_execution_id, actor_id, event_type,
      notes, metadata, client_mutation_id
    ) values (
      wafer.project_id, wafer.id, decision.step_execution_id, auth.uid(),
      'checkpoint_dicing_children_routed', trim(notes),
      jsonb_build_object(
        'assignment_id', attempt.assignment_id,
        'attempt_id', attempt.id,
        'checkpoint_decision_id', decision.id,
        'from_step_id', source_step.id,
        'from_step_name', source_step.name,
        'target_step_id', destination_step.id,
        'target_step_name', destination_step.name,
        'movement_kind', 'checkpoint_dicing_route',
        'child_movements', child_movements
      ),
      movement_mutation_id
    ) returning * into existing_event;
    return jsonb_build_object(
      'event_id', existing_event.id,
      'decision_id', decision.id,
      'assignment_id', attempt.assignment_id,
      'step_execution_id', decision.step_execution_id,
      'target_step_id', destination_step.id,
      'route_decision', 'approved',
      'child_movements', child_movements
    );
  end if;

  select * into decision from public.review_step_checkpoint(
    attempt.id,
    'approved',
    decision_mutation_id,
    notes,
    null
  );
  movement := public.move_approved_checkpoint_assignment(
    attempt.assignment_id,
    destination_step.id,
    movement_mutation_id,
    notes
  );
  return movement || jsonb_build_object(
    'decision_id', decision.id,
    'route_decision', 'approved'
  );
end;
$$;

revoke execute on function public.route_checkpoint_submission(uuid, uuid, uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.route_checkpoint_submission(uuid, uuid, uuid, uuid, text, jsonb)
  to authenticated;

comment on function public.move_approved_checkpoint_assignment(uuid, uuid, uuid, text) is
  'Moves approved work normally, or suspends active main-flow work while it detours into an anytime procedure.';

notify pgrst, 'reload schema';
