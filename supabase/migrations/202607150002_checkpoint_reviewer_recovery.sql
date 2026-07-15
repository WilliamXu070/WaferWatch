-- Recover published checkpoints whose assigned reviewer can no longer act.
-- Published process structure remains immutable: only the required reviewer may
-- change, and only through the audited RPC below.

create table if not exists public.checkpoint_reviewer_reassignments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.process_templates(id) on delete restrict,
  process_step_id uuid not null references public.process_steps(id) on delete restrict,
  previous_reviewer_id uuid references public.profiles(id) on delete restrict,
  new_reviewer_id uuid not null references public.profiles(id) on delete restrict,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  transaction_id bigint not null default txid_current(),
  reason text not null,
  previous_reviewer_name_snapshot text not null,
  new_reviewer_name_snapshot text not null,
  changed_by_name_snapshot text not null,
  client_mutation_id uuid not null unique,
  changed_at timestamptz not null default now(),
  constraint checkpoint_reviewer_reassignments_reason_check
    check (nullif(trim(reason), '') is not null),
  constraint checkpoint_reviewer_reassignments_distinct_reviewers_check
    check (previous_reviewer_id is distinct from new_reviewer_id),
  constraint checkpoint_reviewer_reassignments_step_transaction_key
    unique (process_step_id, transaction_id)
);

create index if not exists checkpoint_reviewer_reassignments_template_time_idx
  on public.checkpoint_reviewer_reassignments (template_id, changed_at desc, id);

create index if not exists checkpoint_reviewer_reassignments_step_time_idx
  on public.checkpoint_reviewer_reassignments (process_step_id, changed_at desc, id);

drop trigger if exists checkpoint_reviewer_reassignments_append_only
  on public.checkpoint_reviewer_reassignments;
create trigger checkpoint_reviewer_reassignments_append_only
  before update or delete on public.checkpoint_reviewer_reassignments
  for each row execute function public.reject_append_only_checkpoint_history_mutation();

create or replace function public.checkpoint_reviewer_reassignment_is_authorized(
  target_step_id uuid,
  target_previous_reviewer_id uuid,
  target_replacement_reviewer_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  transition_token text := current_setting('waferwatch.checkpoint_reviewer_reassignment', true);
  reassignment_id uuid;
begin
  if transition_token is null
     or transition_token !~* '^reviewer-reassignment:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  begin
    reassignment_id := substring(
      transition_token
      from length('reviewer-reassignment:') + 1
    )::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.checkpoint_reviewer_reassignments history
    where history.id = reassignment_id
      and history.process_step_id = target_step_id
      and history.previous_reviewer_id is not distinct from target_previous_reviewer_id
      and history.new_reviewer_id = target_replacement_reviewer_id
      and history.changed_by = auth.uid()
      and history.transaction_id = txid_current()
  );
end;
$$;

create or replace function public.enforce_draft_process_structure()
returns trigger
language plpgsql
as $$
declare
  old_template_status text;
  new_template_status text;
  authorized_reviewer_recovery boolean := false;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select lifecycle_status
    into old_template_status
    from public.process_templates
    where id = old.template_id;

    if old_template_status is distinct from 'draft' then
      if tg_table_name = 'process_steps' and tg_op = 'UPDATE' then
        authorized_reviewer_recovery :=
          new.template_id is not distinct from old.template_id
          and new.required_reviewer_id is distinct from old.required_reviewer_id
          and (
            to_jsonb(new) - array['required_reviewer_id', 'updated_at', 'revision']::text[]
          ) is not distinct from (
            to_jsonb(old) - array['required_reviewer_id', 'updated_at', 'revision']::text[]
          )
          and public.checkpoint_reviewer_reassignment_is_authorized(
            old.id,
            old.required_reviewer_id,
            new.required_reviewer_id
          );
      end if;

      if not authorized_reviewer_recovery then
        raise exception using
          errcode = '55000',
          message = 'Published process versions are immutable. Use the audited reviewer recovery action when an assigned reviewer is unavailable.';
      end if;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select lifecycle_status
    into new_template_status
    from public.process_templates
    where id = new.template_id;

    if new_template_status is distinct from 'draft'
       and not authorized_reviewer_recovery then
      raise exception using
        errcode = '55000',
        message = 'Published process versions are immutable. Duplicate this version to create an editable draft.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists process_steps_draft_only_mutation on public.process_steps;
create trigger process_steps_draft_only_mutation
  before insert or update or delete on public.process_steps
  for each row execute function public.enforce_draft_process_structure();

create or replace function public.reassign_unavailable_checkpoint_reviewer(
  target_step_id uuid,
  replacement_reviewer_id uuid,
  mutation_id uuid,
  reason text
)
returns public.checkpoint_reviewer_reassignments
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_reassignment public.checkpoint_reviewer_reassignments%rowtype;
  reassignment public.checkpoint_reviewer_reassignments%rowtype;
  step public.process_steps%rowtype;
  template public.process_templates%rowtype;
  replacement_profile public.profiles%rowtype;
  previous_profile public.profiles%rowtype;
  impacted_project_ids uuid[] := array[]::uuid[];
  normalized_reason text := nullif(trim(reason), '');
  previous_reviewer_is_recoverable boolean := false;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if mutation_id is null then
    raise exception using errcode = '22023', message = 'A mutation id is required.';
  end if;
  if normalized_reason is null then
    raise exception using errcode = '22023', message = 'A reviewer reassignment reason is required.';
  end if;
  if not public.can_manage_process_library() then
    raise exception using
      errcode = '42501',
      message = 'Only an active admin or process engineer can recover a checkpoint reviewer.';
  end if;

  -- Serialize idempotent retries even if a malformed client reuses one mutation
  -- id across different process templates.
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));

  select *
  into existing_reassignment
  from public.checkpoint_reviewer_reassignments history
  where history.client_mutation_id = mutation_id;

  if existing_reassignment.id is not null then
    if existing_reassignment.process_step_id <> target_step_id
       or existing_reassignment.new_reviewer_id <> replacement_reviewer_id
       or existing_reassignment.changed_by <> auth.uid()
       or existing_reassignment.reason <> normalized_reason then
      raise exception using
        errcode = '22023',
        message = 'This mutation id belongs to a different reviewer reassignment.';
    end if;
  end if;

  select * into step
  from public.process_steps
  where id = target_step_id;

  if step.id is null then
    raise exception using errcode = 'P0002', message = 'The process step no longer exists.';
  end if;

  -- The update lock also serializes assignment inserts through their template
  -- foreign key, so a newly assigned project cannot escape the eligibility check.
  select * into template
  from public.process_templates
  where id = step.template_id
  for update;

  select * into step
  from public.process_steps
  where id = target_step_id
  for update;

  if template.id is null or template.lifecycle_status <> 'published' then
    raise exception using
      errcode = '55000',
      message = 'Reviewer recovery applies only to a published process step.';
  end if;

  select coalesce(
    array_agg(distinct wafer.project_id order by wafer.project_id),
    array[]::uuid[]
  )
  into impacted_project_ids
  from public.wafer_process_assignments assignment
  join public.wafers wafer on wafer.id = assignment.wafer_id
  where assignment.template_id = template.id
    and assignment.status <> 'completed';

  -- A project-owned version with no live assignments remains owned by that
  -- project. A shared unassigned version may be recovered by any process-library
  -- manager, as there is no project boundary to cross yet.
  if cardinality(impacted_project_ids) = 0
     and template.owner_project_id is not null then
    impacted_project_ids := array[template.owner_project_id];
  end if;

  if exists (
    select 1
    from unnest(impacted_project_ids) impacted_project_id
    where not public.can_edit_project(impacted_project_id)
  ) then
    raise exception using
      errcode = '42501',
      message = 'You must have edit access to every project using this active process version.';
  end if;

  -- Idempotent retries still pass the current role and project-access gates,
  -- but do not re-run the now-obsolete unavailable-reviewer precondition.
  if existing_reassignment.id is not null then
    return existing_reassignment;
  end if;

  select * into replacement_profile
  from public.profiles profile
  where profile.id = replacement_reviewer_id;

  if replacement_profile.id is null or replacement_profile.is_active is not true then
    raise exception using
      errcode = '23514',
      message = 'The replacement checkpoint reviewer must be an active user.';
  end if;

  if template.owner_project_id is null and replacement_profile.role <> 'admin' then
    raise exception using
      errcode = '23514',
      message = 'Shared process checkpoints require an active administrator reviewer.';
  end if;

  if exists (
    select 1
    from unnest(impacted_project_ids) impacted_project_id
    where not public.checkpoint_reviewer_can_edit_project(
      replacement_reviewer_id,
      impacted_project_id
    )
  ) then
    raise exception using
      errcode = '23514',
      message = 'The replacement checkpoint reviewer must be an eligible editor or admin for every impacted project.';
  end if;

  if step.required_reviewer_id is not null then
    select * into previous_profile
    from public.profiles profile
    where profile.id = step.required_reviewer_id;
  end if;

  previous_reviewer_is_recoverable :=
    step.required_reviewer_id is null
    or previous_profile.id is null
    or previous_profile.is_active is not true
    or (template.owner_project_id is null and previous_profile.role <> 'admin')
    or exists (
      select 1
      from unnest(impacted_project_ids) impacted_project_id
      where not public.checkpoint_reviewer_can_edit_project(
        step.required_reviewer_id,
        impacted_project_id
      )
    );

  if not previous_reviewer_is_recoverable then
    raise exception using
      errcode = '55000',
      message = 'The current checkpoint reviewer is still active and eligible. Duplicate the process version for ordinary reviewer changes.';
  end if;

  insert into public.checkpoint_reviewer_reassignments (
    template_id,
    process_step_id,
    previous_reviewer_id,
    new_reviewer_id,
    changed_by,
    reason,
    previous_reviewer_name_snapshot,
    new_reviewer_name_snapshot,
    changed_by_name_snapshot,
    client_mutation_id
  )
  values (
    template.id,
    step.id,
    step.required_reviewer_id,
    replacement_reviewer_id,
    auth.uid(),
    normalized_reason,
    coalesce(public.checkpoint_actor_name(step.required_reviewer_id), 'Unassigned'),
    coalesce(public.checkpoint_actor_name(replacement_reviewer_id), replacement_profile.email),
    coalesce(public.checkpoint_actor_name(auth.uid()), 'WaferWatch user'),
    mutation_id
  )
  returning * into reassignment;

  perform set_config(
    'waferwatch.checkpoint_reviewer_reassignment',
    'reviewer-reassignment:' || reassignment.id::text,
    true
  );

  update public.process_steps
  set required_reviewer_id = replacement_reviewer_id
  where id = step.id;

  return reassignment;
end;
$$;

-- Recreate the decision RPC so a recovered checkpoint is decided by the
-- current required reviewer. The original attempt snapshot remains immutable
-- evidence of who was assigned when work was submitted.
create or replace function public.review_step_checkpoint(
  target_attempt_id uuid,
  review_decision text,
  mutation_id uuid,
  notes text default null
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
  if review_decision not in ('approved', 'redo') then
    raise exception using errcode = '22023', message = 'Checkpoint decision must be approved or redo.';
  end if;
  if review_decision = 'redo' and nullif(trim(notes), '') is null then
    raise exception using errcode = '22023', message = 'A redo checkpoint decision requires a note.';
  end if;

  select * into existing_decision
  from public.checkpoint_decisions
  where client_mutation_id = mutation_id;
  if existing_decision.id is not null then
    if existing_decision.attempt_id <> target_attempt_id or existing_decision.decision <> review_decision then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different checkpoint decision.';
    end if;
    if existing_decision.decided_by is distinct from auth.uid()
       or not exists (
         select 1
         from public.wafers wafer_row
         join public.profiles profile on profile.id = auth.uid() and profile.is_active = true
         where wafer_row.id = existing_decision.wafer_id
           and public.can_edit_project(wafer_row.project_id)
       ) then
      raise exception using errcode = '42501', message = 'You no longer have access to this checkpoint decision.';
    end if;
    return existing_decision;
  end if;

  select * into attempt
  from public.process_step_attempts
  where id = target_attempt_id
  for update;

  select * into existing_decision
  from public.checkpoint_decisions
  where client_mutation_id = mutation_id;

  if existing_decision.id is not null then
    if existing_decision.attempt_id <> target_attempt_id or existing_decision.decision <> review_decision then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different checkpoint decision.';
    end if;
    if existing_decision.decided_by is distinct from auth.uid()
       or not exists (
         select 1
         from public.wafers wafer_row
         join public.profiles profile on profile.id = auth.uid() and profile.is_active = true
         where wafer_row.id = existing_decision.wafer_id
           and public.can_edit_project(wafer_row.project_id)
       ) then
      raise exception using errcode = '42501', message = 'You no longer have access to this checkpoint decision.';
    end if;
    return existing_decision;
  end if;

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
    raise exception using
      errcode = '55000',
      message = 'Dicing checkpoints must be approved through the atomic child handoff.';
  end if;

  if not public.can_edit_project(wafer.project_id) then
    raise exception using errcode = '42501', message = 'You do not have permission to review this checkpoint.';
  end if;
  if step.required_reviewer_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Only the current assigned checkpoint reviewer can decide this submission.';
  end if;
  if not public.checkpoint_reviewer_can_edit_project(auth.uid(), wafer.project_id) then
    raise exception using errcode = '42501', message = 'The assigned reviewer no longer has project edit access.';
  end if;
  if exists (select 1 from public.checkpoint_submission_withdrawals withdrawal where withdrawal.attempt_id = attempt.id) then
    raise exception using errcode = '55000', message = 'This checkpoint submission was withdrawn.';
  end if;
  if exists (select 1 from public.checkpoint_decisions prior where prior.attempt_id = attempt.id) then
    raise exception using errcode = '55000', message = 'This checkpoint submission was already decided.';
  end if;
  if execution.status <> 'awaiting_checkpoint'
     or assignment.current_step_id is distinct from step.id then
    raise exception using errcode = '40001', message = 'This wafer is no longer awaiting this checkpoint decision.';
  end if;

  if review_decision = 'approved' then
    select next_step.* into target_step
    from public.process_steps next_step
    where next_step.template_id = attempt.template_id
      and next_step.archived_at is null
      and next_step.step_order > step.step_order
    order by next_step.step_order, next_step.created_at, next_step.id
    limit 1;
    process_completed := target_step.id is null;
  else
    select prior_step.* into target_step
    from public.process_steps prior_step
    where prior_step.template_id = attempt.template_id
      and prior_step.archived_at is null
      and prior_step.step_order < step.step_order
    order by prior_step.step_order desc, prior_step.created_at desc, prior_step.id desc
    limit 1;
    if target_step.id is null then
      target_step := step;
    end if;
  end if;

  reviewer_name := coalesce(public.checkpoint_actor_name(auth.uid()), attempt.reviewer_name_snapshot);
  insert into public.checkpoint_decisions (
    attempt_id,
    assignment_id,
    wafer_id,
    template_id,
    process_step_id,
    step_execution_id,
    decision,
    decided_by,
    decision_notes,
    target_step_id,
    wafer_code_snapshot,
    process_step_name_snapshot,
    process_step_order_snapshot,
    target_step_name_snapshot,
    target_step_order_snapshot,
    decided_by_name_snapshot,
    client_mutation_id
  )
  values (
    attempt.id,
    attempt.assignment_id,
    attempt.wafer_id,
    attempt.template_id,
    attempt.process_step_id,
    attempt.step_execution_id,
    review_decision,
    auth.uid(),
    nullif(trim(notes), ''),
    target_step.id,
    attempt.wafer_code_snapshot,
    attempt.process_step_name_snapshot,
    attempt.process_step_order_snapshot,
    target_step.name,
    target_step.step_order,
    reviewer_name,
    mutation_id
  )
  returning * into decision_row;

  perform set_config('waferwatch.checkpoint_transition', 'decision:' || decision_row.id::text, true);

  if review_decision = 'approved' then
    update public.step_executions
    set status = 'completed',
        completed_at = now(),
        completed_by = auth.uid(),
        run_notes = coalesce(nullif(trim(notes), ''), run_notes)
    where id = execution.id;

    if process_completed then
      update public.wafer_process_assignments
      set status = 'completed',
          current_step_id = step.id,
          completed_at = now(),
          started_at = coalesce(started_at, now())
      where id = assignment.id;
      update public.wafers set status = 'completed' where id = wafer.id;
    else
      select * into target_execution
      from public.step_executions
      where assignment_id = assignment.id and process_step_id = target_step.id
      for update;

      if target_execution.id is null then
        insert into public.step_executions (
          assignment_id, wafer_id, process_step_id, status, queue_started_at, metadata
        ) values (
          assignment.id, wafer.id, target_step.id, 'queued', now(), '{}'::jsonb
        ) returning * into target_execution;
      else
        update public.step_executions
        set status = 'queued',
            queue_started_at = now(),
            started_at = null,
            completed_at = null,
            skipped_at = null,
            completed_by = null,
            operator_id = null,
            planned_end_at = null
        where id = target_execution.id
        returning * into target_execution;
      end if;

      update public.wafer_process_assignments
      set status = 'in_progress',
          current_step_id = target_step.id,
          completed_at = null,
          started_at = coalesce(started_at, now())
      where id = assignment.id;
      update public.wafers set status = 'in_progress' where id = wafer.id;
    end if;
  else
    update public.step_executions reset_execution
    set status = 'pending',
        queue_started_at = null,
        started_at = null,
        completed_at = null,
        skipped_at = null,
        completed_by = null,
        operator_id = null,
        planned_end_at = null
    where reset_execution.assignment_id = assignment.id
      and reset_execution.process_step_id in (
        select later_step.id
        from public.process_steps later_step
        where later_step.template_id = attempt.template_id
          and later_step.archived_at is null
          and later_step.step_order > target_step.step_order
      );

    select * into target_execution
    from public.step_executions
    where assignment_id = assignment.id and process_step_id = target_step.id
    for update;

    if target_execution.id is null then
      insert into public.step_executions (
        assignment_id, wafer_id, process_step_id, status, queue_started_at, metadata
      ) values (
        assignment.id, wafer.id, target_step.id, 'redo_required', now(), '{}'::jsonb
      ) returning * into target_execution;
    else
      update public.step_executions
      set status = 'redo_required',
          queue_started_at = now(),
          started_at = null,
          completed_at = null,
          skipped_at = null,
          completed_by = null,
          operator_id = null,
          planned_end_at = null,
          run_notes = coalesce(nullif(trim(notes), ''), run_notes)
      where id = target_execution.id
      returning * into target_execution;
    end if;

    update public.wafer_process_assignments
    set status = 'in_progress',
        current_step_id = target_step.id,
        completed_at = null,
        started_at = coalesce(started_at, now())
    where id = assignment.id;
    update public.wafers set status = 'in_progress' where id = wafer.id;
  end if;

  insert into public.process_events (
    project_id, wafer_id, step_execution_id, actor_id, event_type, notes, metadata, client_mutation_id
  )
  values (
    wafer.project_id,
    wafer.id,
    execution.id,
    auth.uid(),
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

alter table public.checkpoint_reviewer_reassignments enable row level security;

create or replace function public.can_view_checkpoint_reviewer_history(
  target_template_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.is_active = true
        and profile.role = 'admin'
    )
    or exists (
      select 1
      from public.process_templates template
      where template.id = target_template_id
        and template.owner_project_id is not null
        and public.can_access_project(template.owner_project_id)
    )
    or exists (
      select 1
      from public.wafer_process_assignments assignment
      join public.wafers wafer on wafer.id = assignment.wafer_id
      where assignment.template_id = target_template_id
        and public.can_access_project(wafer.project_id)
    )
    or (
      public.can_manage_process_library()
      and exists (
        select 1
        from public.process_templates template
        where template.id = target_template_id
          and template.owner_project_id is null
      )
      and not exists (
        select 1
        from public.wafer_process_assignments assignment
        where assignment.template_id = target_template_id
      )
    ),
    false
  )
$$;

drop policy if exists "accessible users can view checkpoint reviewer history"
  on public.checkpoint_reviewer_reassignments;
create policy "accessible users can view checkpoint reviewer history"
  on public.checkpoint_reviewer_reassignments for select
  using (
    auth.uid() is not null
    and public.can_view_checkpoint_reviewer_history(template_id)
  );

revoke all on public.checkpoint_reviewer_reassignments from public, anon, authenticated;
grant select on public.checkpoint_reviewer_reassignments to authenticated;

revoke execute on function public.reassign_unavailable_checkpoint_reviewer(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.reassign_unavailable_checkpoint_reviewer(uuid, uuid, uuid, text)
  to authenticated;

revoke execute on function public.review_step_checkpoint(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.review_step_checkpoint(uuid, text, uuid, text)
  to authenticated;

revoke execute on function public.checkpoint_reviewer_reassignment_is_authorized(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.can_view_checkpoint_reviewer_history(uuid)
  from public, anon;
grant execute on function public.can_view_checkpoint_reviewer_history(uuid)
  to authenticated;
revoke execute on function public.enforce_draft_process_structure()
  from public, anon, authenticated;

alter table public.checkpoint_reviewer_reassignments replica identity full;
