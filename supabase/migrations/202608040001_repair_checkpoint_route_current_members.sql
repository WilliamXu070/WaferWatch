-- Keep the canonical operation visit aligned with the legacy execution created
-- by a checkpoint route correction. Prior visits and checkpoint evidence stay
-- append-only; a stale current pointer is repaired with a new linked visit.

create or replace function public.ensure_compatibility_history_member(
  target_step_execution_id uuid,
  identity_id uuid,
  occurred_at timestamptz,
  target_run_kind text,
  actor_id uuid
)
returns public.operation_run_members
language plpgsql
security definer
set search_path = public
as $$
declare
  execution public.step_executions%rowtype;
  assignment public.wafer_process_assignments%rowtype;
  target_member public.operation_run_members%rowtype;
  target_run_id uuid;
  target_member_id uuid;
  target_mutation_id uuid;
  canonical_member_status text;
  canonical_run_status text;
  effective_run_kind text;
begin
  select * into execution
  from public.step_executions candidate
  where candidate.id = target_step_execution_id;
  if execution.id is null then
    raise exception using errcode = 'P0002', message = 'The compatibility step execution does not exist.';
  end if;

  select * into assignment
  from public.wafer_process_assignments candidate
  where candidate.id = execution.assignment_id
  for update;
  if assignment.id is null then
    raise exception using errcode = 'P0002', message = 'The compatibility process assignment does not exist.';
  end if;

  canonical_member_status := case execution.status::text
    when 'running' then 'running'
    when 'blocked' then 'blocked'
    when 'awaiting_checkpoint' then 'awaiting_review'
    when 'ready_to_move' then 'completed'
    when 'redo_required' then 'redo_required'
    when 'completed' then 'completed'
    when 'skipped' then 'skipped'
    when 'failed' then 'failed'
    else 'queued'
  end;
  canonical_run_status := case canonical_member_status
    when 'skipped' then 'completed'
    else canonical_member_status
  end;
  effective_run_kind := case
    when canonical_member_status = 'redo_required' then 'redo'
    when target_run_kind in ('normal', 'redo', 'rework', 'restore') then target_run_kind
    else 'normal'
  end;

  select member.* into target_member
  from public.operation_run_members member
  join public.operation_runs run on run.id = member.operation_run_id
  where member.assignment_id = assignment.id
    and member.legacy_step_execution_id = execution.id
    and member.history_effective
    and run.process_step_id = execution.process_step_id
    and member.status = canonical_member_status
  order by
    (member.id = assignment.current_operation_run_member_id) desc,
    member.created_at desc,
    member.id desc
  limit 1;
  if target_member.id is not null then
    return target_member;
  end if;

  update public.operation_run_members prior
  set status = 'completed',
      completed_at = coalesce(prior.completed_at, occurred_at, now())
  where prior.assignment_id = assignment.id
    and prior.history_effective
    and prior.status in ('queued', 'running', 'blocked', 'awaiting_review');

  target_run_id := public.derived_mutation_uuid(identity_id, execution.id, 'compatibility-history-run');
  target_member_id := public.derived_mutation_uuid(identity_id, assignment.id, 'compatibility-history-member');
  target_mutation_id := public.derived_mutation_uuid(identity_id, execution.id, 'compatibility-history-mutation');

  insert into public.operation_runs (
    id, template_id, process_step_id, run_kind, status, started_at, completed_at,
    created_by, client_mutation_id, created_at, updated_at
  ) values (
    target_run_id,
    assignment.template_id,
    execution.process_step_id,
    effective_run_kind,
    canonical_run_status,
    execution.started_at,
    execution.completed_at,
    actor_id,
    target_mutation_id,
    coalesce(occurred_at, now()),
    coalesce(occurred_at, now())
  )
  on conflict (id) do update set
    run_kind = excluded.run_kind,
    status = excluded.status,
    started_at = coalesce(operation_runs.started_at, excluded.started_at),
    completed_at = excluded.completed_at;

  insert into public.operation_run_members (
    id, operation_run_id, assignment_id, wafer_id, status, started_at, completed_at,
    legacy_step_execution_id, created_at, updated_at,
    history_effective, history_suppression_reason
  ) values (
    target_member_id,
    target_run_id,
    assignment.id,
    execution.wafer_id,
    canonical_member_status,
    execution.started_at,
    execution.completed_at,
    execution.id,
    coalesce(occurred_at, now()),
    coalesce(occurred_at, now()),
    true,
    null
  )
  on conflict (id) do update set
    status = excluded.status,
    started_at = coalesce(operation_run_members.started_at, excluded.started_at),
    completed_at = excluded.completed_at,
    history_effective = true,
    history_suppression_reason = null
  returning * into target_member;

  if assignment.current_step_id = execution.process_step_id then
    update public.wafer_process_assignments current_assignment
    set current_operation_run_member_id = target_member.id
    where current_assignment.id = assignment.id;
  end if;

  perform public.refresh_operation_run_history_state(target_run_id);
  return target_member;
end;
$$;

revoke all on function public.ensure_compatibility_history_member(uuid, uuid, timestamptz, text, uuid)
  from public, anon, authenticated;

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
  canonical_member_status text;
  canonical_run_status text;
  effective_run_kind text;
  movement_is_redo boolean;
begin
  select * into execution from public.step_executions where id = target_step_execution_id;
  select * into assignment from public.wafer_process_assignments where id = execution.assignment_id for update;
  if execution.id is null or assignment.id is null then
    raise exception using errcode = 'P0002', message = 'The destination execution no longer exists.';
  end if;
  if target_run_kind not in ('normal', 'redo', 'rework', 'restore') then
    raise exception using errcode = '22023', message = 'The compatibility run kind is invalid.';
  end if;

  canonical_member_status := case execution.status::text
    when 'running' then 'running'
    when 'blocked' then 'blocked'
    when 'awaiting_checkpoint' then 'awaiting_review'
    when 'ready_to_move' then 'completed'
    when 'redo_required' then 'redo_required'
    when 'completed' then 'completed'
    when 'skipped' then 'skipped'
    when 'failed' then 'failed'
    else 'queued'
  end;
  canonical_run_status := case canonical_member_status
    when 'skipped' then 'completed'
    else canonical_member_status
  end;
  select exists (
    select 1
    from public.process_events event
    where event.client_mutation_id = movement_mutation_id
      and event.metadata ->> 'route_decision' = 'redo'
  ) into movement_is_redo;
  effective_run_kind := case
    when canonical_member_status = 'redo_required' or movement_is_redo then 'redo'
    else target_run_kind
  end;

  insert into public.process_batches (
    id, template_id, process_step_id, created_by, note, origin
  ) values (
    target_batch_id, assignment.template_id, execution.process_step_id,
    coalesce(auth.uid(), execution.operator_id, execution.completed_by, assignment.assigned_by),
    nullif(trim(target_note), ''),
    case when effective_run_kind = 'restore' then 'restore' else 'arrival' end
  )
  on conflict (id) do update set
    note = coalesce(process_batches.note, excluded.note);

  insert into public.operation_runs (
    id, template_id, process_step_id, run_kind, status, reason,
    created_by, legacy_batch_id, started_at, completed_at
  ) values (
    target_batch_id, assignment.template_id, execution.process_step_id,
    effective_run_kind, canonical_run_status,
    case when effective_run_kind in ('redo', 'rework', 'restore') then nullif(trim(target_note), '') else null end,
    coalesce(auth.uid(), execution.operator_id, execution.completed_by, assignment.assigned_by),
    target_batch_id, execution.started_at, execution.completed_at
  )
  on conflict (id) do update set
    run_kind = excluded.run_kind,
    status = excluded.status,
    reason = coalesce(operation_runs.reason, excluded.reason),
    started_at = coalesce(operation_runs.started_at, excluded.started_at),
    completed_at = excluded.completed_at;

  select * into target_run from public.operation_runs where id = target_batch_id for update;
  if target_run.template_id <> assignment.template_id
     or target_run.process_step_id <> execution.process_step_id then
    raise exception using errcode = '22023', message = 'The batch id already belongs to different process work.';
  end if;

  update public.operation_run_members prior
  set status = 'completed', completed_at = coalesce(prior.completed_at, now())
  where prior.assignment_id = assignment.id
    and prior.operation_run_id <> target_run.id
    and prior.history_effective
    and prior.status in ('queued', 'running', 'blocked', 'awaiting_review');

  insert into public.operation_run_members (
    operation_run_id, assignment_id, wafer_id, status, note,
    started_at, completed_at, legacy_step_execution_id
  ) values (
    target_run.id, assignment.id, execution.wafer_id, canonical_member_status,
    nullif(trim(target_note), ''), execution.started_at, execution.completed_at, execution.id
  )
  on conflict (operation_run_id, assignment_id) do update set
    legacy_step_execution_id = excluded.legacy_step_execution_id,
    note = coalesce(operation_run_members.note, excluded.note),
    status = excluded.status,
    started_at = coalesce(operation_run_members.started_at, excluded.started_at),
    completed_at = excluded.completed_at
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
      case effective_run_kind when 'redo' then 'redo' when 'restore' then 'restore' else 'successor' end
    ) on conflict do nothing;
    select legacy_batch_id into parent_legacy_batch_id
    from public.operation_runs where id = target_parent_run_id;
    if parent_legacy_batch_id is not null and parent_legacy_batch_id <> target_batch_id then
      insert into public.process_batch_links (parent_batch_id, child_batch_id, link_kind)
      values (
        parent_legacy_batch_id,
        target_batch_id,
        case effective_run_kind when 'restore' then 'restore' else 'successor' end
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
      case when effective_run_kind = 'redo' then 'redo' else 'general' end,
      trim(target_note),
      coalesce(auth.uid(), execution.operator_id, execution.completed_by, assignment.assigned_by)
    );
  end if;

  perform public.refresh_operation_run_history_state(target_run.id);
  return jsonb_build_object('runId', target_run.id, 'memberId', target_member.id);
end;
$$;

revoke all on function public.record_compatibility_operation_arrival(uuid, uuid, uuid, text, text, uuid)
  from public, anon, authenticated;

create or replace function public.repair_checkpoint_route_current_members()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  arrival jsonb;
  repaired_count integer := 0;
  repair_batch_id uuid;
begin
  perform set_config('waferwatch.history_recovery', 'on', true);

  for candidate in
    select
      assignment.id as assignment_id,
      assignment.current_operation_run_member_id,
      execution.id as execution_id,
      execution.status::text as execution_status,
      route_event.id as event_id,
      route_event.client_mutation_id,
      route_event.actor_id,
      route_event.event_at,
      route_event.notes,
      current_member.operation_run_id as parent_run_id,
      case execution.status::text
        when 'running' then 'running'
        when 'blocked' then 'blocked'
        when 'redo_required' then 'redo_required'
        else 'queued'
      end as expected_member_status,
      case
        when execution.status::text = 'redo_required'
          or route_event.metadata ->> 'route_decision' = 'redo'
          then 'redo'
        else 'normal'
      end as expected_run_kind
    from public.wafer_process_assignments assignment
    join public.step_executions execution
      on execution.assignment_id = assignment.id
     and execution.process_step_id = assignment.current_step_id
    join lateral (
      select event.*
      from public.process_events event
      where event.wafer_id = assignment.wafer_id
        and event.step_execution_id = execution.id
        and event.event_type = 'checkpoint_step_entered'
        and event.client_mutation_id is not null
        and event.metadata ->> 'assignment_id' = assignment.id::text
        and event.metadata ->> 'target_step_id' = assignment.current_step_id::text
        and event.metadata ->> 'movement_kind' = 'checkpoint_route_correction'
        and not exists (
          select 1
          from public.process_events superseding
          where superseding.metadata ->> 'corrected_event_id' = event.id::text
        )
      order by event.event_at desc, event.id desc
      limit 1
    ) route_event on true
    left join public.operation_run_members current_member
      on current_member.id = assignment.current_operation_run_member_id
    left join public.operation_runs current_run
      on current_run.id = current_member.operation_run_id
    where assignment.deleted_at is null
      and assignment.archived_at is null
      and assignment.status in ('planned', 'queued', 'in_progress', 'on_hold')
      and execution.status::text in ('queued', 'running', 'blocked', 'redo_required')
      and (
        current_member.id is null
        or not current_member.history_effective
        or current_member.legacy_step_execution_id is distinct from execution.id
        or current_run.process_step_id is distinct from assignment.current_step_id
        or current_member.status is distinct from case execution.status::text
          when 'running' then 'running'
          when 'blocked' then 'blocked'
          when 'redo_required' then 'redo_required'
          else 'queued'
        end
        or current_run.status is distinct from case execution.status::text
          when 'running' then 'running'
          when 'blocked' then 'blocked'
          when 'redo_required' then 'redo_required'
          else 'queued'
        end
        or current_run.run_kind is distinct from case
          when execution.status::text = 'redo_required'
            or route_event.metadata ->> 'route_decision' = 'redo'
            then 'redo'
          else 'normal'
        end
      )
    order by assignment.id
    for update of assignment
  loop
    repair_batch_id := public.derived_mutation_uuid(
      candidate.event_id,
      candidate.assignment_id,
      'checkpoint-route-current-state-repair'
    );
    arrival := public.record_compatibility_operation_arrival(
      repair_batch_id,
      candidate.execution_id,
      candidate.parent_run_id,
      candidate.expected_run_kind,
      candidate.notes,
      candidate.client_mutation_id
    );

    update public.operation_runs run
    set created_by = coalesce(run.created_by, candidate.actor_id),
        created_at = least(run.created_at, candidate.event_at)
    where run.id = (arrival ->> 'runId')::uuid;
    update public.operation_run_members member
    set created_at = least(member.created_at, candidate.event_at),
        updated_at = greatest(member.updated_at, candidate.event_at)
    where member.id = (arrival ->> 'memberId')::uuid;

    repaired_count := repaired_count + 1;
  end loop;

  return jsonb_build_object('repairedAssignments', repaired_count);
end;
$$;

revoke all on function public.repair_checkpoint_route_current_members()
  from public, anon, authenticated;
grant execute on function public.repair_checkpoint_route_current_members()
  to service_role;

select public.repair_checkpoint_route_current_members();

comment on function public.repair_checkpoint_route_current_members() is
  'Creates a linked canonical current visit when an active checkpoint-route correction disagrees with its legacy execution state.';

notify pgrst, 'reload schema';
