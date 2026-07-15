-- Sequential checkpoint workflow. Published process versions are immutable;
-- runtime movement is recorded as append-only attempts and decisions.

alter type public.step_status add value if not exists 'awaiting_checkpoint';
alter type public.step_status add value if not exists 'redo_required';

alter table public.process_templates
  add column if not exists lifecycle_status text,
  add column if not exists source_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.profiles(id) on delete set null;

update public.process_templates
set lifecycle_status = 'published',
    published_at = coalesce(published_at, updated_at, created_at),
    published_by = coalesce(published_by, created_by)
where lifecycle_status is null;

alter table public.process_templates
  alter column lifecycle_status set default 'draft',
  alter column lifecycle_status set not null;

alter table public.process_templates
  drop constraint if exists process_templates_lifecycle_status_check;

alter table public.process_templates
  add constraint process_templates_lifecycle_status_check
  check (lifecycle_status in ('draft', 'published'));

alter table public.process_steps
  add column if not exists required_reviewer_id uuid references public.profiles(id) on delete restrict,
  add column if not exists archived_at timestamptz;

-- The collaboration migration populated only queued/running/blocked rows.
-- Deterministically repair every remaining null projection, including planned
-- work, failed work, the new checkpoint states, and the final completed step.
update public.wafer_process_assignments assignment
set current_step_id = (
  select execution.process_step_id
  from public.step_executions execution
  join public.process_steps step on step.id = execution.process_step_id
  where execution.assignment_id = assignment.id
  order by
    case
      when assignment.status = 'completed' then
        case execution.status::text
          when 'completed' then 0
          when 'skipped' then 1
          else 9
        end
      else
        case execution.status::text
          when 'awaiting_checkpoint' then 0
          when 'redo_required' then 1
          when 'running' then 2
          when 'blocked' then 3
          when 'failed' then 4
          when 'queued' then 5
          when 'pending' then 6
          when 'completed' then 7
          when 'skipped' then 8
          else 9
        end
    end,
    case when assignment.status = 'completed' then step.step_order end desc nulls last,
    case when assignment.status <> 'completed' then step.step_order end asc nulls last,
    execution.updated_at desc,
    execution.created_at desc,
    execution.id
  limit 1
)
where assignment.current_step_id is null
  and exists (
    select 1
    from public.step_executions execution
    where execution.assignment_id = assignment.id
  );

alter table public.process_steps
  drop constraint if exists process_steps_template_id_step_order_key;

create unique index if not exists process_steps_active_template_order_idx
  on public.process_steps (template_id, step_order)
  where archived_at is null;

create index if not exists process_steps_template_active_order_idx
  on public.process_steps (template_id, step_order, id)
  where archived_at is null;

create index if not exists process_steps_required_reviewer_idx
  on public.process_steps (required_reviewer_id)
  where archived_at is null and required_reviewer_id is not null;

-- Existing versions are published above. Give their steps the safest available
-- reviewer without inventing access: project owner, project editor, then the
  -- an active admin for a shared template. Rows with no eligible active profile stay null
-- and the checkpoint RPC rejects submission with an explicit reviewer error.
update public.process_steps step
set required_reviewer_id = coalesce(
  (
    select project.owner_id
    from public.projects project
    join public.profiles owner_profile on owner_profile.id = project.owner_id
    where project.id = template.owner_project_id
      and owner_profile.is_active = true
    limit 1
  ),
  (
    select member.user_id
    from public.project_members member
    join public.profiles member_profile on member_profile.id = member.user_id
    where member.project_id = template.owner_project_id
      and member.role in ('owner', 'editor')
      and member_profile.is_active = true
    order by case member.role when 'owner' then 0 else 1 end, member.created_at, member.user_id
    limit 1
  ),
  (
    select creator.id
    from public.profiles creator
    where creator.id = template.created_by
      and template.owner_project_id is null
      and creator.is_active = true
      and creator.role = 'admin'
    limit 1
  ),
  (
    select admin_profile.id
    from public.profiles admin_profile
    where template.owner_project_id is null
      and admin_profile.is_active = true
      and admin_profile.role = 'admin'
    order by admin_profile.id
    limit 1
  )
)
from public.process_templates template
where template.id = step.template_id
  and template.lifecycle_status = 'published'
  and step.required_reviewer_id is null;

create table if not exists public.process_step_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.wafer_process_assignments(id) on delete restrict,
  wafer_id uuid not null references public.wafers(id) on delete restrict,
  template_id uuid not null references public.process_templates(id) on delete restrict,
  process_step_id uuid not null references public.process_steps(id) on delete restrict,
  step_execution_id uuid not null references public.step_executions(id) on delete restrict,
  attempt_number integer not null,
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz not null default now(),
  started_at_snapshot timestamptz,
  submission_notes text,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  wafer_code_snapshot text not null,
  template_name_snapshot text not null,
  template_version_snapshot text not null,
  process_step_name_snapshot text not null,
  process_step_order_snapshot integer not null,
  reviewer_id_snapshot uuid references public.profiles(id) on delete set null,
  reviewer_name_snapshot text not null,
  submitted_by_name_snapshot text not null,
  prior_step_status public.step_status not null,
  client_mutation_id uuid not null unique,
  created_at timestamptz not null default now(),
  unique (assignment_id, process_step_id, attempt_number),
  constraint process_step_attempts_number_positive check (attempt_number > 0)
);

create table if not exists public.checkpoint_decisions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.process_step_attempts(id) on delete restrict,
  assignment_id uuid not null references public.wafer_process_assignments(id) on delete restrict,
  wafer_id uuid not null references public.wafers(id) on delete restrict,
  template_id uuid not null references public.process_templates(id) on delete restrict,
  process_step_id uuid not null references public.process_steps(id) on delete restrict,
  step_execution_id uuid not null references public.step_executions(id) on delete restrict,
  decision text not null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz not null default now(),
  decision_notes text,
  target_step_id uuid references public.process_steps(id) on delete restrict,
  wafer_code_snapshot text not null,
  process_step_name_snapshot text not null,
  process_step_order_snapshot integer not null,
  target_step_name_snapshot text,
  target_step_order_snapshot integer,
  decided_by_name_snapshot text not null,
  client_mutation_id uuid not null unique,
  created_at timestamptz not null default now(),
  constraint checkpoint_decisions_value_check check (decision in ('approved', 'redo'))
);

create table if not exists public.checkpoint_submission_withdrawals (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.process_step_attempts(id) on delete restrict,
  assignment_id uuid not null references public.wafer_process_assignments(id) on delete restrict,
  wafer_id uuid not null references public.wafers(id) on delete restrict,
  template_id uuid not null references public.process_templates(id) on delete restrict,
  process_step_id uuid not null references public.process_steps(id) on delete restrict,
  step_execution_id uuid not null references public.step_executions(id) on delete restrict,
  withdrawn_by uuid references public.profiles(id) on delete set null,
  withdrawn_at timestamptz not null default now(),
  withdrawal_reason text,
  wafer_code_snapshot text not null,
  process_step_name_snapshot text not null,
  withdrawn_by_name_snapshot text not null,
  client_mutation_id uuid not null unique,
  created_at timestamptz not null default now()
);

create index if not exists process_step_attempts_assignment_step_idx
  on public.process_step_attempts (assignment_id, process_step_id, attempt_number desc);

create index if not exists process_step_attempts_reviewer_queue_idx
  on public.process_step_attempts (reviewer_id_snapshot, submitted_at, id);

create index if not exists checkpoint_decisions_assignment_time_idx
  on public.checkpoint_decisions (assignment_id, decided_at, id);

create index if not exists checkpoint_withdrawals_assignment_time_idx
  on public.checkpoint_submission_withdrawals (assignment_id, withdrawn_at, id);

create or replace function public.reject_append_only_checkpoint_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception using
    errcode = '55000',
    message = format('%I is append-only; corrections must be recorded as new history.', tg_table_name);
end;
$$;

drop trigger if exists process_step_attempts_append_only on public.process_step_attempts;
create trigger process_step_attempts_append_only
  before update or delete on public.process_step_attempts
  for each row execute function public.reject_append_only_checkpoint_history_mutation();

drop trigger if exists checkpoint_decisions_append_only on public.checkpoint_decisions;
create trigger checkpoint_decisions_append_only
  before update or delete on public.checkpoint_decisions
  for each row execute function public.reject_append_only_checkpoint_history_mutation();

drop trigger if exists checkpoint_withdrawals_append_only on public.checkpoint_submission_withdrawals;
create trigger checkpoint_withdrawals_append_only
  before update or delete on public.checkpoint_submission_withdrawals
  for each row execute function public.reject_append_only_checkpoint_history_mutation();

create or replace function public.validate_checkpoint_decision_insert()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.checkpoint_submission_withdrawals withdrawal
    where withdrawal.attempt_id = new.attempt_id
  ) then
    raise exception using errcode = '23514', message = 'A withdrawn checkpoint submission cannot be reviewed.';
  end if;

  return new;
end;
$$;

drop trigger if exists checkpoint_decisions_validate_insert on public.checkpoint_decisions;
create trigger checkpoint_decisions_validate_insert
  before insert on public.checkpoint_decisions
  for each row execute function public.validate_checkpoint_decision_insert();

create or replace function public.validate_checkpoint_withdrawal_insert()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.checkpoint_decisions decision
    where decision.attempt_id = new.attempt_id
  ) then
    raise exception using errcode = '23514', message = 'A decided checkpoint submission cannot be withdrawn.';
  end if;

  return new;
end;
$$;

drop trigger if exists checkpoint_withdrawals_validate_insert on public.checkpoint_submission_withdrawals;
create trigger checkpoint_withdrawals_validate_insert
  before insert on public.checkpoint_submission_withdrawals
  for each row execute function public.validate_checkpoint_withdrawal_insert();

create or replace function public.enforce_published_process_template_immutability()
returns trigger
language plpgsql
as $$
begin
  if old.lifecycle_status = 'published' then
    raise exception using
      errcode = '55000',
      message = 'Published process versions are immutable. Duplicate this version to create an editable draft.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists process_templates_published_immutable on public.process_templates;
create trigger process_templates_published_immutable
  before update or delete on public.process_templates
  for each row execute function public.enforce_published_process_template_immutability();

create or replace function public.enforce_draft_process_structure()
returns trigger
language plpgsql
as $$
declare
  old_template_status text;
  new_template_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select lifecycle_status
    into old_template_status
    from public.process_templates
    where id = old.template_id;

    if old_template_status is distinct from 'draft' then
      raise exception using
        errcode = '55000',
        message = 'Published process versions are immutable. Duplicate this version to create an editable draft.';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select lifecycle_status
    into new_template_status
    from public.process_templates
    where id = new.template_id;

    if new_template_status is distinct from 'draft' then
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

drop trigger if exists process_step_transitions_draft_only_mutation on public.process_step_transitions;
create trigger process_step_transitions_draft_only_mutation
  before insert or update or delete on public.process_step_transitions
  for each row execute function public.enforce_draft_process_structure();

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
    join public.wafer_process_assignments parent_assignment
      on parent_assignment.id = decision.assignment_id
    join public.wafers parent_wafer on parent_wafer.id = parent_assignment.wafer_id
    join public.wafers child_wafer on child_wafer.id = $1
    where decision.id = decision_id
      and decision.decision = 'approved'
      and decision.decided_by = auth.uid()
      and decision.template_id = $2
      and decision.target_step_id = $3
      and parent_assignment.template_id = $2
      and child_wafer.project_id = parent_wafer.project_id
      and child_wafer.metadata ->> 'parent_wafer_id' = parent_wafer.id::text
  );
end;
$$;

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
    raise exception using
      errcode = '55000',
      message = 'Assigned process versions are pinned and cannot be changed.';
  end if;

  if not exists (
    select 1
    from public.process_templates template
    where template.id = new.template_id
      and template.lifecycle_status = 'published'
  ) then
    raise exception using errcode = '23514', message = 'Only published process versions can be assigned to wafers.';
  end if;

  select wafer.project_id
  into assignment_project_id
  from public.wafers wafer
  where wafer.id = new.wafer_id;

  if assignment_project_id is null then
    raise exception using errcode = '23503', message = 'The assigned wafer no longer exists.';
  end if;

  if exists (
    select 1
    from public.process_steps step
    where step.template_id = new.template_id
      and step.archived_at is null
      and (
        step.required_reviewer_id is null
        or not public.checkpoint_reviewer_can_edit_project(step.required_reviewer_id, assignment_project_id)
      )
  ) then
    raise exception using errcode = '23514', message = 'Every checkpoint reviewer must be an active editor of the wafer project.';
  end if;

  if tg_op = 'INSERT' then
    select step.id
    into first_step_id
    from public.process_steps step
    where step.template_id = new.template_id
      and step.archived_at is null
    order by step.step_order, step.created_at, step.id
    limit 1;

    is_dicing_child := public.checkpoint_dicing_child_is_authorized(
      new.wafer_id,
      new.template_id,
      new.current_step_id
    );

    if new.current_step_id is null
       or (
         not is_dicing_child
         and new.current_step_id is distinct from first_step_id
       ) then
      raise exception using
        errcode = '55000',
        message = 'New published assignments must begin at the first ordered step.';
    end if;

    if new.status not in ('planned', 'queued') or new.completed_at is not null then
      raise exception using
        errcode = '55000',
        message = 'New published assignments cannot bypass checkpoint progression.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists wafer_assignments_require_published_template on public.wafer_process_assignments;
create trigger wafer_assignments_require_published_template
  before insert or update of template_id on public.wafer_process_assignments
  for each row execute function public.enforce_published_assignment_template();

create or replace function public.checkpoint_actor_name(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(profile.display_name), ''), profile.email, 'WaferWatch user')
  from public.profiles profile
  where profile.id = target_user_id
$$;

create or replace function public.checkpoint_reviewer_can_edit_project(
  target_user_id uuid,
  target_project_id uuid
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
      where profile.id = target_user_id
        and profile.is_active = true
        and profile.role = 'admin'
    )
    or exists (
      select 1
      from public.projects project
      join public.profiles profile on profile.id = project.owner_id
      where project.id = target_project_id
        and project.owner_id = target_user_id
        and profile.is_active = true
    )
    or exists (
      select 1
      from public.project_members member
      join public.profiles profile on profile.id = member.user_id
      where member.project_id = target_project_id
        and member.user_id = target_user_id
        and member.role in ('owner', 'editor')
        and profile.is_active = true
    ),
    false
  )
$$;

create or replace function public.checkpoint_step_is_dicing(
  step_name text,
  step_slug text,
  step_process_area text
)
returns boolean
language sql
immutable
as $$
  with normalized as (
    select lower(regexp_replace(
      concat_ws(' ', step_name, step_slug, step_process_area),
      '[^a-z0-9]+',
      '',
      'g'
    )) as identity
  )
  select identity ~ '(dicing|diced|dice|dicng|diciing|dicin|dicingg|singulation|singulate|sawing|sawcut|cutting)'
    and identity !~ '(pre|post|after|before)(dicing|diced|dice|singulation|singulate|sawing|sawcut|cutting)'
  from normalized
$$;

create or replace function public.validate_published_process_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lifecycle_status = 'published'
     and (tg_op = 'INSERT' or old.lifecycle_status = 'draft') then
    if auth.uid() is null
       or current_setting('waferwatch.process_publish', true) is distinct from
         new.id::text || ':' || auth.uid()::text then
      raise exception using
        errcode = '42501',
        message = 'Process versions must be published through the authorized publish action.';
    end if;

    if not exists (
      select 1
      from public.process_steps step
      where step.template_id = new.id
        and step.archived_at is null
    ) then
      raise exception using errcode = '23514', message = 'A process needs at least one active step before publishing.';
    end if;

    if exists (
      select 1
      from public.process_steps step
      where step.template_id = new.id
        and step.archived_at is null
        and step.required_reviewer_id is null
    ) then
      raise exception using errcode = '23514', message = 'Every active process step needs a checkpoint reviewer before publishing.';
    end if;

    if new.owner_project_id is not null and exists (
      select 1
      from public.process_steps step
      where step.template_id = new.id
        and step.archived_at is null
        and not public.checkpoint_reviewer_can_edit_project(step.required_reviewer_id, new.owner_project_id)
    ) then
      raise exception using errcode = '23514', message = 'Every checkpoint reviewer must be an active project editor.';
    end if;

    if new.owner_project_id is null and exists (
      select 1
      from public.process_steps step
      left join public.profiles reviewer on reviewer.id = step.required_reviewer_id
      where step.template_id = new.id
        and step.archived_at is null
        and (
          reviewer.id is null
          or reviewer.is_active is distinct from true
          or reviewer.role <> 'admin'
        )
    ) then
      raise exception using
        errcode = '23514',
        message = 'Shared process checkpoints require active administrator reviewers.';
    end if;

    if exists (
      select 1
      from public.process_steps dicing_step
      where dicing_step.template_id = new.id
        and dicing_step.archived_at is null
        and public.checkpoint_step_is_dicing(
          dicing_step.name,
          dicing_step.slug,
          dicing_step.process_area
        )
        and not exists (
          select 1
          from public.process_steps successor
          where successor.template_id = dicing_step.template_id
            and successor.archived_at is null
            and successor.step_order > dicing_step.step_order
        )
    ) then
      raise exception using
        errcode = '23514',
        message = 'A dicing checkpoint needs a later active step for child wafer handoff.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists process_templates_validate_publish on public.process_templates;
create trigger process_templates_validate_publish
  before insert or update of lifecycle_status on public.process_templates
  for each row execute function public.validate_published_process_template();

create or replace function public.duplicate_process_template_version(
  source_template_id uuid,
  next_version text,
  next_name text default null
)
returns public.process_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  source_template public.process_templates%rowtype;
  draft_template public.process_templates%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select *
  into source_template
  from public.process_templates
  where id = $1;

  if source_template.id is null then
    raise exception using errcode = 'P0002', message = 'The source process version no longer exists.';
  end if;

  if not public.can_manage_process_library()
     or (
       source_template.owner_project_id is not null
       and not public.can_edit_project(source_template.owner_project_id)
     ) then
    raise exception using errcode = '42501', message = 'You do not have permission to duplicate this process version.';
  end if;

  if length(trim(next_version)) = 0 then
    raise exception using errcode = '22023', message = 'A version label is required.';
  end if;

  insert into public.process_templates (
    owner_project_id,
    name,
    version,
    description,
    is_active,
    created_by,
    lifecycle_status,
    source_template_id,
    published_at,
    published_by
  )
  values (
    source_template.owner_project_id,
    coalesce(nullif(trim(next_name), ''), source_template.name),
    trim(next_version),
    source_template.description,
    false,
    auth.uid(),
    'draft',
    source_template.id,
    null,
    null
  )
  returning * into draft_template;

  insert into public.process_steps (
    template_id,
    step_order,
    name,
    slug,
    process_area,
    node_type,
    canvas_x,
    canvas_y,
    expected_duration_minutes,
    queue_target_minutes,
    required_tool_type,
    requires_recipe,
    instructions,
    parameters_schema,
    required_reviewer_id,
    archived_at
  )
  select
    draft_template.id,
    row_number() over (order by source_step.step_order, source_step.created_at, source_step.id) * 10,
    source_step.name,
    source_step.slug,
    source_step.process_area,
    source_step.node_type,
    source_step.canvas_x,
    source_step.canvas_y,
    source_step.expected_duration_minutes,
    source_step.queue_target_minutes,
    source_step.required_tool_type,
    source_step.requires_recipe,
    source_step.instructions,
    source_step.parameters_schema,
    source_step.required_reviewer_id,
    null
  from public.process_steps source_step
  where source_step.template_id = source_template.id
    and source_step.archived_at is null
  order by source_step.step_order, source_step.created_at, source_step.id;

  -- New runtime logic is ordered, not graph-driven. Keep a simple linear graph
  -- projection so legacy readers can still render a duplicated draft.
  with ordered_steps as (
    select
      step.id as from_step_id,
      lead(step.id) over (order by step.step_order, step.created_at, step.id) as to_step_id,
      row_number() over (order by step.step_order, step.created_at, step.id) as ordinal
    from public.process_steps step
    where step.template_id = draft_template.id
      and step.archived_at is null
  )
  insert into public.process_step_transitions (
    template_id,
    from_step_id,
    to_step_id,
    edge_type,
    label,
    condition,
    priority
  )
  select
    draft_template.id,
    from_step_id,
    to_step_id,
    'flow',
    null,
    '{}'::jsonb,
    ordinal * 10
  from ordered_steps
  where to_step_id is not null;

  return draft_template;
end;
$$;

create or replace function public.publish_process_template_version(target_template_id uuid)
returns public.process_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  template public.process_templates%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select *
  into template
  from public.process_templates
  where id = target_template_id
  for update;

  if template.id is null then
    raise exception using errcode = 'P0002', message = 'The process draft no longer exists.';
  end if;

  if template.lifecycle_status <> 'draft' then
    raise exception using errcode = '55000', message = 'This process version is already published.';
  end if;

  if not public.can_manage_process_library()
     or (
       template.owner_project_id is not null
       and not public.can_edit_project(template.owner_project_id)
     ) then
    raise exception using errcode = '42501', message = 'You do not have permission to publish this process version.';
  end if;

  perform set_config(
    'waferwatch.process_publish',
    template.id::text || ':' || auth.uid()::text,
    true
  );
  update public.process_templates
  set lifecycle_status = 'published',
      is_active = true,
      published_at = now(),
      published_by = auth.uid()
  where id = target_template_id
  returning * into template;

  return template;
end;
$$;

create or replace function public.normalize_draft_process_step_order(
  target_template_id uuid,
  moved_step_id uuid,
  target_position integer
)
returns setof public.process_steps
language plpgsql
security definer
set search_path = public
as $$
declare
  template public.process_templates%rowtype;
  ordered_ids uuid[];
  reordered_ids uuid[];
  active_count integer;
  bounded_position integer;
  current_id uuid;
  index_value integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.is_active = true
  ) then
    raise exception using errcode = '42501', message = 'An active account is required.';
  end if;

  select *
  into template
  from public.process_templates
  where id = target_template_id
  for update;

  if template.id is null then
    raise exception using errcode = 'P0002', message = 'The process draft no longer exists.';
  end if;

  if template.lifecycle_status <> 'draft' then
    raise exception using errcode = '55000', message = 'Published process versions are immutable.';
  end if;

  if not public.can_manage_process_library()
     or (template.owner_project_id is not null and not public.can_edit_project(template.owner_project_id)) then
    raise exception using errcode = '42501', message = 'You do not have permission to edit this process draft.';
  end if;

  perform 1
  from public.process_steps step
  where step.template_id = target_template_id
    and step.archived_at is null
  for update;

  if not exists (
    select 1
    from public.process_steps step
    where step.id = moved_step_id
      and step.template_id = target_template_id
      and step.archived_at is null
  ) then
    raise exception using errcode = 'P0002', message = 'The active process step no longer exists.';
  end if;

  select coalesce(array_agg(step.id order by step.step_order, step.created_at, step.id), array[]::uuid[])
  into ordered_ids
  from public.process_steps step
  where step.template_id = target_template_id
    and step.archived_at is null
    and step.id <> moved_step_id;

  active_count := coalesce(array_length(ordered_ids, 1), 0) + 1;
  bounded_position := greatest(1, least(target_position, active_count));
  reordered_ids := array[]::uuid[];

  if bounded_position > 1 then
    reordered_ids := reordered_ids || ordered_ids[1:bounded_position - 1];
  end if;
  reordered_ids := reordered_ids || moved_step_id;
  if bounded_position <= active_count - 1 then
    reordered_ids := reordered_ids || ordered_ids[bounded_position:active_count - 1];
  end if;

  with ranked as (
    select step.id, row_number() over (order by step.step_order, step.created_at, step.id) as ordinal
    from public.process_steps step
    where step.template_id = target_template_id
      and step.archived_at is null
  )
  update public.process_steps step
  set step_order = -ranked.ordinal
  from ranked
  where step.id = ranked.id;

  for index_value in 1..active_count loop
    current_id := reordered_ids[index_value];
    update public.process_steps
    set step_order = index_value * 10,
        node_type = case
          when index_value = 1 then 'start'
          when index_value = active_count and active_count > 1 then 'end'
          else 'procedure'
        end
    where id = current_id;
  end loop;

  return query
  select step.*
  from public.process_steps step
  where step.template_id = target_template_id
    and step.archived_at is null
  order by step.step_order, step.created_at, step.id;
end;
$$;

create or replace function public.create_ordered_draft_process_step(
  target_template_id uuid,
  target_position integer,
  step_name text,
  step_slug text,
  step_process_area text,
  reviewer_id uuid default null,
  step_expected_duration_minutes integer default null,
  step_queue_target_minutes integer default null,
  step_required_tool_type text default null,
  step_requires_recipe boolean default false,
  step_instructions text default null,
  step_parameters_schema jsonb default '{}'::jsonb,
  step_canvas_x integer default null,
  step_canvas_y integer default null
)
returns public.process_steps
language plpgsql
security definer
set search_path = public
as $$
declare
  template public.process_templates%rowtype;
  step public.process_steps%rowtype;
  temporary_order integer;
begin
  select *
  into template
  from public.process_templates
  where id = target_template_id
  for update;

  if template.id is null then
    raise exception using errcode = 'P0002', message = 'The process draft no longer exists.';
  end if;

  if template.lifecycle_status <> 'draft' then
    raise exception using errcode = '55000', message = 'Published process versions are immutable.';
  end if;

  if not public.can_manage_process_library()
     or (template.owner_project_id is not null and not public.can_edit_project(template.owner_project_id)) then
    raise exception using errcode = '42501', message = 'You do not have permission to edit this process draft.';
  end if;

  if reviewer_id is not null and template.owner_project_id is not null
     and not public.checkpoint_reviewer_can_edit_project(reviewer_id, template.owner_project_id) then
    raise exception using errcode = '23514', message = 'The checkpoint reviewer must be an active project editor.';
  end if;

  select coalesce(max(existing_step.step_order), 0) + 1000
  into temporary_order
  from public.process_steps existing_step
  where existing_step.template_id = target_template_id
    and existing_step.archived_at is null;

  insert into public.process_steps (
    template_id,
    step_order,
    name,
    slug,
    process_area,
    node_type,
    canvas_x,
    canvas_y,
    expected_duration_minutes,
    queue_target_minutes,
    required_tool_type,
    requires_recipe,
    instructions,
    parameters_schema,
    required_reviewer_id,
    archived_at
  )
  values (
    target_template_id,
    temporary_order,
    trim(step_name),
    trim(step_slug),
    trim(step_process_area),
    'procedure',
    step_canvas_x,
    step_canvas_y,
    step_expected_duration_minutes,
    step_queue_target_minutes,
    step_required_tool_type,
    step_requires_recipe,
    step_instructions,
    coalesce(step_parameters_schema, '{}'::jsonb),
    reviewer_id,
    null
  )
  returning * into step;

  perform *
  from public.normalize_draft_process_step_order(target_template_id, step.id, target_position);

  select * into step from public.process_steps where id = step.id;
  return step;
end;
$$;

create or replace function public.archive_draft_process_step(target_step_id uuid)
returns public.process_steps
language plpgsql
security definer
set search_path = public
as $$
declare
  step public.process_steps%rowtype;
  template public.process_templates%rowtype;
  first_remaining_step_id uuid;
begin
  select * into step from public.process_steps where id = target_step_id for update;
  if step.id is null or step.archived_at is not null then
    raise exception using errcode = 'P0002', message = 'The active process step no longer exists.';
  end if;

  select * into template from public.process_templates where id = step.template_id for update;
  if template.lifecycle_status <> 'draft' then
    raise exception using errcode = '55000', message = 'Published process versions are immutable.';
  end if;
  if not public.can_manage_process_library()
     or (template.owner_project_id is not null and not public.can_edit_project(template.owner_project_id)) then
    raise exception using errcode = '42501', message = 'You do not have permission to edit this process draft.';
  end if;
  if not exists (
    select 1 from public.process_steps other_step
    where other_step.template_id = step.template_id
      and other_step.archived_at is null
      and other_step.id <> step.id
  ) then
    raise exception using errcode = '23514', message = 'A process draft must keep at least one active step.';
  end if;

  update public.process_steps
  set archived_at = now()
  where id = step.id
  returning * into step;

  select remaining_step.id
  into first_remaining_step_id
  from public.process_steps remaining_step
  where remaining_step.template_id = step.template_id
    and remaining_step.archived_at is null
  order by remaining_step.step_order, remaining_step.created_at, remaining_step.id
  limit 1;

  perform *
  from public.normalize_draft_process_step_order(step.template_id, first_remaining_step_id, 1);

  return step;
end;
$$;

create or replace function public.assign_draft_process_step_reviewer(
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
  select * into step from public.process_steps where id = target_step_id for update;
  if step.id is null or step.archived_at is not null then
    raise exception using errcode = 'P0002', message = 'The active process step no longer exists.';
  end if;

  select * into template from public.process_templates where id = step.template_id for update;
  if template.lifecycle_status <> 'draft' then
    raise exception using errcode = '55000', message = 'Published process versions are immutable.';
  end if;
  if not public.can_manage_process_library()
     or (template.owner_project_id is not null and not public.can_edit_project(template.owner_project_id)) then
    raise exception using errcode = '42501', message = 'You do not have permission to edit this process draft.';
  end if;
  if reviewer_id is not null and template.owner_project_id is not null
     and not public.checkpoint_reviewer_can_edit_project(reviewer_id, template.owner_project_id) then
    raise exception using errcode = '23514', message = 'The checkpoint reviewer must be an active project editor.';
  end if;

  update public.process_steps
  set required_reviewer_id = reviewer_id
  where id = step.id
  returning * into step;

  return step;
end;
$$;

create or replace function public.submit_step_checkpoint(
  target_step_execution_id uuid,
  mutation_id uuid,
  notes text default null,
  evidence jsonb default '{}'::jsonb
)
returns public.process_step_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_attempt public.process_step_attempts%rowtype;
  attempt public.process_step_attempts%rowtype;
  execution public.step_executions%rowtype;
  assignment public.wafer_process_assignments%rowtype;
  wafer public.wafers%rowtype;
  step public.process_steps%rowtype;
  template public.process_templates%rowtype;
  next_attempt_number integer;
  reviewer_name text;
  submitter_name text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.is_active = true
  ) then
    raise exception using errcode = '42501', message = 'An active account is required.';
  end if;

  select * into existing_attempt
  from public.process_step_attempts
  where client_mutation_id = mutation_id;

  if existing_attempt.id is not null then
    if existing_attempt.step_execution_id <> target_step_execution_id then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different checkpoint submission.';
    end if;
    if existing_attempt.submitted_by is distinct from auth.uid()
       or not exists (
         select 1 from public.wafers wafer_row
         where wafer_row.id = existing_attempt.wafer_id
           and public.can_edit_project(wafer_row.project_id)
       ) then
      raise exception using errcode = '42501', message = 'You no longer have access to this checkpoint submission.';
    end if;
    return existing_attempt;
  end if;

  select * into execution
  from public.step_executions
  where id = target_step_execution_id
  for update;

  select * into existing_attempt
  from public.process_step_attempts
  where client_mutation_id = mutation_id;

  if existing_attempt.id is not null then
    if existing_attempt.step_execution_id <> target_step_execution_id then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different checkpoint submission.';
    end if;
    if existing_attempt.submitted_by is distinct from auth.uid()
       or not exists (
         select 1 from public.wafers wafer_row
         where wafer_row.id = existing_attempt.wafer_id
           and public.can_edit_project(wafer_row.project_id)
       ) then
      raise exception using errcode = '42501', message = 'You no longer have access to this checkpoint submission.';
    end if;
    return existing_attempt;
  end if;

  if execution.id is null then
    raise exception using errcode = 'P0002', message = 'The step execution no longer exists.';
  end if;

  select * into assignment
  from public.wafer_process_assignments
  where id = execution.assignment_id
  for update;
  select * into wafer from public.wafers where id = execution.wafer_id;
  select * into step from public.process_steps where id = execution.process_step_id;
  select * into template from public.process_templates where id = assignment.template_id;

  if assignment.id is null or wafer.id is null or step.id is null or template.id is null then
    raise exception using errcode = 'P0002', message = 'The checkpoint context is incomplete.';
  end if;
  if execution.wafer_id <> assignment.wafer_id
     or step.template_id <> assignment.template_id
     or assignment.current_step_id is distinct from step.id then
    raise exception using errcode = '40001', message = 'This wafer is no longer at the selected step.';
  end if;
  if template.lifecycle_status <> 'published' then
    raise exception using errcode = '23514', message = 'Checkpoint submissions require a published process version.';
  end if;
  if not public.can_edit_project(wafer.project_id) then
    raise exception using errcode = '42501', message = 'You do not have permission to submit this checkpoint.';
  end if;
  if step.required_reviewer_id is null then
    raise exception using errcode = '23514', message = 'This step does not have a checkpoint reviewer.';
  end if;
  if not public.checkpoint_reviewer_can_edit_project(step.required_reviewer_id, wafer.project_id) then
    raise exception using errcode = '23514', message = 'The assigned checkpoint reviewer no longer has project edit access.';
  end if;
  if execution.status not in ('queued', 'running', 'redo_required') then
    raise exception using errcode = '55000', message = 'Only active or redo-required work can be submitted for checkpoint review.';
  end if;

  select coalesce(max(existing.attempt_number), 0) + 1
  into next_attempt_number
  from public.process_step_attempts existing
  where existing.assignment_id = assignment.id
    and existing.process_step_id = step.id;

  reviewer_name := coalesce(public.checkpoint_actor_name(step.required_reviewer_id), 'Checkpoint reviewer');
  submitter_name := coalesce(public.checkpoint_actor_name(auth.uid()), 'WaferWatch user');

  insert into public.process_step_attempts (
    assignment_id,
    wafer_id,
    template_id,
    process_step_id,
    step_execution_id,
    attempt_number,
    submitted_by,
    started_at_snapshot,
    submission_notes,
    evidence_snapshot,
    wafer_code_snapshot,
    template_name_snapshot,
    template_version_snapshot,
    process_step_name_snapshot,
    process_step_order_snapshot,
    reviewer_id_snapshot,
    reviewer_name_snapshot,
    submitted_by_name_snapshot,
    prior_step_status,
    client_mutation_id
  )
  values (
    assignment.id,
    wafer.id,
    template.id,
    step.id,
    execution.id,
    next_attempt_number,
    auth.uid(),
    coalesce(execution.started_at, execution.queue_started_at, execution.created_at),
    nullif(trim(notes), ''),
    coalesce(evidence, '{}'::jsonb),
    wafer.wafer_code,
    template.name,
    template.version,
    step.name,
    step.step_order,
    step.required_reviewer_id,
    reviewer_name,
    submitter_name,
    execution.status,
    mutation_id
  )
  returning * into attempt;

  perform set_config('waferwatch.checkpoint_transition', 'attempt:' || attempt.id::text, true);

  update public.step_executions
  set status = 'awaiting_checkpoint',
      run_notes = coalesce(nullif(trim(notes), ''), run_notes)
  where id = execution.id;

  update public.wafer_process_assignments
  set status = 'in_progress',
      current_step_id = step.id,
      started_at = coalesce(started_at, now()),
      completed_at = null
  where id = assignment.id;

  update public.wafers set status = 'in_progress' where id = wafer.id;

  insert into public.process_events (
    project_id,
    wafer_id,
    step_execution_id,
    actor_id,
    event_type,
    notes,
    metadata,
    client_mutation_id
  )
  values (
    wafer.project_id,
    wafer.id,
    execution.id,
    auth.uid(),
    'checkpoint_submitted',
    nullif(trim(notes), ''),
    jsonb_build_object(
      'assignment_id', assignment.id,
      'attempt_id', attempt.id,
      'attempt_number', attempt.attempt_number,
      'process_step_id', step.id,
      'process_step_name', step.name,
      'required_reviewer_id', step.required_reviewer_id
    ),
    mutation_id
  );

  return attempt;
end;
$$;

create or replace function public.withdraw_step_checkpoint_submission(
  target_attempt_id uuid,
  mutation_id uuid,
  reason text default null
)
returns public.checkpoint_submission_withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_withdrawal public.checkpoint_submission_withdrawals%rowtype;
  withdrawal public.checkpoint_submission_withdrawals%rowtype;
  attempt public.process_step_attempts%rowtype;
  execution public.step_executions%rowtype;
  wafer public.wafers%rowtype;
  actor_name text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.is_active = true
  ) then
    raise exception using errcode = '42501', message = 'An active account is required.';
  end if;

  select * into existing_withdrawal
  from public.checkpoint_submission_withdrawals
  where client_mutation_id = mutation_id;
  if existing_withdrawal.id is not null then
    if existing_withdrawal.attempt_id <> target_attempt_id then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different checkpoint withdrawal.';
    end if;
    if existing_withdrawal.withdrawn_by is distinct from auth.uid()
       or not exists (
         select 1 from public.wafers wafer_row
         where wafer_row.id = existing_withdrawal.wafer_id
           and public.can_edit_project(wafer_row.project_id)
       ) then
      raise exception using errcode = '42501', message = 'You no longer have access to this checkpoint withdrawal.';
    end if;
    return existing_withdrawal;
  end if;

  select * into attempt
  from public.process_step_attempts
  where id = target_attempt_id
  for update;

  select * into existing_withdrawal
  from public.checkpoint_submission_withdrawals
  where client_mutation_id = mutation_id;

  if existing_withdrawal.id is not null then
    if existing_withdrawal.attempt_id <> target_attempt_id then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different checkpoint withdrawal.';
    end if;
    if existing_withdrawal.withdrawn_by is distinct from auth.uid()
       or not exists (
         select 1 from public.wafers wafer_row
         where wafer_row.id = existing_withdrawal.wafer_id
           and public.can_edit_project(wafer_row.project_id)
       ) then
      raise exception using errcode = '42501', message = 'You no longer have access to this checkpoint withdrawal.';
    end if;
    return existing_withdrawal;
  end if;

  if attempt.id is null then
    raise exception using errcode = 'P0002', message = 'The checkpoint submission no longer exists.';
  end if;

  select * into execution from public.step_executions where id = attempt.step_execution_id for update;
  select * into wafer from public.wafers where id = attempt.wafer_id;

  if not public.can_edit_project(wafer.project_id) then
    raise exception using errcode = '42501', message = 'You do not have permission to withdraw this checkpoint.';
  end if;
  if attempt.submitted_by is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Only the person who submitted this checkpoint can withdraw it.';
  end if;
  if exists (select 1 from public.checkpoint_decisions decision where decision.attempt_id = attempt.id) then
    raise exception using errcode = '55000', message = 'This checkpoint has already been decided and cannot be withdrawn.';
  end if;
  if exists (select 1 from public.checkpoint_submission_withdrawals prior where prior.attempt_id = attempt.id) then
    raise exception using errcode = '55000', message = 'This checkpoint submission was already withdrawn.';
  end if;
  if execution.status <> 'awaiting_checkpoint' then
    raise exception using errcode = '40001', message = 'This step is no longer awaiting checkpoint review.';
  end if;

  actor_name := coalesce(public.checkpoint_actor_name(auth.uid()), 'WaferWatch user');
  insert into public.checkpoint_submission_withdrawals (
    attempt_id,
    assignment_id,
    wafer_id,
    template_id,
    process_step_id,
    step_execution_id,
    withdrawn_by,
    withdrawal_reason,
    wafer_code_snapshot,
    process_step_name_snapshot,
    withdrawn_by_name_snapshot,
    client_mutation_id
  )
  values (
    attempt.id,
    attempt.assignment_id,
    attempt.wafer_id,
    attempt.template_id,
    attempt.process_step_id,
    attempt.step_execution_id,
    auth.uid(),
    nullif(trim(reason), ''),
    attempt.wafer_code_snapshot,
    attempt.process_step_name_snapshot,
    actor_name,
    mutation_id
  )
  returning * into withdrawal;

  perform set_config('waferwatch.checkpoint_transition', 'withdrawal:' || withdrawal.id::text, true);

  update public.step_executions
  set status = attempt.prior_step_status
  where id = execution.id;

  insert into public.process_events (
    project_id, wafer_id, step_execution_id, actor_id, event_type, notes, metadata, client_mutation_id
  )
  values (
    wafer.project_id,
    wafer.id,
    execution.id,
    auth.uid(),
    'checkpoint_submission_withdrawn',
    nullif(trim(reason), ''),
    jsonb_build_object('assignment_id', attempt.assignment_id, 'attempt_id', attempt.id),
    mutation_id
  );

  return withdrawal;
end;
$$;

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
  if attempt.reviewer_id_snapshot is distinct from auth.uid()
     or step.required_reviewer_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Only the assigned checkpoint reviewer can decide this submission.';
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

-- Published workflows may be advanced only by the three checkpoint RPCs above.
-- A transaction-local token lets their trigger-visible updates through without
-- granting clients a general-purpose state transition escape hatch.
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
  begin
    token_id := split_part(transition_token, ':', 2)::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if token_kind = 'attempt' then
    return exists (
      select 1
      from public.process_step_attempts attempt
      where attempt.id = token_id
        and attempt.assignment_id = target_assignment_id
        and (
          target_step_execution_id is null
          or attempt.step_execution_id = target_step_execution_id
        )
    );
  end if;

  if token_kind = 'withdrawal' then
    return exists (
      select 1
      from public.checkpoint_submission_withdrawals withdrawal
      where withdrawal.id = token_id
        and withdrawal.assignment_id = target_assignment_id
        and (
          target_step_execution_id is null
          or withdrawal.step_execution_id = target_step_execution_id
        )
    );
  end if;

  if token_kind = 'decision' then
    return exists (
      select 1
      from public.checkpoint_decisions decision
      where decision.id = token_id
        and decision.assignment_id = target_assignment_id
        and (
          target_step_execution_id is null
          or decision.step_execution_id = target_step_execution_id
          or decision.decision = 'redo'
          or decision.target_step_id = (
            select execution.process_step_id
            from public.step_executions execution
            where execution.id = target_step_execution_id
          )
        )
    );
  end if;

  return false;
end;
$$;

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
  target_step public.process_steps%rowtype;
  child_wafer public.wafers%rowtype;
  child_assignment public.wafer_process_assignments%rowtype;
  child_ids uuid[];
  stored_child_ids uuid[];
  child_id uuid;
  child_assignment_count integer;
  child_labels jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select coalesce(array_agg(candidate.child_id order by candidate.child_id), array[]::uuid[])
  into child_ids
  from (
    select distinct unnest(coalesce(target_child_wafer_ids, array[]::uuid[])) as child_id
  ) candidate;

  if cardinality(child_ids) = 0
     or cardinality(child_ids) <> cardinality(coalesce(target_child_wafer_ids, array[]::uuid[])) then
    raise exception using errcode = '22023', message = 'Dicing reconciliation requires a non-empty set of distinct child wafers.';
  end if;

  select * into decision
  from public.checkpoint_decisions
  where id = target_decision_id
  for share;

  if decision.id is null then
    raise exception using errcode = 'P0002', message = 'The dicing checkpoint decision no longer exists.';
  end if;

  select * into parent_assignment
  from public.wafer_process_assignments
  where id = decision.assignment_id
  for update;

  if parent_assignment.id is null then
    raise exception using errcode = 'P0002', message = 'The dicing checkpoint context no longer exists.';
  end if;

  select * into parent_wafer from public.wafers where id = parent_assignment.wafer_id for update;
  select * into source_step from public.process_steps where id = decision.process_step_id;
  select * into target_step from public.process_steps where id = decision.target_step_id;

  if decision.decision <> 'approved'
     or decision.decided_by is distinct from auth.uid()
     or decision.target_step_id is null
     or parent_assignment.template_id <> decision.template_id
     or parent_assignment.current_step_id is distinct from decision.target_step_id
     or target_step.template_id is distinct from decision.template_id then
    raise exception using errcode = '42501', message = 'This approval cannot finalize the selected dicing split.';
  end if;

  if not public.can_edit_project(parent_wafer.project_id) then
    raise exception using errcode = '42501', message = 'You do not have permission to finalize this dicing split.';
  end if;

  if not public.checkpoint_step_is_dicing(
    source_step.name,
    source_step.slug,
    source_step.process_area
  ) then
    raise exception using errcode = '23514', message = 'Only an approved dicing checkpoint can finalize a split.';
  end if;

  if parent_assignment.status = 'completed'
     and parent_wafer.metadata ? 'dicing_completed_at' then
    select coalesce(array_agg(stored.child_id order by stored.child_id), array[]::uuid[])
    into stored_child_ids
    from (
      select distinct value::uuid as child_id
      from jsonb_array_elements_text(
        coalesce(parent_wafer.metadata -> 'diced_child_wafer_ids', '[]'::jsonb)
      ) value
    ) stored;

    if stored_child_ids is distinct from child_ids
       or (
         select count(*)::integer
         from public.wafers child
         where child.id = any(child_ids)
           and child.project_id = parent_wafer.project_id
           and child.metadata ->> 'parent_wafer_id' = parent_wafer.id::text
       ) <> cardinality(child_ids) then
      raise exception using
        errcode = '40001',
        message = 'This completed dicing checkpoint was reconciled with a different child set.';
    end if;

    return jsonb_build_object(
      'assignment_id', parent_assignment.id,
      'parent_wafer_id', parent_wafer.id,
      'child_wafer_ids', to_jsonb(child_ids),
      'next_step_id', target_step.id,
      'already_reconciled', true
    );
  end if;

  perform set_config('waferwatch.checkpoint_transition', 'decision:' || decision.id::text, true);

  foreach child_id in array child_ids
  loop
    select * into child_wafer
    from public.wafers
    where id = child_id
    for update;

    if child_wafer.id is null
       or child_wafer.project_id <> parent_wafer.project_id
       or child_wafer.metadata ->> 'parent_wafer_id' is distinct from parent_wafer.id::text then
      raise exception using errcode = '23514', message = 'Every dicing child must belong to this parent wafer and project.';
    end if;

    select count(*)::integer
    into child_assignment_count
    from public.wafer_process_assignments existing
    where existing.wafer_id = child_wafer.id
      and existing.template_id = parent_assignment.template_id;

    if child_assignment_count > 1 then
      raise exception using errcode = '23505', message = 'A dicing child has duplicate process assignments that must be repaired.';
    end if;

    select * into child_assignment
    from public.wafer_process_assignments existing
    where existing.wafer_id = child_wafer.id
      and existing.template_id = parent_assignment.template_id
    for update;

    if child_assignment.id is null then
      insert into public.wafer_process_assignments (
        id,
        wafer_id,
        template_id,
        current_step_id,
        assigned_by,
        status,
        assigned_at,
        started_at,
        completed_at
      ) values (
        gen_random_uuid(),
        child_wafer.id,
        parent_assignment.template_id,
        target_step.id,
        auth.uid(),
        'queued',
        now(),
        null,
        null
      )
      returning * into child_assignment;
    elsif child_assignment.current_step_id is distinct from target_step.id
       or child_assignment.status not in ('planned', 'queued', 'in_progress') then
      raise exception using errcode = '40001', message = 'An existing dicing child assignment is not at the approved successor step.';
    end if;

    insert into public.step_executions (
      assignment_id,
      wafer_id,
      process_step_id,
      status,
      queue_started_at,
      metadata
    )
    select
      child_assignment.id,
      child_wafer.id,
      child_step.id,
      case when child_step.id = target_step.id then 'queued'::public.step_status else 'pending'::public.step_status end,
      case when child_step.id = target_step.id then now() else null end,
      '{}'::jsonb
    from public.process_steps child_step
    where child_step.template_id = parent_assignment.template_id
      and child_step.archived_at is null
      and child_step.step_order >= target_step.step_order
    order by child_step.step_order, child_step.created_at, child_step.id
    on conflict (assignment_id, process_step_id) do nothing;

    update public.wafers
    set status = 'queued'
    where id = child_wafer.id
      and status <> 'queued';
  end loop;

  -- Approval provisionally queued the successor on the parent. The child wafers
  -- own all post-dicing work, so park the parent's projection before completing it.
  update public.step_executions
  set status = 'pending',
      queue_started_at = null,
      started_at = null,
      completed_at = null,
      skipped_at = null,
      completed_by = null,
      operator_id = null,
      planned_end_at = null
  where assignment_id = parent_assignment.id
    and process_step_id = target_step.id;

  select coalesce(
    jsonb_agg(child.metadata ->> 'current_die' order by child.id),
    '[]'::jsonb
  )
  into child_labels
  from public.wafers child
  where child.id = any(child_ids);

  update public.wafers
  set status = 'completed',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'wafer_display_mode', 'undiced',
        'dicing_completed_at', decision.decided_at,
        'diced_child_wafer_ids', to_jsonb(child_ids),
        'diced_child_die_labels', child_labels
      )
  where id = parent_wafer.id;

  update public.wafer_process_assignments
  set status = 'completed',
      completed_at = coalesce(completed_at, now())
  where id = parent_assignment.id;

  insert into public.process_events (
    project_id,
    wafer_id,
    step_execution_id,
    actor_id,
    event_type,
    event_at,
    notes,
    metadata,
    client_mutation_id
  ) values (
    parent_wafer.project_id,
    parent_wafer.id,
    decision.step_execution_id,
    auth.uid(),
    'wafer_diced',
    decision.decided_at,
    format('Created %s die pieces from %s.', cardinality(child_ids), parent_wafer.wafer_code),
    jsonb_build_object(
      'assignment_id', parent_assignment.id,
      'checkpoint_decision_id', decision.id,
      'dicing_step_id', source_step.id,
      'next_step_id', target_step.id,
      'child_wafer_ids', to_jsonb(child_ids),
      'die_labels', child_labels
    ),
    decision.id
  )
  on conflict (client_mutation_id) do nothing;

  return jsonb_build_object(
    'assignment_id', parent_assignment.id,
    'parent_wafer_id', parent_wafer.id,
    'child_wafer_ids', to_jsonb(child_ids),
    'next_step_id', target_step.id
  );
end;
$$;

create or replace function public.checkpoint_decision_targets_step(
  target_assignment_id uuid,
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
    where decision.id = decision_id
      and decision.assignment_id = $1
      and decision.target_step_id = $2
      and decision.decided_by = auth.uid()
  );
end;
$$;

create or replace function public.enforce_checkpoint_execution_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  template_status text;
  assignment public.wafer_process_assignments%rowtype;
  execution_step public.process_steps%rowtype;
  current_step public.process_steps%rowtype;
  decision_target_authorized boolean := false;
begin
  if tg_op = 'UPDATE'
     and (
       new.assignment_id is distinct from old.assignment_id
       or new.wafer_id is distinct from old.wafer_id
       or new.process_step_id is distinct from old.process_step_id
     ) then
    raise exception using
      errcode = '55000',
      message = 'Published step execution identity is immutable.';
  end if;

  select * into assignment
  from public.wafer_process_assignments assignment_row
  where assignment_row.id = new.assignment_id;

  select template.lifecycle_status into template_status
  from public.process_templates template
  where template.id = assignment.template_id;

  if template_status is distinct from 'published' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select * into execution_step
    from public.process_steps
    where id = new.process_step_id;

    select * into current_step
    from public.process_steps
    where id = assignment.current_step_id;

    if new.wafer_id is distinct from assignment.wafer_id
       or execution_step.template_id is distinct from assignment.template_id
       or current_step.template_id is distinct from assignment.template_id then
      raise exception using
        errcode = '55000',
        message = 'Published step executions must match their assignment, wafer, and process version.';
    end if;

    decision_target_authorized := public.checkpoint_decision_targets_step(
      assignment.id,
      execution_step.id
    );

    if decision_target_authorized then
      if new.status not in ('queued', 'redo_required') then
        raise exception using
          errcode = '55000',
          message = 'A checkpoint decision can create only its queued or redo-required target execution.';
      end if;
    elsif execution_step.step_order = current_step.step_order then
      if new.status <> 'queued' then
        raise exception using
          errcode = '55000',
          message = 'The current published step execution must begin queued.';
      end if;
    elsif execution_step.step_order > current_step.step_order then
      if new.status <> 'pending' then
        raise exception using
          errcode = '55000',
          message = 'Future published step executions must begin pending.';
      end if;
    else
      raise exception using
        errcode = '55000',
        message = 'A new published execution cannot be inserted behind the assignment checkpoint.';
    end if;

    return new;
  end if;

  if new.status is distinct from old.status
     and new.process_step_id is distinct from assignment.current_step_id
     and not public.checkpoint_transition_is_authorized(new.assignment_id, new.id) then
    raise exception using
      errcode = '55000',
      message = 'Only the assignment current step can be worked before a checkpoint decision.';
  end if;

  if new.status is distinct from old.status
     and (
       new.status in ('awaiting_checkpoint', 'completed', 'redo_required')
       or old.status in ('awaiting_checkpoint', 'completed')
     )
     and not public.checkpoint_transition_is_authorized(new.assignment_id, new.id) then
    raise exception using
      errcode = '55000',
      message = 'Published workflow status changes require an explicit checkpoint action.';
  end if;

  return new;
end;
$$;

drop trigger if exists step_executions_checkpoint_transition on public.step_executions;
create trigger step_executions_checkpoint_transition
  before insert or update on public.step_executions
  for each row execute function public.enforce_checkpoint_execution_transition();

create or replace function public.enforce_checkpoint_assignment_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  template_status text;
begin
  if new.wafer_id is distinct from old.wafer_id
     or new.template_id is distinct from old.template_id then
    raise exception using
      errcode = '55000',
      message = 'Published assignment identity is immutable.';
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
    if not public.checkpoint_transition_is_authorized(new.id, null) then
      raise exception using
        errcode = '55000',
        message = 'Published workflows advance or complete only through an explicit checkpoint decision.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists wafer_assignments_checkpoint_transition on public.wafer_process_assignments;
create trigger wafer_assignments_checkpoint_transition
  before update on public.wafer_process_assignments
  for each row execute function public.enforce_checkpoint_assignment_transition();

alter table public.process_step_attempts enable row level security;
alter table public.checkpoint_decisions enable row level security;
alter table public.checkpoint_submission_withdrawals enable row level security;

drop policy if exists "project access controls checkpoint attempts" on public.process_step_attempts;
create policy "project access controls checkpoint attempts"
  on public.process_step_attempts for select
  using (public.can_access_wafer(wafer_id));

drop policy if exists "project access controls checkpoint decisions" on public.checkpoint_decisions;
create policy "project access controls checkpoint decisions"
  on public.checkpoint_decisions for select
  using (public.can_access_wafer(wafer_id));

drop policy if exists "project access controls checkpoint withdrawals" on public.checkpoint_submission_withdrawals;
create policy "project access controls checkpoint withdrawals"
  on public.checkpoint_submission_withdrawals for select
  using (public.can_access_wafer(wafer_id));

revoke insert, update, delete on public.process_step_attempts from anon, authenticated;
revoke insert, update, delete on public.checkpoint_decisions from anon, authenticated;
revoke insert, update, delete on public.checkpoint_submission_withdrawals from anon, authenticated;
grant select on public.process_step_attempts to authenticated;
grant select on public.checkpoint_decisions to authenticated;
grant select on public.checkpoint_submission_withdrawals to authenticated;

revoke execute on function public.duplicate_process_template_version(uuid, text, text) from public;
revoke execute on function public.publish_process_template_version(uuid) from public;
revoke execute on function public.normalize_draft_process_step_order(uuid, uuid, integer) from public;
revoke execute on function public.create_ordered_draft_process_step(uuid, integer, text, text, text, uuid, integer, integer, text, boolean, text, jsonb, integer, integer) from public;
revoke execute on function public.archive_draft_process_step(uuid) from public;
revoke execute on function public.assign_draft_process_step_reviewer(uuid, uuid) from public;
revoke execute on function public.submit_step_checkpoint(uuid, uuid, text, jsonb) from public;
revoke execute on function public.withdraw_step_checkpoint_submission(uuid, uuid, text) from public;
revoke execute on function public.review_step_checkpoint(uuid, text, uuid, text) from public;
revoke execute on function public.checkpoint_actor_name(uuid) from public, anon, authenticated;
revoke execute on function public.checkpoint_reviewer_can_edit_project(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.checkpoint_step_is_dicing(text, text, text) from public, anon, authenticated;
revoke execute on function public.checkpoint_dicing_child_is_authorized(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.checkpoint_transition_is_authorized(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.checkpoint_decision_targets_step(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.reconcile_dicing_checkpoint_split(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.enforce_checkpoint_execution_transition() from public, anon, authenticated;
revoke execute on function public.enforce_checkpoint_assignment_transition() from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.claim_wafer_assignment_move(uuid,uuid,uuid)') is not null then
    execute 'revoke execute on function public.claim_wafer_assignment_move(uuid, uuid, uuid) from public, anon, authenticated';
  end if;
end;
$$;

grant execute on function public.duplicate_process_template_version(uuid, text, text) to authenticated;
grant execute on function public.publish_process_template_version(uuid) to authenticated;
grant execute on function public.normalize_draft_process_step_order(uuid, uuid, integer) to authenticated;
grant execute on function public.create_ordered_draft_process_step(uuid, integer, text, text, text, uuid, integer, integer, text, boolean, text, jsonb, integer, integer) to authenticated;
grant execute on function public.archive_draft_process_step(uuid) to authenticated;
grant execute on function public.assign_draft_process_step_reviewer(uuid, uuid) to authenticated;
grant execute on function public.submit_step_checkpoint(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.withdraw_step_checkpoint_submission(uuid, uuid, text) to authenticated;
grant execute on function public.review_step_checkpoint(uuid, text, uuid, text) to authenticated;
grant execute on function public.reconcile_dicing_checkpoint_split(uuid, uuid[]) to authenticated;

alter table public.process_step_attempts replica identity full;
alter table public.checkpoint_decisions replica identity full;
alter table public.checkpoint_submission_withdrawals replica identity full;

do $$
declare
  relation_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach relation_name in array array[
      'process_step_attempts',
      'checkpoint_decisions',
      'checkpoint_submission_withdrawals'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = relation_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', relation_name);
      end if;
    end loop;
  end if;
end
$$;
