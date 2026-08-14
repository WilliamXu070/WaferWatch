-- Redo means the destination step has performed evidence already. Process
-- order is presentation metadata and cannot determine whether work is a repeat.
-- Keep raw checkpoint evidence append-only while repairing the effective route
-- projection and the one evidence-free placeholder produced by the old rule.

create or replace function public.correct_checkpoint_route_assignment(
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
  mistaken_step public.process_steps%rowtype;
  checkpoint_step public.process_steps%rowtype;
  destination_step public.process_steps%rowtype;
  mistaken_execution public.step_executions%rowtype;
  destination_execution public.step_executions%rowtype;
  checkpoint_entry public.process_events%rowtype;
  existing_event public.process_events%rowtype;
  decision public.checkpoint_decisions%rowtype;
  checkpoint_step_id uuid;
  checkpoint_decision_id uuid;
  destination_status public.step_status;
  route_is_redo boolean;
  use_fallback boolean := false;
begin
  if auth.uid() is null or nullif(trim(notes), '') is null then
    raise exception using errcode = '22023', message = 'Authentication and a process note are required.';
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = auth.uid() and profile.is_active = true) then
    raise exception using errcode = '42501', message = 'An active account is required.';
  end if;

  select * into existing_event
  from public.process_events
  where client_mutation_id = mutation_id;
  if existing_event.id is not null then
    if existing_event.actor_id is distinct from auth.uid()
       or existing_event.metadata ->> 'assignment_id' is distinct from target_assignment_id::text
       or existing_event.metadata ->> 'target_step_id' is distinct from target_step_id::text
       or existing_event.metadata ->> 'corrected_event_id' is null then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different checkpoint correction.';
    end if;
    return jsonb_build_object(
      'event_id', existing_event.id,
      'step_execution_id', existing_event.step_execution_id,
      'already_corrected', true
    ) || existing_event.metadata;
  end if;

  select * into assignment
  from public.wafer_process_assignments
  where id = target_assignment_id
  for update;
  if assignment.id is null or assignment.current_step_id is null then
    raise exception using errcode = 'P0002', message = 'The process assignment is no longer available.';
  end if;

  select * into wafer from public.wafers where id = assignment.wafer_id for update;
  select * into mistaken_step from public.process_steps where id = assignment.current_step_id;
  select * into destination_step
  from public.process_steps
  where id = target_step_id
    and template_id = assignment.template_id
    and archived_at is null;
  select * into mistaken_execution
  from public.step_executions
  where assignment_id = assignment.id
    and process_step_id = mistaken_step.id
  for update;

  if wafer.id is null or destination_step.id is null or destination_step.id = mistaken_step.id then
    raise exception using errcode = '22023', message = 'Choose another active step from this process.';
  end if;
  if mistaken_step.execution_mode <> 'main' or destination_step.execution_mode <> 'main' then
    raise exception using errcode = '22023', message = 'Beginning checkpoint corrections apply between main process steps.';
  end if;
  if not public.can_edit_project(wafer.project_id) then
    raise exception using errcode = '42501', message = 'You cannot move this wafer.';
  end if;
  if mistaken_execution.id is null
     or mistaken_execution.status not in ('queued', 'running', 'blocked', 'redo_required') then
    raise exception using errcode = '55000', message = 'Only active Beginning work can correct its prior checkpoint destination.';
  end if;

  select event.* into checkpoint_entry
  from public.process_events event
  where event.wafer_id = wafer.id
    and event.event_type = 'checkpoint_step_entered'
    and event.metadata ->> 'assignment_id' = assignment.id::text
    and event.metadata ->> 'target_step_id' = mistaken_step.id::text
    and event.metadata ->> 'checkpoint_decision_id' is not null
    and event.metadata ->> 'from_step_id' is not null
    and not exists (
      select 1
      from public.process_events later_correction
      where later_correction.metadata ->> 'corrected_event_id' = event.id::text
    )
  order by event.event_at desc, event.id desc
  limit 1;

  if checkpoint_entry.id is null then
    use_fallback := true;
  else
    begin
      checkpoint_step_id := (checkpoint_entry.metadata ->> 'from_step_id')::uuid;
      checkpoint_decision_id := (checkpoint_entry.metadata ->> 'checkpoint_decision_id')::uuid;
    exception when invalid_text_representation then
      use_fallback := true;
    end;

    if not use_fallback then
      select * into checkpoint_step
      from public.process_steps
      where id = checkpoint_step_id
        and template_id = assignment.template_id;
      select checkpoint_decision.* into decision
      from public.checkpoint_decisions checkpoint_decision
      where checkpoint_decision.id = checkpoint_decision_id
        and checkpoint_decision.template_id = assignment.template_id
        and (
          checkpoint_decision.assignment_id = assignment.id
          or exists (
            select 1
            from public.wafers child
            join public.wafers parent on parent.id = checkpoint_decision.wafer_id
            where child.id = assignment.wafer_id
              and child.project_id = parent.project_id
              and child.metadata ->> 'parent_wafer_id' = parent.id::text
          )
        );

      if checkpoint_step.id is null or checkpoint_step.execution_mode <> 'main' or decision.id is null then
        use_fallback := true;
      end if;
    end if;
  end if;

  select exists (
    select 1
    from public.operation_run_members prior_member
    join public.operation_runs prior_run on prior_run.id = prior_member.operation_run_id
    where prior_member.assignment_id = assignment.id
      and prior_member.history_effective
      and prior_run.process_step_id = destination_step.id
      and (
        prior_member.completed_at is not null
        or exists (
          select 1
          from public.process_step_attempts prior_attempt
          where prior_attempt.operation_run_member_id = prior_member.id
            and prior_attempt.submitted_at <= now()
        )
      )
  ) into route_is_redo;
  destination_status := case
    when route_is_redo then 'redo_required'::public.step_status
    else 'queued'::public.step_status
  end;

  if use_fallback then
    checkpoint_step := mistaken_step;

    update public.step_executions
    set status = 'pending',
        queue_started_at = null,
        started_at = null,
        completed_at = null,
        skipped_at = null,
        completed_by = null,
        operator_id = null,
        planned_end_at = null
    where id = mistaken_execution.id;

    select * into destination_execution
    from public.step_executions
    where assignment_id = assignment.id
      and process_step_id = destination_step.id
    for update;
    if destination_execution.id is null then
      insert into public.step_executions (
        assignment_id, wafer_id, process_step_id, status, queue_started_at, metadata
      ) values (
        assignment.id, wafer.id, destination_step.id, destination_status, now(), '{}'::jsonb
      ) returning * into destination_execution;
    else
      update public.step_executions
      set status = destination_status,
          queue_started_at = now(),
          started_at = null,
          completed_at = null,
          skipped_at = null,
          completed_by = null,
          operator_id = null,
          planned_end_at = null
      where id = destination_execution.id
      returning * into destination_execution;
    end if;

    update public.wafer_process_assignments
    set status = 'in_progress',
        current_step_id = destination_step.id,
        completed_at = null,
        started_at = coalesce(started_at, now())
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
        'from_step_id', checkpoint_step.id,
        'from_step_name', checkpoint_step.name,
        'target_step_id', destination_step.id,
        'target_step_name', destination_step.name,
        'corrected_from_step_id', mistaken_step.id,
        'corrected_from_step_name', mistaken_step.name,
        'corrected_event_id', coalesce(checkpoint_entry.id, mistaken_execution.id),
        'movement_kind', 'checkpoint_route_correction',
        'route_decision', case when route_is_redo then 'redo' else 'approved' end
      ),
      mutation_id
    ) returning * into existing_event;

    return jsonb_build_object(
      'event_id', existing_event.id,
      'assignment_id', assignment.id,
      'step_execution_id', destination_execution.id,
      'target_step_id', destination_step.id,
      'route_decision', case when route_is_redo then 'redo' else 'approved' end
    );
  end if;

  perform set_config('waferwatch.checkpoint_transition', 'decision:' || decision.id::text, true);

  update public.step_executions
  set status = 'pending',
      queue_started_at = null,
      started_at = null,
      completed_at = null,
      skipped_at = null,
      completed_by = null,
      operator_id = null,
      planned_end_at = null
  where id = mistaken_execution.id;

  select * into destination_execution
  from public.step_executions
  where assignment_id = assignment.id
    and process_step_id = destination_step.id
  for update;
  if destination_execution.id is null then
    insert into public.step_executions (
      assignment_id, wafer_id, process_step_id, status, queue_started_at, metadata
    ) values (
      assignment.id, wafer.id, destination_step.id, destination_status, now(), '{}'::jsonb
    ) returning * into destination_execution;
  else
    update public.step_executions
    set status = destination_status,
        queue_started_at = now(),
        started_at = null,
        completed_at = null,
        skipped_at = null,
        completed_by = null,
        operator_id = null,
        planned_end_at = null
    where id = destination_execution.id
    returning * into destination_execution;
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
      'from_step_id', checkpoint_step.id,
      'from_step_name', checkpoint_step.name,
      'target_step_id', destination_step.id,
      'target_step_name', destination_step.name,
      'corrected_from_step_id', mistaken_step.id,
      'corrected_from_step_name', mistaken_step.name,
      'corrected_event_id', coalesce(checkpoint_entry.id, mistaken_execution.id),
      'movement_kind', 'checkpoint_route_correction',
      'route_decision', case when route_is_redo then 'redo' else 'approved' end
    ),
    mutation_id
  ) returning * into existing_event;

  return jsonb_build_object(
    'event_id', existing_event.id,
    'assignment_id', assignment.id,
    'step_execution_id', destination_execution.id,
    'target_step_id', destination_step.id,
    'corrected_event_id', coalesce(checkpoint_entry.id, mistaken_execution.id),
    'route_decision', case when route_is_redo then 'redo' else 'approved' end
  );
end;
$$;

revoke execute on function public.correct_checkpoint_route_assignment(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.correct_checkpoint_route_assignment(uuid, uuid, uuid, text)
  to authenticated;

comment on function public.correct_checkpoint_route_assignment(uuid, uuid, uuid, text) is
  'Replaces the active main-flow checkpoint destination and classifies redo only when the destination has prior performed evidence.';

-- Supersede only the latest effective route classification for a decision.
-- The original event and checkpoint decision remain immutable audit evidence.
with ranked_routes as (
  select
    event.*,
    row_number() over (
      partition by event.metadata ->> 'checkpoint_decision_id'
      order by event.event_at desc, event.id desc
    ) as route_rank,
    exists (
      select 1
      from public.operation_run_members prior_member
      join public.operation_runs prior_run on prior_run.id = prior_member.operation_run_id
      where prior_member.assignment_id = (event.metadata ->> 'assignment_id')::uuid
        and prior_member.history_effective
        and prior_run.process_step_id = (event.metadata ->> 'target_step_id')::uuid
        and (
          prior_member.completed_at <= event.event_at
          or exists (
            select 1
            from public.process_step_attempts prior_attempt
            where prior_attempt.operation_run_member_id = prior_member.id
              and prior_attempt.submitted_at <= event.event_at
          )
        )
    ) as destination_was_performed
  from public.process_events event
  where event.event_type = 'checkpoint_step_entered'
    and event.metadata ->> 'movement_kind' in (
      'checkpoint_route_auto_redo_correction',
      'checkpoint_route_correction'
    )
    and event.metadata ->> 'checkpoint_decision_id' is not null
    and coalesce(event.metadata ->> 'assignment_id', '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and coalesce(event.metadata ->> 'target_step_id', '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
), incorrect_routes as (
  select route.*
  from ranked_routes route
  where route.route_rank = 1
    and route.metadata ->> 'movement_kind' = 'checkpoint_route_correction'
    and route.metadata ->> 'route_decision' is distinct from case
      when route.destination_was_performed then 'redo'
      else 'approved'
    end
    and not exists (
      select 1
      from public.process_events prior_repair
      where prior_repair.metadata ->> 'history_repair_version' = '202608140003'
        and prior_repair.metadata ->> 'corrected_event_id' = route.id::text
    )
)
insert into public.process_events (
  project_id, wafer_id, step_execution_id, actor_id, event_type,
  event_at, notes, metadata, client_mutation_id
)
select
  route.project_id,
  route.wafer_id,
  route.step_execution_id,
  route.actor_id,
  'checkpoint_step_entered',
  now(),
  'Repaired checkpoint route classification from performed destination evidence.',
  route.metadata || jsonb_build_object(
    'corrected_event_id', route.id,
    'movement_kind', 'checkpoint_route_auto_redo_correction',
    'route_decision', case when route.destination_was_performed then 'redo' else 'approved' end,
    'correction_reason', 'destination_performance_evidence',
    'history_repair_version', '202608140003'
  ),
  gen_random_uuid()
from incorrect_routes route;

-- A false first-time redo could leave an empty normal wrapper followed by a
-- completed redo wrapper carrying attempt 1. Suppress only that empty effective
-- projection; keep the raw member, real attempt, operation run, and batches.
with false_first_time_redo_routes as (
  select event.*
  from public.process_events event
  where event.event_type = 'checkpoint_step_entered'
    and event.metadata ->> 'movement_kind' = 'checkpoint_route_correction'
    and event.metadata ->> 'route_decision' = 'redo'
    and coalesce(event.metadata ->> 'assignment_id', '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and coalesce(event.metadata ->> 'target_step_id', '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and not exists (
      select 1
      from public.operation_run_members prior_member
      join public.operation_runs prior_run on prior_run.id = prior_member.operation_run_id
      where prior_member.assignment_id = (event.metadata ->> 'assignment_id')::uuid
        and prior_member.history_effective
        and prior_run.process_step_id = (event.metadata ->> 'target_step_id')::uuid
        and (
          prior_member.completed_at <= event.event_at
          or exists (
            select 1
            from public.process_step_attempts prior_attempt
            where prior_attempt.operation_run_member_id = prior_member.id
              and prior_attempt.submitted_at <= event.event_at
          )
        )
    )
), superseded_empty_members as (
  select distinct empty_member.id
  from false_first_time_redo_routes route
  join public.operation_run_members empty_member
    on empty_member.assignment_id = (route.metadata ->> 'assignment_id')::uuid
   and empty_member.history_effective
   and empty_member.status = 'redo_required'
   and empty_member.completed_at is null
   and empty_member.started_at = route.event_at
  join public.operation_runs empty_run
    on empty_run.id = empty_member.operation_run_id
   and empty_run.process_step_id = (route.metadata ->> 'target_step_id')::uuid
   and empty_run.run_kind = 'normal'
  where not exists (
    select 1
    from public.process_step_attempts empty_attempt
    where empty_attempt.operation_run_member_id = empty_member.id
  )
    and exists (
      select 1
      from public.operation_run_members completed_member
      join public.operation_runs completed_run on completed_run.id = completed_member.operation_run_id
      join public.process_step_attempts completed_attempt
        on completed_attempt.operation_run_member_id = completed_member.id
       and completed_attempt.attempt_number = 1
      where completed_member.assignment_id = empty_member.assignment_id
        and completed_member.id <> empty_member.id
        and completed_member.history_effective
        and completed_member.completed_at is not null
        and completed_run.process_step_id = empty_run.process_step_id
        and completed_run.run_kind = 'redo'
    )
)
update public.operation_run_members member
set history_effective = false,
    history_suppression_reason = 'Superseded false-redo route entry has no completion or checkpoint evidence.'
where member.id in (select candidate.id from superseded_empty_members candidate);

notify pgrst, 'reload schema';
