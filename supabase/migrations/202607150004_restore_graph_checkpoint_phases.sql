-- Restore the editable process graph while retaining explicit checkpoint audit.
-- Approval marks a step ready to move; a later user drag chooses any destination.

alter type public.step_status add value if not exists 'ready_to_move';

-- Active process templates remain directly editable. Lifecycle columns stay for
-- compatibility, but they no longer gate graph editing or checkpoint submission.
drop trigger if exists process_templates_published_immutable on public.process_templates;
drop trigger if exists process_steps_draft_only_mutation on public.process_steps;
drop trigger if exists process_step_transitions_draft_only_mutation on public.process_step_transitions;
drop trigger if exists process_templates_validate_publish on public.process_templates;

alter table public.process_templates alter column lifecycle_status set default 'published';
update public.process_templates
set lifecycle_status = 'published',
    published_at = coalesce(published_at, now())
where lifecycle_status is distinct from 'published';

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

    if new.current_step_id is null
       or (not is_dicing_child and new.current_step_id is distinct from first_step_id) then
      raise exception using errcode = '55000', message = 'New assignments must begin at the first step.';
    end if;
    if new.status not in ('planned', 'queued', 'in_progress') or new.completed_at is not null then
      raise exception using errcode = '55000', message = 'New assignments cannot bypass checkpoint progression.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.assign_process_step_checkpoint_reviewer(
  target_step_id uuid,
  reviewer_id uuid
)
returns public.process_steps
language plpgsql
security definer
set search_path = public
as $$
declare
  step public.process_steps%rowtype;
  template public.process_templates%rowtype;
begin
  if auth.uid() is null or not public.can_manage_process_library() then
    raise exception using errcode = '42501', message = 'Process manager access is required.';
  end if;
  select * into step from public.process_steps where id = target_step_id for update;
  if step.id is null then
    raise exception using errcode = 'P0002', message = 'The process step no longer exists.';
  end if;
  select * into template from public.process_templates where id = step.template_id;
  if template.owner_project_id is not null and not public.can_edit_project(template.owner_project_id) then
    raise exception using errcode = '42501', message = 'You cannot configure this process.';
  end if;
  if reviewer_id is not null then
    if template.owner_project_id is not null
       and not public.checkpoint_reviewer_can_edit_project(reviewer_id, template.owner_project_id) then
      raise exception using errcode = '23514', message = 'The reviewer must be an active project editor.';
    end if;
    if template.owner_project_id is null and not exists (
      select 1 from public.profiles profile
      where profile.id = reviewer_id and profile.is_active = true and profile.role = 'admin'
    ) then
      raise exception using errcode = '23514', message = 'Shared processes require an active administrator reviewer.';
    end if;
  end if;
  update public.process_steps
  set required_reviewer_id = reviewer_id
  where id = step.id
  returning * into step;
  return step;
end;
$$;

revoke execute on function public.assign_process_step_checkpoint_reviewer(uuid, uuid)
  from public, anon;
grant execute on function public.assign_process_step_checkpoint_reviewer(uuid, uuid)
  to authenticated;

-- A dicing child begins on the completed side of the dicing step itself.
create or replace function public.checkpoint_dicing_child_is_authorized(
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
  transition_token text := current_setting('waferwatch.checkpoint_transition', true);
  decision_id uuid;
begin
  if transition_token is null or split_part(transition_token, ':', 1) <> 'decision' then
    return false;
  end if;
  begin
    decision_id := split_part(transition_token, ':', 2)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return exists (
    select 1
    from public.checkpoint_decisions decision
    join public.wafer_process_assignments parent_assignment on parent_assignment.id = decision.assignment_id
    join public.wafers parent_wafer on parent_wafer.id = parent_assignment.wafer_id
    join public.wafers child_wafer on child_wafer.id = checkpoint_dicing_child_is_authorized.target_wafer_id
    where decision.id = decision_id
      and decision.decision = 'approved'
      and decision.template_id = checkpoint_dicing_child_is_authorized.target_template_id
      and decision.process_step_id = checkpoint_dicing_child_is_authorized.target_step_id
      and parent_assignment.template_id = checkpoint_dicing_child_is_authorized.target_template_id
      and child_wafer.project_id = parent_wafer.project_id
      and child_wafer.metadata ->> 'parent_wafer_id' = parent_wafer.id::text
  );
end;
$$;

drop function if exists public.review_step_checkpoint(uuid, text, uuid, text);
create function public.review_step_checkpoint(
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
  if exists (select 1 from public.checkpoint_decisions prior where prior.attempt_id = attempt.id) then
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

revoke execute on function public.review_step_checkpoint(uuid, text, uuid, text, uuid)
  from public, anon;
grant execute on function public.review_step_checkpoint(uuid, text, uuid, text, uuid)
  to authenticated;

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
  return false;
end;
$$;

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
begin
  if tg_op = 'UPDATE' and (
    new.assignment_id is distinct from old.assignment_id
    or new.wafer_id is distinct from old.wafer_id
    or new.process_step_id is distinct from old.process_step_id
  ) then
    raise exception using errcode = '55000', message = 'Step execution identity is immutable.';
  end if;
  select * into assignment from public.wafer_process_assignments where id = new.assignment_id;
  select * into execution_step from public.process_steps where id = new.process_step_id;
  select * into current_step from public.process_steps where id = assignment.current_step_id;

  if tg_op = 'INSERT' then
    if new.wafer_id is distinct from assignment.wafer_id
       or execution_step.template_id is distinct from assignment.template_id then
      raise exception using errcode = '55000', message = 'Step executions must match their assignment and process.';
    end if;
    authorized := public.checkpoint_transition_is_authorized(assignment.id, new.id)
      or public.checkpoint_dicing_child_is_authorized(assignment.wafer_id, assignment.template_id, execution_step.id);
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
     and not public.checkpoint_transition_is_authorized(new.assignment_id, new.id) then
    raise exception using errcode = '55000', message = 'Only the current step can be worked before a checkpoint action.';
  end if;
  if new.status is distinct from old.status
     and (
       new.status in ('awaiting_checkpoint', 'ready_to_move', 'completed', 'redo_required')
       or old.status in ('awaiting_checkpoint', 'ready_to_move', 'completed')
     )
     and not public.checkpoint_transition_is_authorized(new.assignment_id, new.id) then
    raise exception using errcode = '55000', message = 'Protected status changes require an explicit checkpoint action.';
  end if;
  return new;
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
    return jsonb_build_object('event_id', existing_event.id, 'already_moved', true);
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
  where checkpoint_decision.assignment_id = assignment.id
    and checkpoint_decision.step_execution_id = source_execution.id
    and checkpoint_decision.decision = 'approved'
  order by checkpoint_decision.decided_at desc, checkpoint_decision.created_at desc limit 1;

  if assignment.id is null or destination_step.id is null or destination_step.id = source_step.id then
    raise exception using errcode = '22023', message = 'Choose another active step from this process.';
  end if;
  if not public.can_edit_project(wafer.project_id) then
    raise exception using errcode = '42501', message = 'You cannot move this wafer.';
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

-- Dicing creates child assignments on the completed side of the dicing step.
create or replace function public.reconcile_dicing_checkpoint_split(
  target_decision_id uuid,
  target_child_wafer_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  decision public.checkpoint_decisions%rowtype;
  parent_assignment public.wafer_process_assignments%rowtype;
  parent_wafer public.wafers%rowtype;
  source_step public.process_steps%rowtype;
  child_wafer public.wafers%rowtype;
  child_assignment public.wafer_process_assignments%rowtype;
  child_ids uuid[];
  child_id uuid;
  child_labels jsonb;
begin
  select coalesce(array_agg(candidate.child_id order by candidate.child_id), array[]::uuid[])
  into child_ids
  from (select distinct unnest(coalesce(target_child_wafer_ids, array[]::uuid[])) as child_id) candidate;
  if cardinality(child_ids) = 0
     or cardinality(child_ids) <> cardinality(coalesce(target_child_wafer_ids, array[]::uuid[])) then
    raise exception using errcode = '22023', message = 'Dicing requires a non-empty set of distinct child wafers.';
  end if;
  select * into decision from public.checkpoint_decisions where id = target_decision_id for share;
  select * into parent_assignment from public.wafer_process_assignments where id = decision.assignment_id for update;
  select * into parent_wafer from public.wafers where id = parent_assignment.wafer_id for update;
  select * into source_step from public.process_steps where id = decision.process_step_id;
  if decision.id is null or decision.decision <> 'approved'
     or not public.checkpoint_step_is_dicing(source_step.name, source_step.slug, source_step.process_area)
     or not public.can_edit_project(parent_wafer.project_id) then
    raise exception using errcode = '42501', message = 'This dicing split is not authorized.';
  end if;

  perform set_config('waferwatch.checkpoint_transition', 'decision:' || decision.id::text, true);
  foreach child_id in array child_ids loop
    select * into child_wafer from public.wafers where id = child_id for update;
    if child_wafer.id is null
       or child_wafer.project_id <> parent_wafer.project_id
       or child_wafer.metadata ->> 'parent_wafer_id' is distinct from parent_wafer.id::text then
      raise exception using errcode = '23514', message = 'Every child must belong to this dicing run.';
    end if;
    select * into child_assignment from public.wafer_process_assignments
    where wafer_id = child_wafer.id and template_id = parent_assignment.template_id for update;
    if child_assignment.id is null then
      insert into public.wafer_process_assignments (
        id, wafer_id, template_id, current_step_id, assigned_by,
        status, assigned_at, started_at, completed_at
      ) values (
        gen_random_uuid(), child_wafer.id, parent_assignment.template_id,
        source_step.id, auth.uid(), 'in_progress', now(), now(), null
      ) returning * into child_assignment;
    elsif child_assignment.current_step_id is distinct from source_step.id then
      raise exception using errcode = '40001', message = 'An existing child assignment is already at another step.';
    end if;
    insert into public.step_executions (
      assignment_id, wafer_id, process_step_id, status,
      queue_started_at, completed_at, completed_by, metadata
    ) values (
      child_assignment.id, child_wafer.id, source_step.id, 'ready_to_move',
      decision.decided_at, decision.decided_at, decision.decided_by, '{}'::jsonb
    ) on conflict (assignment_id, process_step_id) do update
      set status = 'ready_to_move', completed_at = excluded.completed_at,
          completed_by = excluded.completed_by;
    update public.wafers set status = 'in_progress' where id = child_wafer.id;
  end loop;

  select coalesce(jsonb_agg(child.metadata ->> 'current_die' order by child.id), '[]'::jsonb)
  into child_labels from public.wafers child where child.id = any(child_ids);
  update public.step_executions set status = 'completed' where id = decision.step_execution_id;
  update public.wafers
  set status = 'completed', metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'wafer_display_mode', 'undiced',
    'dicing_completed_at', decision.decided_at,
    'diced_child_wafer_ids', to_jsonb(child_ids),
    'diced_child_die_labels', child_labels
  ) where id = parent_wafer.id;
  update public.wafer_process_assignments
  set status = 'completed', completed_at = coalesce(completed_at, now())
  where id = parent_assignment.id;

  insert into public.process_events (
    project_id, wafer_id, step_execution_id, actor_id, event_type,
    event_at, notes, metadata, client_mutation_id
  ) values (
    parent_wafer.project_id, parent_wafer.id, decision.step_execution_id,
    auth.uid(), 'wafer_diced', decision.decided_at,
    format('Created %s die pieces from %s.', cardinality(child_ids), parent_wafer.wafer_code),
    jsonb_build_object(
      'assignment_id', parent_assignment.id,
      'checkpoint_decision_id', decision.id,
      'dicing_step_id', source_step.id,
      'child_wafer_ids', to_jsonb(child_ids),
      'die_labels', child_labels,
      'children_phase', 'complete'
    ),
    decision.id
  ) on conflict (client_mutation_id) do nothing;
  return jsonb_build_object(
    'assignment_id', parent_assignment.id,
    'parent_wafer_id', parent_wafer.id,
    'child_wafer_ids', to_jsonb(child_ids),
    'ready_step_id', source_step.id
  );
end;
$$;

revoke execute on function public.checkpoint_transition_is_authorized(uuid, uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
