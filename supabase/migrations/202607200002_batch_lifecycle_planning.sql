-- A batch begins when work arrives at a step, before it is submitted for review.
-- Membership is append-only so retries, corrections, withdrawals, and loops keep
-- their original evidence rather than rewriting it.

create table if not exists public.process_batches (
  id uuid primary key,
  template_id uuid not null references public.process_templates(id) on delete restrict,
  process_step_id uuid not null references public.process_steps(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  note text null,
  origin text not null default 'arrival' check (origin in ('arrival', 'legacy_active', 'split', 'merge', 'restore'))
);

create table if not exists public.process_batch_members (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.process_batches(id) on delete restrict,
  assignment_id uuid not null references public.wafer_process_assignments(id) on delete restrict,
  wafer_id uuid not null references public.wafers(id) on delete restrict,
  process_step_id uuid not null references public.process_steps(id) on delete restrict,
  step_execution_id uuid not null references public.step_executions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (batch_id, step_execution_id)
);

create table if not exists public.process_batch_links (
  id uuid primary key default gen_random_uuid(),
  parent_batch_id uuid not null references public.process_batches(id) on delete restrict,
  child_batch_id uuid not null references public.process_batches(id) on delete restrict,
  link_kind text not null check (link_kind in ('successor', 'split', 'merge', 'restore')),
  created_at timestamptz not null default now(),
  unique (parent_batch_id, child_batch_id, link_kind),
  check (parent_batch_id <> child_batch_id)
);

alter table public.process_calendar_events
  add column if not exists batch_id uuid references public.process_batches(id) on delete set null;

create index if not exists process_batches_template_created_idx
  on public.process_batches (template_id, created_at desc);
create index if not exists process_batch_members_execution_idx
  on public.process_batch_members (step_execution_id, created_at desc);
create unique index if not exists process_batch_members_execution_unique_idx
  on public.process_batch_members (step_execution_id);
create index if not exists process_batch_members_batch_idx
  on public.process_batch_members (batch_id, created_at);
create index if not exists process_calendar_events_batch_idx
  on public.process_calendar_events (batch_id) where batch_id is not null;

-- Existing active work predates batch identities. Preserve it as explicit
-- singleton batches instead of guessing a group from nearby timestamps.
do $$
declare
  execution record;
  legacy_batch_id uuid;
begin
  for execution in
    select step_execution.id, step_execution.assignment_id, step_execution.wafer_id,
      step_execution.process_step_id, assignment.template_id, assignment.assigned_by,
      step_execution.created_at
    from public.step_executions step_execution
    join public.wafer_process_assignments assignment on assignment.id = step_execution.assignment_id
    where assignment.deleted_at is null
      and assignment.archived_at is null
      and assignment.current_step_id = step_execution.process_step_id
      and assignment.status in ('planned', 'queued', 'in_progress', 'on_hold')
      and step_execution.status in ('queued', 'running', 'blocked', 'redo_required')
      and not exists (
        select 1 from public.process_batch_members member
        where member.step_execution_id = step_execution.id
      )
  loop
    legacy_batch_id := gen_random_uuid();
    insert into public.process_batches (
      id, template_id, process_step_id, created_by, created_at, origin
    ) values (
      legacy_batch_id, execution.template_id, execution.process_step_id,
      execution.assigned_by, execution.created_at, 'legacy_active'
    );
    insert into public.process_batch_members (
      batch_id, assignment_id, wafer_id, process_step_id, step_execution_id, created_at
    ) values (
      legacy_batch_id, execution.assignment_id, execution.wafer_id,
      execution.process_step_id, execution.id, execution.created_at
    );
  end loop;
end;
$$;

alter table public.process_batches enable row level security;
alter table public.process_batch_members enable row level security;
alter table public.process_batch_links enable row level security;

drop policy if exists process_batches_select on public.process_batches;
create policy process_batches_select on public.process_batches for select to authenticated using (
  exists (
    select 1 from public.process_batch_members member
    where member.batch_id = process_batches.id
      and public.can_access_wafer(member.wafer_id)
  )
);

drop policy if exists process_batch_members_select on public.process_batch_members;
create policy process_batch_members_select on public.process_batch_members for select to authenticated using (
  public.can_access_wafer(wafer_id)
);

drop policy if exists process_batch_links_select on public.process_batch_links;
create policy process_batch_links_select on public.process_batch_links for select to authenticated using (
  exists (
    select 1 from public.process_batch_members member
    where member.batch_id in (process_batch_links.parent_batch_id, process_batch_links.child_batch_id)
      and public.can_access_wafer(member.wafer_id)
  )
);

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

  select * into execution from public.step_executions where id = target_step_execution_id;
  select * into assignment from public.wafer_process_assignments where id = execution.assignment_id;
  if execution.id is null or assignment.id is null then
    raise exception using errcode = 'P0002', message = 'The destination work no longer exists.';
  end if;
  if not public.can_edit_project((select project_id from public.wafers where id = execution.wafer_id)) then
    raise exception using errcode = '42501', message = 'You cannot plan this wafer batch.';
  end if;

  select member.batch_id into existing_member_batch_id
  from public.process_batch_members member
  where member.step_execution_id = execution.id
  order by member.created_at desc
  limit 1;
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

comment on table public.process_batches is 'Persistent planned batch identities; a destination arrival creates a successor batch.';
comment on table public.process_batch_members is 'Append-only batch membership; each process-step visit belongs to exactly one arrival batch.';
