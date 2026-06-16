create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'process_engineer', 'researcher', 'viewer');
create type public.project_member_role as enum ('owner', 'editor', 'viewer');
create type public.project_status as enum ('active', 'archived');
create type public.project_visibility as enum ('private', 'group');
create type public.fabrication_status as enum ('planned', 'queued', 'in_progress', 'on_hold', 'completed', 'scrapped');
create type public.step_status as enum ('pending', 'queued', 'running', 'blocked', 'completed', 'skipped', 'failed');
create type public.tool_status as enum ('available', 'maintenance', 'offline', 'reserved');
create type public.reservation_status as enum ('scheduled', 'cancelled', 'completed');
create type public.issue_severity as enum ('low', 'medium', 'high', 'critical');
create type public.issue_status as enum ('open', 'investigating', 'resolved', 'closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  role public.user_role not null default 'researcher',
  lab_group text not null default 'McMaster Quantum Photonic Group',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  owner_id uuid references public.profiles(id) on delete set null,
  visibility public.project_visibility not null default 'private',
  status public.project_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.project_member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.process_templates (
  id uuid primary key default gen_random_uuid(),
  owner_project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  version text not null default '1.0',
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_project_id, name, version)
);

create table public.process_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.process_templates(id) on delete cascade,
  step_order integer not null,
  name text not null,
  slug text not null,
  process_area text not null,
  expected_duration_minutes integer,
  queue_target_minutes integer,
  required_tool_type text,
  requires_recipe boolean not null default false,
  instructions text,
  parameters_schema jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, step_order),
  unique (template_id, slug),
  constraint process_steps_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.fabrication_tools (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tool_type text not null,
  location text,
  status public.tool_status not null default 'available',
  owner_profile_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid references public.fabrication_tools(id) on delete set null,
  process_step_id uuid references public.process_steps(id) on delete set null,
  name text not null,
  version text not null default '1.0',
  parameters jsonb not null default '{}'::jsonb,
  file_path text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tool_id, name, version)
);

create table public.wafer_lots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  lot_code text not null,
  substrate_material text,
  wafer_size_mm numeric(8, 2),
  status public.fabrication_status not null default 'planned',
  started_at timestamptz,
  target_completion_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, lot_code)
);

create table public.wafers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  lot_id uuid references public.wafer_lots(id) on delete set null,
  wafer_code text not null,
  material_stack text,
  diameter_mm numeric(8, 2),
  status public.fabrication_status not null default 'planned',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, wafer_code)
);

create table public.wafer_process_assignments (
  id uuid primary key default gen_random_uuid(),
  wafer_id uuid not null references public.wafers(id) on delete cascade,
  template_id uuid not null references public.process_templates(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  status public.fabrication_status not null default 'planned',
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table public.step_executions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.wafer_process_assignments(id) on delete cascade,
  wafer_id uuid not null references public.wafers(id) on delete cascade,
  process_step_id uuid not null references public.process_steps(id) on delete restrict,
  recipe_id uuid references public.recipes(id) on delete set null,
  tool_id uuid references public.fabrication_tools(id) on delete set null,
  status public.step_status not null default 'pending',
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  queue_started_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  operator_id uuid references public.profiles(id) on delete set null,
  run_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, process_step_id)
);

create table public.tool_reservations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  tool_id uuid not null references public.fabrication_tools(id) on delete cascade,
  step_execution_id uuid references public.step_executions(id) on delete set null,
  reserved_by uuid references public.profiles(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.reservation_status not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tool_reservations_positive_duration check (ends_at > starts_at)
);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  wafer_id uuid not null references public.wafers(id) on delete cascade,
  step_execution_id uuid references public.step_executions(id) on delete set null,
  measured_by uuid references public.profiles(id) on delete set null,
  measurement_type text not null,
  metric_name text not null,
  metric_value numeric,
  metric_unit text,
  measured_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  file_path text,
  created_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  wafer_id uuid references public.wafers(id) on delete cascade,
  step_execution_id uuid references public.step_executions(id) on delete set null,
  measurement_id uuid references public.measurements(id) on delete set null,
  bucket_name text not null,
  object_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket_name, object_path)
);

create table public.process_issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  wafer_id uuid references public.wafers(id) on delete set null,
  step_execution_id uuid references public.step_executions(id) on delete set null,
  reported_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  severity public.issue_severity not null default 'medium',
  status public.issue_status not null default 'open',
  title text not null,
  description text,
  resolution text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.process_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  wafer_id uuid references public.wafers(id) on delete cascade,
  step_execution_id uuid references public.step_executions(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  event_at timestamptz not null default now(),
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  entity_table text not null,
  entity_id uuid not null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index project_members_user_id_idx on public.project_members(user_id);
create index wafer_lots_project_id_idx on public.wafer_lots(project_id);
create index wafers_project_id_idx on public.wafers(project_id);
create index wafers_lot_id_idx on public.wafers(lot_id);
create index process_steps_template_order_idx on public.process_steps(template_id, step_order);
create index wafer_process_assignments_wafer_id_idx on public.wafer_process_assignments(wafer_id);
create index step_executions_wafer_status_idx on public.step_executions(wafer_id, status);
create index step_executions_assignment_idx on public.step_executions(assignment_id);
create index tool_reservations_tool_time_idx on public.tool_reservations(tool_id, starts_at, ends_at);
create index measurements_wafer_metric_idx on public.measurements(wafer_id, metric_name, measured_at desc);
create index process_events_wafer_time_idx on public.process_events(wafer_id, event_at desc);
create index process_issues_project_status_idx on public.process_issues(project_id, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger process_templates_set_updated_at before update on public.process_templates
  for each row execute function public.set_updated_at();
create trigger process_steps_set_updated_at before update on public.process_steps
  for each row execute function public.set_updated_at();
create trigger fabrication_tools_set_updated_at before update on public.fabrication_tools
  for each row execute function public.set_updated_at();
create trigger recipes_set_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();
create trigger wafer_lots_set_updated_at before update on public.wafer_lots
  for each row execute function public.set_updated_at();
create trigger wafers_set_updated_at before update on public.wafers
  for each row execute function public.set_updated_at();
create trigger step_executions_set_updated_at before update on public.step_executions
  for each row execute function public.set_updated_at();
create trigger tool_reservations_set_updated_at before update on public.tool_reservations
  for each row execute function public.set_updated_at();
create trigger process_issues_set_updated_at before update on public.process_issues
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active = true
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.can_manage_process_library()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin', 'process_engineer'), false)
$$;

create or replace function public.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_admin()
    or exists (
      select 1
      from public.projects p
      where p.id = target_project_id
        and p.visibility = 'group'
        and p.status = 'active'
    )
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = target_project_id
        and pm.user_id = auth.uid()
    ),
    false
  )
$$;

create or replace function public.can_edit_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_admin()
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = target_project_id
        and pm.user_id = auth.uid()
        and pm.role in ('owner', 'editor')
    )
    or exists (
      select 1
      from public.projects p
      where p.id = target_project_id
        and p.owner_id = auth.uid()
    ),
    false
  )
$$;

create or replace function public.can_access_wafer(target_wafer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.wafers w
      where w.id = target_wafer_id
        and public.can_access_project(w.project_id)
    ),
    false
  )
$$;

create or replace function public.can_access_step_execution(target_step_execution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.step_executions se
      join public.wafers w on w.id = se.wafer_id
      where se.id = target_step_execution_id
        and public.can_access_project(w.project_id)
    ),
    false
  )
$$;

create or replace function public.path_project_id(object_path text)
returns uuid
language plpgsql
immutable
as $$
declare
  first_segment text;
begin
  first_segment := split_part(object_path, '/', 1);
  return first_segment::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id uuid;
begin
  row_id := coalesce(new.id, old.id);

  insert into public.audit_events (
    actor_id,
    entity_table,
    entity_id,
    action,
    before_state,
    after_state
  )
  values (
    auth.uid(),
    tg_table_name,
    row_id,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create trigger audit_wafers after insert or update or delete on public.wafers
  for each row execute function public.audit_row_change();
create trigger audit_step_executions after insert or update or delete on public.step_executions
  for each row execute function public.audit_row_change();
create trigger audit_measurements after insert or update or delete on public.measurements
  for each row execute function public.audit_row_change();
create trigger audit_process_issues after insert or update or delete on public.process_issues
  for each row execute function public.audit_row_change();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.process_templates enable row level security;
alter table public.process_steps enable row level security;
alter table public.fabrication_tools enable row level security;
alter table public.recipes enable row level security;
alter table public.wafer_lots enable row level security;
alter table public.wafers enable row level security;
alter table public.wafer_process_assignments enable row level security;
alter table public.step_executions enable row level security;
alter table public.tool_reservations enable row level security;
alter table public.measurements enable row level security;
alter table public.attachments enable row level security;
alter table public.process_issues enable row level security;
alter table public.process_events enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles are visible to self and admins"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "admins can manage profiles"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "project members can view projects"
  on public.projects for select
  using (public.can_access_project(id));

create policy "authenticated users can create projects"
  on public.projects for insert
  with check (auth.uid() = owner_id);

create policy "project editors can update projects"
  on public.projects for update
  using (public.can_edit_project(id))
  with check (public.can_edit_project(id));

create policy "admins can delete projects"
  on public.projects for delete
  using (public.is_admin());

create policy "project members can view memberships"
  on public.project_members for select
  using (public.can_access_project(project_id));

create policy "project owners can manage memberships"
  on public.project_members for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

create policy "process templates readable by active users"
  on public.process_templates for select
  using (
    is_active
    or public.can_manage_process_library()
    or (owner_project_id is not null and public.can_access_project(owner_project_id))
  );

create policy "process managers can create shared templates"
  on public.process_templates for insert
  with check (
    public.can_manage_process_library()
    or (owner_project_id is not null and public.can_edit_project(owner_project_id))
  );

create policy "process managers can update templates"
  on public.process_templates for update
  using (
    public.can_manage_process_library()
    or (owner_project_id is not null and public.can_edit_project(owner_project_id))
  )
  with check (
    public.can_manage_process_library()
    or (owner_project_id is not null and public.can_edit_project(owner_project_id))
  );

create policy "process managers can delete templates"
  on public.process_templates for delete
  using (
    public.can_manage_process_library()
    or (owner_project_id is not null and public.can_edit_project(owner_project_id))
  );

create policy "process steps visible through templates"
  on public.process_steps for select
  using (
    exists (
      select 1 from public.process_templates pt
      where pt.id = template_id
        and (
          pt.is_active
          or public.can_manage_process_library()
          or (pt.owner_project_id is not null and public.can_access_project(pt.owner_project_id))
        )
    )
  );

create policy "process steps managed through templates"
  on public.process_steps for all
  using (
    exists (
      select 1 from public.process_templates pt
      where pt.id = template_id
        and (
          public.can_manage_process_library()
          or (pt.owner_project_id is not null and public.can_edit_project(pt.owner_project_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.process_templates pt
      where pt.id = template_id
        and (
          public.can_manage_process_library()
          or (pt.owner_project_id is not null and public.can_edit_project(pt.owner_project_id))
        )
    )
  );

create policy "authenticated users can view tools"
  on public.fabrication_tools for select
  using (auth.role() = 'authenticated');

create policy "process managers can manage tools"
  on public.fabrication_tools for all
  using (public.can_manage_process_library())
  with check (public.can_manage_process_library());

create policy "authenticated users can view recipes"
  on public.recipes for select
  using (auth.role() = 'authenticated');

create policy "process managers can manage recipes"
  on public.recipes for all
  using (public.can_manage_process_library())
  with check (public.can_manage_process_library());

create policy "project access controls wafer lots"
  on public.wafer_lots for select
  using (public.can_access_project(project_id));

create policy "project editors manage wafer lots"
  on public.wafer_lots for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

create policy "project access controls wafers"
  on public.wafers for select
  using (public.can_access_project(project_id));

create policy "project editors manage wafers"
  on public.wafers for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

create policy "project access controls process assignments"
  on public.wafer_process_assignments for select
  using (public.can_access_wafer(wafer_id));

create policy "project editors manage process assignments"
  on public.wafer_process_assignments for all
  using (
    exists (
      select 1 from public.wafers w
      where w.id = wafer_id
        and public.can_edit_project(w.project_id)
    )
  )
  with check (
    exists (
      select 1 from public.wafers w
      where w.id = wafer_id
        and public.can_edit_project(w.project_id)
    )
  );

create policy "project access controls step executions"
  on public.step_executions for select
  using (public.can_access_wafer(wafer_id));

create policy "project editors manage step executions"
  on public.step_executions for all
  using (
    exists (
      select 1 from public.wafers w
      where w.id = wafer_id
        and public.can_edit_project(w.project_id)
    )
  )
  with check (
    exists (
      select 1 from public.wafers w
      where w.id = wafer_id
        and public.can_edit_project(w.project_id)
    )
  );

create policy "project access controls reservations"
  on public.tool_reservations for select
  using (public.can_access_project(project_id));

create policy "project editors manage reservations"
  on public.tool_reservations for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

create policy "project access controls measurements"
  on public.measurements for select
  using (public.can_access_project(project_id));

create policy "project editors manage measurements"
  on public.measurements for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

create policy "project access controls attachments"
  on public.attachments for select
  using (public.can_access_project(project_id));

create policy "project editors manage attachments"
  on public.attachments for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

create policy "project access controls issues"
  on public.process_issues for select
  using (public.can_access_project(project_id));

create policy "project editors manage issues"
  on public.process_issues for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

create policy "project access controls events"
  on public.process_events for select
  using (public.can_access_project(project_id));

create policy "project editors create events"
  on public.process_events for insert
  with check (public.can_edit_project(project_id));

create policy "admins can view audit events"
  on public.audit_events for select
  using (public.is_admin());

create view public.vw_wafer_cycle_time
with (security_invoker = true)
as
select
  wpa.id as assignment_id,
  w.id as wafer_id,
  w.wafer_code,
  w.project_id,
  wpa.template_id,
  wpa.status,
  wpa.started_at,
  wpa.completed_at,
  case
    when wpa.started_at is null then null
    else extract(epoch from (coalesce(wpa.completed_at, now()) - wpa.started_at)) / 3600
  end as total_cycle_hours,
  count(se.id) filter (where se.status in ('completed', 'skipped'))::integer as completed_steps,
  count(se.id)::integer as total_steps
from public.wafer_process_assignments wpa
join public.wafers w on w.id = wpa.wafer_id
left join public.step_executions se on se.assignment_id = wpa.id
group by wpa.id, w.id;

create view public.vw_step_cycle_metrics
with (security_invoker = true)
as
select
  se.id as step_execution_id,
  w.project_id,
  w.id as wafer_id,
  w.wafer_code,
  ps.name as step_name,
  ps.process_area,
  se.status,
  case
    when se.queue_started_at is null then null
    else extract(epoch from (coalesce(se.started_at, now()) - se.queue_started_at)) / 60
  end as queue_minutes,
  case
    when se.started_at is null then null
    else extract(epoch from (coalesce(se.completed_at, now()) - se.started_at)) / 60
  end as run_minutes,
  ps.expected_duration_minutes,
  se.completed_at
from public.step_executions se
join public.wafers w on w.id = se.wafer_id
join public.process_steps ps on ps.id = se.process_step_id;

create view public.vw_wip_by_stage
with (security_invoker = true)
as
select
  w.project_id,
  ps.template_id,
  ps.process_area,
  ps.name as step_name,
  se.status,
  count(distinct w.id)::integer as wafer_count
from public.step_executions se
join public.wafers w on w.id = se.wafer_id
join public.process_steps ps on ps.id = se.process_step_id
where se.status in ('queued', 'running', 'blocked')
group by w.project_id, ps.template_id, ps.process_area, ps.name, se.status;

create view public.vw_tool_utilization_daily
with (security_invoker = true)
as
select
  ft.id as tool_id,
  ft.name as tool_name,
  date_trunc('day', tr.starts_at)::date as utilization_day,
  coalesce(sum(extract(epoch from (tr.ends_at - tr.starts_at)) / 60), 0)::numeric as reserved_minutes,
  coalesce(sum(
    case
      when se.started_at is not null and se.completed_at is not null
        then extract(epoch from (se.completed_at - se.started_at)) / 60
      else 0
    end
  ), 0)::numeric as completed_run_minutes
from public.fabrication_tools ft
left join public.tool_reservations tr on tr.tool_id = ft.id and tr.status <> 'cancelled'
left join public.step_executions se on se.id = tr.step_execution_id
group by ft.id, ft.name, date_trunc('day', tr.starts_at)::date;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('wafer-characterization', 'wafer-characterization', false, 52428800, array['text/csv', 'application/json', 'image/png', 'image/jpeg', 'image/tiff', 'application/pdf']),
  ('wafer-process-files', 'wafer-process-files', false, 52428800, array['text/csv', 'application/json', 'image/png', 'image/jpeg', 'application/pdf']),
  ('wafer-maps', 'wafer-maps', false, 52428800, array['text/csv', 'application/json', 'image/png', 'image/jpeg', 'application/pdf'])
on conflict (id) do nothing;

create policy "project members can read project storage"
  on storage.objects for select
  using (
    bucket_id in ('wafer-characterization', 'wafer-process-files', 'wafer-maps')
    and public.can_access_project(public.path_project_id(name))
  );

create policy "project editors can upload project storage"
  on storage.objects for insert
  with check (
    bucket_id in ('wafer-characterization', 'wafer-process-files', 'wafer-maps')
    and public.can_edit_project(public.path_project_id(name))
  );

create policy "project editors can update project storage"
  on storage.objects for update
  using (
    bucket_id in ('wafer-characterization', 'wafer-process-files', 'wafer-maps')
    and public.can_edit_project(public.path_project_id(name))
  )
  with check (
    bucket_id in ('wafer-characterization', 'wafer-process-files', 'wafer-maps')
    and public.can_edit_project(public.path_project_id(name))
  );

create policy "project editors can delete project storage"
  on storage.objects for delete
  using (
    bucket_id in ('wafer-characterization', 'wafer-process-files', 'wafer-maps')
    and public.can_edit_project(public.path_project_id(name))
  );

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage on all sequences in schema public to authenticated;
