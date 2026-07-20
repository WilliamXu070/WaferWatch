-- Keep one durable arrival batch per process-step visit and expose batch writes
-- only through the validated security-definer function.

do $$
begin
  if exists (
    select member.step_execution_id
    from public.process_batch_members member
    group by member.step_execution_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Batch membership hardening found a process-step visit in more than one batch.';
  end if;

  if exists (
    select 1
    from public.process_batch_members member
    join public.process_batches batch on batch.id = member.batch_id
    join public.step_executions execution on execution.id = member.step_execution_id
    join public.wafer_process_assignments assignment on assignment.id = execution.assignment_id
    where member.assignment_id <> execution.assignment_id
       or member.wafer_id <> execution.wafer_id
       or member.process_step_id <> execution.process_step_id
       or batch.template_id <> assignment.template_id
       or batch.process_step_id <> execution.process_step_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Batch membership hardening found a visit attached to the wrong batch.';
  end if;
end;
$$;

create unique index if not exists process_batch_members_execution_unique_idx
  on public.process_batch_members (step_execution_id);

revoke insert, update, delete on public.process_batches from public, anon, authenticated;
revoke insert, update, delete on public.process_batch_members from public, anon, authenticated;
revoke insert, update, delete on public.process_batch_links from public, anon, authenticated;
grant select on public.process_batches to authenticated;
grant select on public.process_batch_members to authenticated;
grant select on public.process_batch_links to authenticated;

create or replace function public.record_planned_batch_member(
  target_batch_id uuid,
  target_step_execution_id uuid,
  batch_note text default null,
  parent_batch_id uuid default null,
  planned_start_at timestamptz default null,
  planned_end_at timestamptz default null,
  planned_location text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  execution public.step_executions%rowtype;
  assignment public.wafer_process_assignments%rowtype;
  target_batch public.process_batches%rowtype;
  parent_batch public.process_batches%rowtype;
  existing_member_batch_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'An authenticated account is required.';
  end if;

  select * into execution
  from public.step_executions
  where id = target_step_execution_id
  for update;
  select * into assignment from public.wafer_process_assignments where id = execution.assignment_id;
  if execution.id is null or assignment.id is null then
    raise exception using errcode = 'P0002', message = 'The destination work no longer exists.';
  end if;
  if not public.can_edit_project((select project_id from public.wafers where id = execution.wafer_id)) then
    raise exception using errcode = '42501', message = 'You cannot plan this wafer batch.';
  end if;

  select member.batch_id into existing_member_batch_id
  from public.process_batch_members member
  where member.step_execution_id = execution.id;
  if existing_member_batch_id is not null then
    -- An idempotent movement retry must reuse the arrival batch already bound
    -- to this exact visit, even if a stale client generated another batch id.
    target_batch_id := existing_member_batch_id;
  end if;

  select * into target_batch
  from public.process_batches batch
  where batch.id = target_batch_id
  for update;
  if target_batch.id is not null and (
    target_batch.template_id <> assignment.template_id
    or target_batch.process_step_id <> execution.process_step_id
  ) then
    raise exception using errcode = '22023', message = 'This batch belongs to a different process step.';
  end if;

  insert into public.process_batches (id, template_id, process_step_id, created_by, note)
  values (target_batch_id, assignment.template_id, execution.process_step_id, auth.uid(), nullif(trim(batch_note), ''))
  on conflict (id) do update set note = coalesce(process_batches.note, excluded.note);

  insert into public.process_batch_members (
    batch_id, assignment_id, wafer_id, process_step_id, step_execution_id
  ) values (
    target_batch_id, assignment.id, execution.wafer_id, execution.process_step_id, execution.id
  ) on conflict (step_execution_id) do nothing;

  if parent_batch_id is not null and parent_batch_id <> target_batch_id then
    select * into parent_batch
    from public.process_batches batch
    where batch.id = parent_batch_id;
    if parent_batch.id is null
       or parent_batch.template_id <> assignment.template_id
       or not exists (
         select 1 from public.process_batch_members member
         where member.batch_id = parent_batch_id
           and member.assignment_id = assignment.id
       ) then
      raise exception using errcode = '22023', message = 'The predecessor batch no longer matches this process assignment.';
    end if;
    insert into public.process_batch_links (parent_batch_id, child_batch_id, link_kind)
    values (parent_batch_id, target_batch_id, 'successor')
    on conflict do nothing;
  end if;

  if planned_start_at is not null or planned_end_at is not null or planned_location is not null then
    if planned_start_at is null or planned_end_at is null or nullif(trim(planned_location), '') is null then
      raise exception using errcode = '22023', message = 'A planned batch schedule needs a start, end, and location.';
    end if;
    if planned_end_at <= planned_start_at then
      raise exception using errcode = '22023', message = 'A planned batch must end after it starts.';
    end if;
    insert into public.process_calendar_events (
      process_template_id, location, starts_at, ends_at, process_step_id,
      manual_action, description, created_by, batch_id
    ) select
      assignment.template_id, trim(planned_location), planned_start_at, planned_end_at,
      execution.process_step_id, null, 'Planned batch', auth.uid(), target_batch_id
    where not exists (
      select 1 from public.process_calendar_events event where event.batch_id = target_batch_id
    );
  end if;

  return target_batch_id;
end;
$$;

revoke all on function public.record_planned_batch_member(uuid, uuid, text, uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.record_planned_batch_member(uuid, uuid, text, uuid, timestamptz, timestamptz, text) to authenticated;

comment on table public.process_batch_members is 'Append-only batch membership; each process-step visit belongs to exactly one arrival batch.';
