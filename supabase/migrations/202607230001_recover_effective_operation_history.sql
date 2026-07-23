-- Recover canonical operation history from preserved checkpoint/movement evidence.
-- Raw executions, attempts, decisions, and events remain append-only. Canonical
-- members that never occurred are retained but excluded from effective history.

alter table public.operation_run_members
  add column if not exists history_effective boolean not null default true,
  add column if not exists history_suppression_reason text;

alter table public.operation_run_members
  drop constraint if exists operation_run_members_history_suppression_reason_check;
alter table public.operation_run_members
  add constraint operation_run_members_history_suppression_reason_check check (
    history_effective
    or length(trim(coalesce(history_suppression_reason, ''))) > 0
  );

create index if not exists operation_run_members_effective_assignment_time_idx
  on public.operation_run_members (assignment_id, created_at, id)
  where history_effective;

-- User-scoped projections are security-invoker views, so this policy makes the
-- effective-history rule apply consistently to Status, Process Flow, Dashboard,
-- Calendar, and direct authenticated reads. Service-role diagnostics retain the
-- suppressed evidence for audit and recovery.
drop policy if exists operation_run_members_select on public.operation_run_members;
create policy operation_run_members_select
  on public.operation_run_members
  for select
  to authenticated
  using (history_effective and public.can_access_wafer(wafer_id));

create or replace function public.reject_append_only_checkpoint_history_mutation()
returns trigger
language plpgsql
as $$
begin
  if current_setting('waferwatch.history_recovery', true) = 'on' then
    return new;
  end if;
  raise exception using
    errcode = '55000',
    message = format('%I is append-only; corrections must be recorded as new history.', tg_table_name);
end;
$$;

create or replace function public.refresh_operation_run_history_state(target_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_count integer;
  active_count integer;
  rejected_count integer;
  failed_count integer;
  cancelled_count integer;
  first_started_at timestamptz;
  last_completed_at timestamptz;
  next_status text;
begin
  select
    count(*)::integer,
    count(*) filter (where member.status in ('queued', 'running', 'blocked', 'awaiting_review'))::integer,
    count(*) filter (where member.status in ('rejected', 'redo_required'))::integer,
    count(*) filter (where member.status = 'failed')::integer,
    count(*) filter (where member.status = 'cancelled')::integer,
    min(member.started_at),
    max(member.completed_at)
  into
    effective_count,
    active_count,
    rejected_count,
    failed_count,
    cancelled_count,
    first_started_at,
    last_completed_at
  from public.operation_run_members member
  where member.operation_run_id = target_run_id
    and member.history_effective;

  if effective_count = 0 then
    if exists (
      select 1 from public.operation_run_members member
      where member.operation_run_id = target_run_id
    ) then
      update public.operation_runs run
      set status = 'cancelled',
          completed_at = coalesce(run.completed_at, last_completed_at)
      where run.id = target_run_id;
    end if;
    return;
  end if;

  next_status := case
    when exists (
      select 1 from public.operation_run_members member
      where member.operation_run_id = target_run_id
        and member.history_effective
        and member.status = 'awaiting_review'
    ) then 'awaiting_review'
    when exists (
      select 1 from public.operation_run_members member
      where member.operation_run_id = target_run_id
        and member.history_effective
        and member.status = 'running'
    ) then 'running'
    when exists (
      select 1 from public.operation_run_members member
      where member.operation_run_id = target_run_id
        and member.history_effective
        and member.status = 'blocked'
    ) then 'blocked'
    when active_count > 0 then 'queued'
    when rejected_count > 0 then 'redo_required'
    when failed_count > 0 then 'failed'
    when cancelled_count = effective_count then 'cancelled'
    else 'completed'
  end;

  update public.operation_runs run
  set status = next_status,
      started_at = coalesce(first_started_at, run.started_at),
      completed_at = case
        when active_count > 0 then null
        else coalesce(last_completed_at, run.completed_at)
      end
  where run.id = target_run_id;
end;
$$;

revoke all on function public.refresh_operation_run_history_state(uuid)
  from public, anon, authenticated;

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

  select member.* into target_member
  from public.operation_run_members member
  join public.operation_runs run on run.id = member.operation_run_id
  where member.assignment_id = assignment.id
    and member.legacy_step_execution_id = execution.id
    and member.history_effective
    and run.process_step_id = execution.process_step_id
    and member.status in ('queued', 'running', 'blocked', 'awaiting_review')
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
    id, template_id, process_step_id, run_kind, status, started_at,
    created_by, client_mutation_id, created_at, updated_at
  ) values (
    target_run_id,
    assignment.template_id,
    execution.process_step_id,
    case when target_run_kind in ('normal', 'redo', 'rework', 'restore') then target_run_kind else 'normal' end,
    'queued',
    occurred_at,
    actor_id,
    target_mutation_id,
    coalesce(occurred_at, now()),
    coalesce(occurred_at, now())
  )
  on conflict (id) do update set
    status = case when operation_runs.status = 'cancelled' then 'queued' else operation_runs.status end,
    started_at = coalesce(operation_runs.started_at, excluded.started_at);

  insert into public.operation_run_members (
    id, operation_run_id, assignment_id, wafer_id, status, started_at,
    legacy_step_execution_id, created_at, updated_at,
    history_effective, history_suppression_reason
  ) values (
    target_member_id,
    target_run_id,
    assignment.id,
    execution.wafer_id,
    'queued',
    occurred_at,
    execution.id,
    coalesce(occurred_at, now()),
    coalesce(occurred_at, now()),
    true,
    null
  )
  on conflict (id) do update set
    status = case
      when operation_run_members.status = 'cancelled' then 'queued'
      else operation_run_members.status
    end,
    started_at = coalesce(operation_run_members.started_at, excluded.started_at),
    history_effective = true,
    history_suppression_reason = null
  returning * into target_member;

  if assignment.current_step_id = execution.process_step_id then
    update public.wafer_process_assignments current_assignment
    set current_operation_run_member_id = target_member.id
    where current_assignment.id = assignment.id;
  end if;

  return target_member;
end;
$$;

revoke all on function public.ensure_compatibility_history_member(uuid, uuid, timestamptz, text, uuid)
  from public, anon, authenticated;

create or replace function public.attach_checkpoint_attempt_to_effective_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member public.operation_run_members%rowtype;
begin
  if new.operation_run_member_id is not null then
    select member.* into target_member
    from public.operation_run_members member
    join public.operation_runs run on run.id = member.operation_run_id
    where member.id = new.operation_run_member_id
      and member.assignment_id = new.assignment_id
      and member.wafer_id = new.wafer_id
      and member.history_effective
      and run.process_step_id = new.process_step_id;
  end if;

  if target_member.id is null then
    select member.* into target_member
    from public.operation_run_members member
    join public.operation_runs run on run.id = member.operation_run_id
    join public.wafer_process_assignments assignment on assignment.id = member.assignment_id
    where member.assignment_id = new.assignment_id
      and member.wafer_id = new.wafer_id
      and member.legacy_step_execution_id = new.step_execution_id
      and member.history_effective
      and run.process_step_id = new.process_step_id
      and (
        member.status in ('queued', 'running', 'blocked', 'awaiting_review')
        or member.id = assignment.current_operation_run_member_id
      )
    order by
      (member.id = assignment.current_operation_run_member_id) desc,
      member.created_at desc,
      member.id desc
    limit 1;
  end if;

  if target_member.id is null then
    target_member := public.ensure_compatibility_history_member(
      new.step_execution_id,
      new.id,
      coalesce(new.started_at_snapshot, new.submitted_at),
      case when new.attempt_number > 1 then 'redo' else 'normal' end,
      new.submitted_by
    );
  end if;

  new.operation_run_member_id := target_member.id;
  return new;
end;
$$;

drop trigger if exists process_step_attempts_attach_effective_member
  on public.process_step_attempts;
create trigger process_step_attempts_attach_effective_member
  before insert on public.process_step_attempts
  for each row execute function public.attach_checkpoint_attempt_to_effective_member();

create or replace function public.project_checkpoint_attempt_into_operation_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_run_id uuid;
begin
  select member.operation_run_id into target_run_id
  from public.operation_run_members member
  where member.id = new.operation_run_member_id;
  if target_run_id is null then
    return new;
  end if;

  update public.operation_run_members member
  set status = 'awaiting_review',
      started_at = coalesce(member.started_at, new.started_at_snapshot, new.submitted_at),
      completed_at = null,
      history_effective = true,
      history_suppression_reason = null
  where member.id = new.operation_run_member_id;
  perform public.refresh_operation_run_history_state(target_run_id);
  return new;
end;
$$;

drop trigger if exists process_step_attempts_project_operation_history
  on public.process_step_attempts;
create trigger process_step_attempts_project_operation_history
  after insert on public.process_step_attempts
  for each row execute function public.project_checkpoint_attempt_into_operation_history();

create or replace function public.project_checkpoint_decision_into_operation_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member_id uuid;
  target_run_id uuid;
begin
  select attempt.operation_run_member_id
  into target_member_id
  from public.process_step_attempts attempt
  where attempt.id = new.attempt_id;
  select member.operation_run_id
  into target_run_id
  from public.operation_run_members member
  where member.id = target_member_id;
  if target_member_id is null or target_run_id is null then
    return new;
  end if;

  update public.operation_run_members member
  set status = case when new.decision = 'approved' then 'completed' else 'rejected' end,
      completed_at = new.decided_at,
      history_effective = true,
      history_suppression_reason = null
  where member.id = target_member_id;
  perform public.refresh_operation_run_history_state(target_run_id);
  return new;
end;
$$;

drop trigger if exists checkpoint_decisions_project_operation_history
  on public.checkpoint_decisions;
create trigger checkpoint_decisions_project_operation_history
  after insert on public.checkpoint_decisions
  for each row execute function public.project_checkpoint_decision_into_operation_history();

create or replace function public.link_process_event_to_effective_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  corrected_event public.process_events%rowtype;
  corrected_member_id uuid;
  target_attempt public.process_step_attempts%rowtype;
  target_member public.operation_run_members%rowtype;
  target_step_id uuid;
  target_assignment_id uuid;
  target_run_kind text := 'normal';
begin
  -- Process events remain directly insertable by project editors for
  -- compatibility. Bind every security-definer side effect to the event's own
  -- wafer/project and compare metadata ids as text so malformed input is inert.
  if not exists (
    select 1
    from public.wafers wafer
    where wafer.id = new.wafer_id
      and wafer.project_id = new.project_id
  ) then
    return new;
  end if;

  if nullif(new.metadata ->> 'corrected_event_id', '') is not null then
    select * into corrected_event
    from public.process_events event
    where event.id::text = new.metadata ->> 'corrected_event_id'
      and event.project_id = new.project_id
      and event.wafer_id = new.wafer_id;
    corrected_member_id := corrected_event.operation_run_member_id;
    if corrected_member_id is null and corrected_event.step_execution_id is not null then
      select member.id into corrected_member_id
      from public.operation_run_members member
      where member.legacy_step_execution_id = corrected_event.step_execution_id
        and member.wafer_id = new.wafer_id
        and member.history_effective
        and abs(extract(epoch from (
          coalesce(member.started_at, member.created_at) - corrected_event.event_at
        ))) < 1
      order by member.created_at, member.id
      limit 1;
    end if;
    if corrected_member_id is not null and not exists (
      select 1
      from public.process_step_attempts attempt
      where attempt.operation_run_member_id = corrected_member_id
    ) then
      update public.operation_run_members member
      set history_effective = false,
          history_suppression_reason = 'Superseded checkpoint route entry.',
          status = case
            when member.status in ('queued', 'running', 'blocked', 'awaiting_review') then 'cancelled'
            else member.status
          end,
          completed_at = case
            when member.status in ('queued', 'running', 'blocked', 'awaiting_review')
              then coalesce(member.completed_at, new.event_at)
            else member.completed_at
          end
      where member.id = corrected_member_id;
    end if;
  end if;

  if nullif(new.metadata ->> 'attempt_id', '') is not null then
    select * into target_attempt
    from public.process_step_attempts attempt
    where attempt.id::text = new.metadata ->> 'attempt_id'
      and attempt.wafer_id = new.wafer_id;
    if target_attempt.id is not null then
      select member.* into target_member
      from public.operation_run_members member
      join public.operation_runs run on run.id = member.operation_run_id
      where member.id = target_attempt.operation_run_member_id
        and member.assignment_id = target_attempt.assignment_id
        and member.wafer_id = new.wafer_id
        and member.history_effective
        and run.process_step_id = target_attempt.process_step_id;
    end if;
  end if;

  if target_member.id is null
     and new.event_type = 'checkpoint_step_entered'
     and new.step_execution_id is not null
     and exists (
       select 1
       from public.step_executions execution
       where execution.id = new.step_execution_id
         and execution.wafer_id = new.wafer_id
     )
     and current_setting('waferwatch.canonical_workflow_mutation', true) is distinct from 'on' then
    if target_attempt.id is not null and exists (
      select 1 from public.checkpoint_decisions decision
      where decision.attempt_id = target_attempt.id and decision.decision = 'redo'
    ) then
      target_run_kind := 'redo';
    end if;
    target_member := public.ensure_compatibility_history_member(
      new.step_execution_id,
      new.id,
      new.event_at,
      target_run_kind,
      new.actor_id
    );
  end if;

  if target_member.id is not null
     and (
       new.operation_run_id is distinct from target_member.operation_run_id
       or new.operation_run_member_id is distinct from target_member.id
     ) then
    update public.process_events event
    set operation_run_id = target_member.operation_run_id,
        operation_run_member_id = target_member.id
    where event.id = new.id;
  end if;

  if new.event_type = 'checkpoint_step_entered' then
    select step.id, assignment.id
    into target_step_id, target_assignment_id
    from public.wafer_process_assignments assignment
    join public.process_steps step
      on step.id::text = new.metadata ->> 'target_step_id'
     and step.template_id = assignment.template_id
    where assignment.id::text = new.metadata ->> 'assignment_id'
      and assignment.wafer_id = new.wafer_id;
    if target_member.id is not null and target_step_id is not null and target_assignment_id is not null then
      update public.wafer_process_assignments assignment
      set current_operation_run_member_id = target_member.id
      where assignment.id = target_assignment_id
        and assignment.current_step_id = target_step_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists process_events_link_effective_history
  on public.process_events;
create trigger process_events_link_effective_history
  after insert on public.process_events
  for each row execute function public.link_process_event_to_effective_history();

create or replace function public.repair_operation_history_from_evidence()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  missing_members_created integer := 0;
  merged_members_suppressed integer := 0;
  derived_visits_created integer := 0;
  placeholder_members_suppressed integer := 0;
  attempts_relinked integer := 0;
  events_relinked integer := 0;
  movement_events_relinked integer := 0;
  assignments_relinked integer := 0;
  evidence_relinked integer := 0;
begin
  perform set_config('waferwatch.history_recovery', 'on', true);

  drop table if exists pg_temp.ww_problem_attempts;
  drop table if exists pg_temp.ww_recovered_visits;

  create temporary table ww_problem_attempts (
    attempt_id uuid primary key,
    original_member_id uuid
  ) on commit drop;

  insert into ww_problem_attempts (attempt_id, original_member_id)
  select attempt.id, attempt.operation_run_member_id
  from public.process_step_attempts attempt
  left join public.operation_run_members member on member.id = attempt.operation_run_member_id
  left join public.operation_runs run on run.id = member.operation_run_id
  where attempt.operation_run_member_id is null
     or member.id is null
     or member.assignment_id <> attempt.assignment_id
     or member.wafer_id <> attempt.wafer_id
     or run.process_step_id <> attempt.process_step_id
     or (
       select count(*)
       from public.process_step_attempts sibling
       where sibling.operation_run_member_id = attempt.operation_run_member_id
     ) > 1;

  update public.operation_run_members member
  set history_effective = false,
      history_suppression_reason = 'Merged or cross-step checkpoint attempts were recovered as distinct operation visits.',
      status = case
        when member.status in ('queued', 'running', 'blocked', 'awaiting_review') then 'cancelled'
        else member.status
      end
  where member.id in (
    select distinct problem.original_member_id
    from ww_problem_attempts problem
    where problem.original_member_id is not null
  );
  get diagnostics merged_members_suppressed = row_count;

  -- Executions created by an older client after the canonical cutover can be
  -- missing a run/member entirely. Create a deterministic compatibility member
  -- before reconstructing attempts and current assignment links.
  insert into public.operation_runs (
    id, template_id, process_step_id, run_kind, status,
    started_at, completed_at, created_by, created_at, updated_at
  )
  select
    execution.id,
    assignment.template_id,
    execution.process_step_id,
    'normal',
    case execution.status::text
      when 'running' then 'running'
      when 'blocked' then 'blocked'
      when 'awaiting_checkpoint' then 'awaiting_review'
      when 'redo_required' then 'redo_required'
      when 'completed' then 'completed'
      when 'skipped' then 'completed'
      when 'failed' then 'failed'
      else 'queued'
    end,
    coalesce(execution.started_at, execution.queue_started_at),
    execution.completed_at,
    coalesce(execution.operator_id, execution.completed_by, assignment.assigned_by),
    execution.created_at,
    execution.updated_at
  from public.step_executions execution
  join public.wafer_process_assignments assignment on assignment.id = execution.assignment_id
  where not exists (
    select 1 from public.operation_runs run where run.id = execution.id
  )
  on conflict (id) do nothing;

  insert into public.operation_run_members (
    id, operation_run_id, assignment_id, wafer_id, status,
    started_at, completed_at, legacy_step_execution_id,
    created_at, updated_at, history_effective
  )
  select
    public.derived_mutation_uuid(execution.id, execution.assignment_id, 'history-recovery-member'),
    execution.id,
    execution.assignment_id,
    execution.wafer_id,
    case execution.status::text
      when 'running' then 'running'
      when 'blocked' then 'blocked'
      when 'awaiting_checkpoint' then 'awaiting_review'
      when 'redo_required' then 'redo_required'
      when 'completed' then 'completed'
      when 'skipped' then 'skipped'
      when 'failed' then 'failed'
      else 'queued'
    end,
    coalesce(execution.started_at, execution.queue_started_at),
    execution.completed_at,
    execution.id,
    execution.created_at,
    execution.updated_at,
    true
  from public.step_executions execution
  where exists (select 1 from public.operation_runs run where run.id = execution.id)
    and not exists (
      select 1
      from public.operation_run_members member
      where member.assignment_id = execution.assignment_id
        and member.legacy_step_execution_id = execution.id
    )
  on conflict (id) do nothing;
  get diagnostics missing_members_created = row_count;

  create temporary table ww_recovered_visits (
    attempt_id uuid primary key,
    operation_run_id uuid not null,
    operation_run_member_id uuid not null,
    assignment_id uuid not null,
    wafer_id uuid not null,
    process_step_id uuid not null,
    step_execution_id uuid not null,
    attempt_number integer not null,
    started_at timestamptz not null,
    completed_at timestamptz,
    member_status text not null,
    history_effective boolean not null
  ) on commit drop;

  -- Retain correct one-to-one canonical links.
  insert into ww_recovered_visits (
    attempt_id, operation_run_id, operation_run_member_id,
    assignment_id, wafer_id, process_step_id, step_execution_id,
    attempt_number, started_at, completed_at, member_status, history_effective
  )
  select
    attempt.id,
    member.operation_run_id,
    member.id,
    attempt.assignment_id,
    attempt.wafer_id,
    attempt.process_step_id,
    attempt.step_execution_id,
    attempt.attempt_number,
    coalesce(
      attempt.started_at_snapshot,
      execution.started_at,
      execution.queue_started_at,
      attempt.submitted_at
    ),
    coalesce(decision.decided_at, withdrawal.withdrawn_at),
    case
      when withdrawal.id is not null then 'cancelled'
      when decision.decision = 'approved' then 'completed'
      when decision.decision = 'redo' then 'rejected'
      else 'awaiting_review'
    end,
    not exists (
      select 1 from public.process_events undone
      where undone.event_type = 'wafer_history_undone'
        and undone.metadata ->> 'undone_attempt_id' = attempt.id::text
    )
  from public.process_step_attempts attempt
  join public.operation_run_members member on member.id = attempt.operation_run_member_id
  join public.operation_runs run on run.id = member.operation_run_id
  join public.step_executions execution on execution.id = attempt.step_execution_id
  left join public.checkpoint_decisions decision on decision.attempt_id = attempt.id
    and not exists (
      select 1 from public.process_events undone
      where undone.event_type = 'wafer_history_undone'
        and undone.metadata ->> 'undone_decision_id' = decision.id::text
    )
  left join public.checkpoint_submission_withdrawals withdrawal on withdrawal.attempt_id = attempt.id
  where not exists (
    select 1 from ww_problem_attempts problem where problem.attempt_id = attempt.id
  )
    and member.assignment_id = attempt.assignment_id
    and member.wafer_id = attempt.wafer_id
    and run.process_step_id = attempt.process_step_id;

  -- Every merged, missing, or cross-step attempt receives an immutable,
  -- deterministic run/member identity. Rerunning the repair is idempotent.
  insert into public.operation_runs (
    id, template_id, process_step_id, planned_operation_id, run_kind, status,
    started_at, completed_at, created_by, client_mutation_id,
    created_at, updated_at
  )
  select
    public.derived_mutation_uuid(attempt.id, attempt.step_execution_id, 'history-recovery-run'),
    attempt.template_id,
    attempt.process_step_id,
    original_run.planned_operation_id,
    case when attempt.attempt_number > 1 then 'redo' else 'normal' end,
    case
      when withdrawal.id is not null then 'cancelled'
      when decision.decision = 'approved' then 'completed'
      when decision.decision = 'redo' then 'redo_required'
      else 'awaiting_review'
    end,
    coalesce(
      attempt.started_at_snapshot,
      execution.started_at,
      execution.queue_started_at,
      attempt.submitted_at
    ),
    coalesce(decision.decided_at, withdrawal.withdrawn_at),
    coalesce(attempt.submitted_by, original_run.created_by),
    public.derived_mutation_uuid(attempt.id, attempt.step_execution_id, 'history-recovery-mutation'),
    coalesce(
      attempt.started_at_snapshot,
      execution.started_at,
      execution.queue_started_at,
      attempt.submitted_at
    ),
    coalesce(decision.decided_at, withdrawal.withdrawn_at, attempt.submitted_at)
  from ww_problem_attempts problem
  join public.process_step_attempts attempt on attempt.id = problem.attempt_id
  join public.step_executions execution on execution.id = attempt.step_execution_id
  left join public.operation_run_members original_member on original_member.id = problem.original_member_id
  left join public.operation_runs original_run on original_run.id = original_member.operation_run_id
  left join public.checkpoint_decisions decision on decision.attempt_id = attempt.id
    and not exists (
      select 1 from public.process_events undone
      where undone.event_type = 'wafer_history_undone'
        and undone.metadata ->> 'undone_decision_id' = decision.id::text
    )
  left join public.checkpoint_submission_withdrawals withdrawal on withdrawal.attempt_id = attempt.id
  on conflict (id) do update set
    status = excluded.status,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    updated_at = excluded.updated_at;

  insert into public.operation_run_members (
    id, operation_run_id, assignment_id, wafer_id, status,
    started_at, completed_at, legacy_step_execution_id,
    created_at, updated_at, history_effective, history_suppression_reason
  )
  select
    public.derived_mutation_uuid(attempt.id, attempt.assignment_id, 'history-recovery-member'),
    public.derived_mutation_uuid(attempt.id, attempt.step_execution_id, 'history-recovery-run'),
    attempt.assignment_id,
    attempt.wafer_id,
    case
      when withdrawal.id is not null then 'cancelled'
      when decision.decision = 'approved' then 'completed'
      when decision.decision = 'redo' then 'rejected'
      else 'awaiting_review'
    end,
    coalesce(
      attempt.started_at_snapshot,
      execution.started_at,
      execution.queue_started_at,
      attempt.submitted_at
    ),
    coalesce(decision.decided_at, withdrawal.withdrawn_at),
    attempt.step_execution_id,
    coalesce(
      attempt.started_at_snapshot,
      execution.started_at,
      execution.queue_started_at,
      attempt.submitted_at
    ),
    coalesce(decision.decided_at, withdrawal.withdrawn_at, attempt.submitted_at),
    not exists (
      select 1 from public.process_events undone
      where undone.event_type = 'wafer_history_undone'
        and undone.metadata ->> 'undone_attempt_id' = attempt.id::text
    ),
    case when exists (
      select 1 from public.process_events undone
      where undone.event_type = 'wafer_history_undone'
        and undone.metadata ->> 'undone_attempt_id' = attempt.id::text
    ) then 'Checkpoint attempt was superseded by an append-only undo event.' else null end
  from ww_problem_attempts problem
  join public.process_step_attempts attempt on attempt.id = problem.attempt_id
  join public.step_executions execution on execution.id = attempt.step_execution_id
  left join public.checkpoint_decisions decision on decision.attempt_id = attempt.id
    and not exists (
      select 1 from public.process_events undone
      where undone.event_type = 'wafer_history_undone'
        and undone.metadata ->> 'undone_decision_id' = decision.id::text
    )
  left join public.checkpoint_submission_withdrawals withdrawal on withdrawal.attempt_id = attempt.id
  on conflict (id) do update set
    status = excluded.status,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    history_effective = excluded.history_effective,
    history_suppression_reason = excluded.history_suppression_reason,
    updated_at = excluded.updated_at;
  get diagnostics derived_visits_created = row_count;

  insert into ww_recovered_visits (
    attempt_id, operation_run_id, operation_run_member_id,
    assignment_id, wafer_id, process_step_id, step_execution_id,
    attempt_number, started_at, completed_at, member_status, history_effective
  )
  select
    attempt.id,
    public.derived_mutation_uuid(attempt.id, attempt.step_execution_id, 'history-recovery-run'),
    public.derived_mutation_uuid(attempt.id, attempt.assignment_id, 'history-recovery-member'),
    attempt.assignment_id,
    attempt.wafer_id,
    attempt.process_step_id,
    attempt.step_execution_id,
    attempt.attempt_number,
    coalesce(
      attempt.started_at_snapshot,
      execution.started_at,
      execution.queue_started_at,
      attempt.submitted_at
    ),
    coalesce(decision.decided_at, withdrawal.withdrawn_at),
    case
      when withdrawal.id is not null then 'cancelled'
      when decision.decision = 'approved' then 'completed'
      when decision.decision = 'redo' then 'rejected'
      else 'awaiting_review'
    end,
    not exists (
      select 1 from public.process_events undone
      where undone.event_type = 'wafer_history_undone'
        and undone.metadata ->> 'undone_attempt_id' = attempt.id::text
    )
  from ww_problem_attempts problem
  join public.process_step_attempts attempt on attempt.id = problem.attempt_id
  join public.step_executions execution on execution.id = attempt.step_execution_id
  left join public.checkpoint_decisions decision on decision.attempt_id = attempt.id
    and not exists (
      select 1 from public.process_events undone
      where undone.event_type = 'wafer_history_undone'
        and undone.metadata ->> 'undone_decision_id' = decision.id::text
    )
  left join public.checkpoint_submission_withdrawals withdrawal on withdrawal.attempt_id = attempt.id;

  update public.operation_run_members member
  set status = visit.member_status,
      started_at = visit.started_at,
      completed_at = visit.completed_at,
      history_effective = visit.history_effective,
      history_suppression_reason = case
        when visit.history_effective then null
        else 'Checkpoint attempt was superseded by an append-only undo event.'
      end
  from ww_recovered_visits visit
  where member.id = visit.operation_run_member_id;

  update public.process_step_attempts attempt
  set operation_run_member_id = visit.operation_run_member_id
  from ww_recovered_visits visit
  where visit.attempt_id = attempt.id
    and attempt.operation_run_member_id is distinct from visit.operation_run_member_id;
  get diagnostics attempts_relinked = row_count;

  -- Evidence attached to a now-suppressed merged member follows the nearest
  -- reconstructed visit by recorded time.
  with parameter_targets as (
    select parameter.id, visit.operation_run_id, visit.operation_run_member_id
    from public.operation_run_parameter_records parameter
    join public.operation_run_members source_member on source_member.id = parameter.operation_run_member_id
    join lateral (
      select candidate.*
      from ww_recovered_visits candidate
      where candidate.assignment_id = source_member.assignment_id
        and candidate.step_execution_id = source_member.legacy_step_execution_id
        and candidate.history_effective
      order by
        (candidate.started_at <= parameter.recorded_at) desc,
        abs(extract(epoch from (candidate.started_at - parameter.recorded_at))),
        candidate.attempt_number
      limit 1
    ) visit on true
    where not source_member.history_effective
  )
  update public.operation_run_parameter_records parameter
  set operation_run_id = target.operation_run_id,
      operation_run_member_id = target.operation_run_member_id
  from parameter_targets target
  where parameter.id = target.id;
  get diagnostics evidence_relinked = row_count;

  with note_targets as (
    select note.id, visit.operation_run_id, visit.operation_run_member_id
    from public.operation_run_notes note
    join public.operation_run_members source_member on source_member.id = note.operation_run_member_id
    join lateral (
      select candidate.*
      from ww_recovered_visits candidate
      where candidate.assignment_id = source_member.assignment_id
        and candidate.step_execution_id = source_member.legacy_step_execution_id
        and candidate.history_effective
      order by
        (candidate.started_at <= note.created_at) desc,
        abs(extract(epoch from (candidate.started_at - note.created_at))),
        candidate.attempt_number
      limit 1
    ) visit on true
    where not source_member.history_effective
  )
  update public.operation_run_notes note
  set operation_run_id = target.operation_run_id,
      operation_run_member_id = target.operation_run_member_id
  from note_targets target
  where note.id = target.id;

  with resource_targets as (
    select resource.id, visit.operation_run_id, visit.operation_run_member_id
    from public.operation_run_resources resource
    join public.operation_run_members source_member on source_member.id = resource.operation_run_member_id
    join lateral (
      select candidate.*
      from ww_recovered_visits candidate
      where candidate.assignment_id = source_member.assignment_id
        and candidate.step_execution_id = source_member.legacy_step_execution_id
        and candidate.history_effective
      order by
        (candidate.started_at <= resource.recorded_at) desc,
        abs(extract(epoch from (candidate.started_at - resource.recorded_at))),
        candidate.attempt_number
      limit 1
    ) visit on true
    where not source_member.history_effective
  )
  update public.operation_run_resources resource
  set operation_run_id = target.operation_run_id,
      operation_run_member_id = target.operation_run_member_id
  from resource_targets target
  where resource.id = target.id;

  -- Recover exact entry/completion timestamps for legacy members that were not
  -- checkpoint attempts (for example Dicing and the current destination).
  with corrected_events as (
    select (event.metadata ->> 'corrected_event_id')::uuid as event_id
    from public.process_events event
    where nullif(event.metadata ->> 'corrected_event_id', '') is not null
  ),
  member_evidence as (
    select
      member.id,
      execution.status::text as execution_status,
      coalesce(
        member.started_at,
        execution.started_at,
        execution.queue_started_at,
        entry.event_at,
        case when execution.completed_at is not null then execution.created_at end
      ) as recovered_started_at,
      coalesce(member.completed_at, execution.completed_at) as recovered_completed_at,
      assignment.current_operation_run_member_id = member.id
        or (
          assignment.current_step_id = run.process_step_id
          and assignment.current_operation_run_member_id is null
        ) as is_current
    from public.operation_run_members member
    join public.operation_runs run on run.id = member.operation_run_id
    join public.step_executions execution on execution.id = member.legacy_step_execution_id
    join public.wafer_process_assignments assignment on assignment.id = member.assignment_id
    left join lateral (
      select event.event_at
      from public.process_events event
      where event.step_execution_id = execution.id
        and event.event_type = 'checkpoint_step_entered'
        and not exists (
          select 1 from corrected_events corrected where corrected.event_id = event.id
        )
      order by event.event_at desc, event.id desc
      limit 1
    ) entry on true
    where member.history_effective
      and not exists (
        select 1 from ww_recovered_visits visit
        where visit.operation_run_member_id = member.id
      )
  )
  update public.operation_run_members member
  set started_at = evidence.recovered_started_at,
      completed_at = evidence.recovered_completed_at,
      status = case
        when evidence.recovered_completed_at is not null then
          case when evidence.execution_status = 'skipped' then 'skipped' else 'completed' end
        when evidence.is_current then
          case evidence.execution_status
            when 'running' then 'running'
            when 'blocked' then 'blocked'
            when 'awaiting_checkpoint' then 'awaiting_review'
            when 'redo_required' then 'redo_required'
            else 'queued'
          end
        else member.status
      end
  from member_evidence evidence
  where member.id = evidence.id;

  -- A legacy member is not an occurrence when it has no active checkpoint,
  -- effective movement, start/completion time, or current-assignment identity.
  with corrected_events as (
    select (event.metadata ->> 'corrected_event_id')::uuid as event_id
    from public.process_events event
    where nullif(event.metadata ->> 'corrected_event_id', '') is not null
  )
  update public.operation_run_members member
  set history_effective = false,
      history_suppression_reason = 'Legacy placeholder has no start, completion, checkpoint, or effective movement evidence.',
      status = 'cancelled'
  from public.operation_runs run,
       public.step_executions execution,
       public.wafer_process_assignments assignment
  where run.id = member.operation_run_id
    and execution.id = member.legacy_step_execution_id
    and assignment.id = member.assignment_id
    and member.history_effective
    and member.started_at is null
    and member.completed_at is null
    and execution.started_at is null
    and execution.queue_started_at is null
    and execution.completed_at is null
    and assignment.current_operation_run_member_id is distinct from member.id
    and assignment.current_step_id is distinct from run.process_step_id
    and not exists (
      select 1 from public.process_step_attempts attempt
      where attempt.operation_run_member_id = member.id
    )
    and not exists (
      select 1
      from public.process_events event
      where event.step_execution_id = execution.id
        and event.event_type = 'checkpoint_step_entered'
        and not exists (
          select 1 from corrected_events corrected where corrected.event_id = event.id
        )
    );
  get diagnostics placeholder_members_suppressed = row_count;

  -- When an attempt was rebuilt into a derived visit, suppress any unclaimed
  -- compatibility member for the same execution to prevent duplicate history.
  update public.operation_run_members member
  set history_effective = false,
      history_suppression_reason = coalesce(
        member.history_suppression_reason,
        'Compatibility member was replaced by an evidence-backed checkpoint visit.'
      ),
      status = case
        when member.status in ('queued', 'running', 'blocked', 'awaiting_review') then 'cancelled'
        else member.status
      end
  where member.history_effective
    and member.legacy_step_execution_id in (
      select distinct visit.step_execution_id from ww_recovered_visits visit
    )
    and not exists (
      select 1 from ww_recovered_visits visit
      where visit.operation_run_member_id = member.id
    )
    and not exists (
      select 1 from public.process_step_attempts attempt
      where attempt.operation_run_member_id = member.id
    );

  -- Link checkpoint submission/decision events by immutable attempt id.
  with event_targets as (
    select event.id, visit.operation_run_id, visit.operation_run_member_id
    from public.process_events event
    join ww_recovered_visits visit
      on visit.attempt_id::text = event.metadata ->> 'attempt_id'
  )
  update public.process_events event
  set operation_run_id = target.operation_run_id,
      operation_run_member_id = target.operation_run_member_id
  from event_targets target
  where event.id = target.id
    and (
      event.operation_run_id is distinct from target.operation_run_id
      or event.operation_run_member_id is distinct from target.operation_run_member_id
    );
  get diagnostics events_relinked = row_count;

  -- Link effective movement entries to the exact visit start, or to the current
  -- member when the destination has not yet produced a checkpoint attempt.
  with corrected_events as (
    select (event.metadata ->> 'corrected_event_id')::uuid as event_id
    from public.process_events event
    where nullif(event.metadata ->> 'corrected_event_id', '') is not null
  ),
  entry_targets as (
    select
      event.id,
      coalesce(
        visit.operation_run_id,
        execution_member.operation_run_id,
        current_member.operation_run_id
      ) as operation_run_id,
      coalesce(
        visit.operation_run_member_id,
        execution_member.id,
        current_member.id
      ) as operation_run_member_id
    from public.process_events event
    left join lateral (
      select candidate.*
      from ww_recovered_visits candidate
      where candidate.assignment_id::text = event.metadata ->> 'assignment_id'
        and candidate.process_step_id::text = event.metadata ->> 'target_step_id'
        and candidate.history_effective
      order by
        abs(extract(epoch from (candidate.started_at - event.event_at))),
        candidate.attempt_number
      limit 1
    ) visit on abs(extract(epoch from (visit.started_at - event.event_at))) < 1
    left join lateral (
      select member.id, member.operation_run_id
      from public.operation_run_members member
      join public.operation_runs run on run.id = member.operation_run_id
      where member.legacy_step_execution_id = event.step_execution_id
        and member.history_effective
        and run.process_step_id::text = event.metadata ->> 'target_step_id'
      order by
        abs(extract(epoch from (
          coalesce(member.started_at, member.created_at) - event.event_at
        ))),
        member.id
      limit 1
    ) execution_member on true
    left join public.wafer_process_assignments assignment
      on assignment.id::text = event.metadata ->> 'assignment_id'
    left join public.operation_run_members current_member
      on current_member.id = assignment.current_operation_run_member_id
      and current_member.history_effective
    where event.event_type = 'checkpoint_step_entered'
      and not exists (
        select 1 from corrected_events corrected where corrected.event_id = event.id
      )
  )
  update public.process_events event
  set operation_run_id = target.operation_run_id,
      operation_run_member_id = target.operation_run_member_id
  from entry_targets target
  where event.id = target.id
    and target.operation_run_member_id is not null
    and (
      event.operation_run_id is distinct from target.operation_run_id
      or event.operation_run_member_id is distinct from target.operation_run_member_id
    );
  get diagnostics movement_events_relinked = row_count;
  events_relinked := events_relinked + movement_events_relinked;

  -- Current assignment identity must always point to an effective member for
  -- the same step. Prefer active/latest evidence.
  with current_targets as (
    select assignment.id as assignment_id, target.id as member_id
    from public.wafer_process_assignments assignment
    join lateral (
      select member.id
      from public.operation_run_members member
      join public.operation_runs run on run.id = member.operation_run_id
      where member.assignment_id = assignment.id
        and member.history_effective
        and run.process_step_id = assignment.current_step_id
      order by
        (member.status in ('queued', 'running', 'blocked', 'awaiting_review')) desc,
        coalesce(member.started_at, member.created_at) desc,
        member.id desc
      limit 1
    ) target on true
    where assignment.current_operation_run_member_id is distinct from target.id
  )
  update public.wafer_process_assignments assignment
  set current_operation_run_member_id = target.member_id
  from current_targets target
  where assignment.id = target.assignment_id;
  get diagnostics assignments_relinked = row_count;

  -- Reconstruct simple successor/redo lineage between recovered attempts.
  with ordered_visits as (
    select
      visit.*,
      lag(visit.operation_run_id) over (
        partition by visit.assignment_id
        order by visit.started_at, visit.attempt_number, visit.attempt_id
      ) as previous_run_id,
      lag(visit.process_step_id) over (
        partition by visit.assignment_id
        order by visit.started_at, visit.attempt_number, visit.attempt_id
      ) as previous_step_id
    from ww_recovered_visits visit
    where visit.history_effective
  )
  insert into public.operation_run_links (parent_run_id, child_run_id, link_kind)
  select distinct
    visit.previous_run_id,
    visit.operation_run_id,
    case
      when visit.attempt_number > 1 and visit.previous_step_id = visit.process_step_id then 'redo'
      else 'successor'
    end
  from ordered_visits visit
  where visit.previous_run_id is not null
    and visit.previous_run_id <> visit.operation_run_id
  on conflict do nothing;

  -- Aggregate run status/times after all member corrections.
  perform public.refresh_operation_run_history_state(run.id)
  from public.operation_runs run
  where exists (
    select 1 from public.operation_run_members member
    where member.operation_run_id = run.id
  );

  return jsonb_build_object(
    'missingMembersCreated', missing_members_created,
    'mergedMembersSuppressed', merged_members_suppressed,
    'derivedVisitsCreated', derived_visits_created,
    'placeholderMembersSuppressed', placeholder_members_suppressed,
    'attemptsRelinked', attempts_relinked,
    'eventsRelinked', events_relinked,
    'assignmentsRelinked', assignments_relinked,
    'evidenceRelinked', evidence_relinked
  );
end;
$$;

revoke all on function public.repair_operation_history_from_evidence()
  from public, anon, authenticated;
grant execute on function public.repair_operation_history_from_evidence()
  to service_role;

comment on function public.repair_operation_history_from_evidence() is
  'Idempotently recovers effective canonical operation visits and links from append-only checkpoint, movement, and execution evidence.';
comment on column public.operation_run_members.history_effective is
  'False retains superseded or never-happened canonical rows for audit while excluding them from authenticated history projections.';

select public.repair_operation_history_from_evidence();

notify pgrst, 'reload schema';
