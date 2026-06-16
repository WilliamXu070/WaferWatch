-- Idempotent repair migration for projects where the initial migration was only partially applied.
-- Safe to run after 202606150001_core_architecture.sql when tables/views exist but RPC helpers,
-- RLS policies, auth trigger, or storage buckets are missing.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
drop trigger if exists process_templates_set_updated_at on public.process_templates;
create trigger process_templates_set_updated_at before update on public.process_templates
  for each row execute function public.set_updated_at();
drop trigger if exists process_steps_set_updated_at on public.process_steps;
create trigger process_steps_set_updated_at before update on public.process_steps
  for each row execute function public.set_updated_at();
drop trigger if exists fabrication_tools_set_updated_at on public.fabrication_tools;
create trigger fabrication_tools_set_updated_at before update on public.fabrication_tools
  for each row execute function public.set_updated_at();
drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();
drop trigger if exists wafer_lots_set_updated_at on public.wafer_lots;
create trigger wafer_lots_set_updated_at before update on public.wafer_lots
  for each row execute function public.set_updated_at();
drop trigger if exists wafers_set_updated_at on public.wafers;
create trigger wafers_set_updated_at before update on public.wafers
  for each row execute function public.set_updated_at();
drop trigger if exists step_executions_set_updated_at on public.step_executions;
create trigger step_executions_set_updated_at before update on public.step_executions
  for each row execute function public.set_updated_at();
drop trigger if exists tool_reservations_set_updated_at on public.tool_reservations;
create trigger tool_reservations_set_updated_at before update on public.tool_reservations
  for each row execute function public.set_updated_at();
drop trigger if exists process_issues_set_updated_at on public.process_issues;
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

drop trigger if exists on_auth_user_created on auth.users;
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

drop trigger if exists audit_wafers on public.wafers;
create trigger audit_wafers after insert or update or delete on public.wafers
  for each row execute function public.audit_row_change();
drop trigger if exists audit_step_executions on public.step_executions;
create trigger audit_step_executions after insert or update or delete on public.step_executions
  for each row execute function public.audit_row_change();
drop trigger if exists audit_measurements on public.measurements;
create trigger audit_measurements after insert or update or delete on public.measurements
  for each row execute function public.audit_row_change();
drop trigger if exists audit_process_issues on public.process_issues;
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

drop policy if exists "profiles are visible to self and admins" on public.profiles;
create policy "profiles are visible to self and admins"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "admins can manage profiles" on public.profiles;
create policy "admins can manage profiles"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "project members can view projects" on public.projects;
create policy "project members can view projects"
  on public.projects for select
  using (public.can_access_project(id));

drop policy if exists "authenticated users can create projects" on public.projects;
create policy "authenticated users can create projects"
  on public.projects for insert
  with check (auth.uid() = owner_id);

drop policy if exists "project editors can update projects" on public.projects;
create policy "project editors can update projects"
  on public.projects for update
  using (public.can_edit_project(id))
  with check (public.can_edit_project(id));

drop policy if exists "admins can delete projects" on public.projects;
create policy "admins can delete projects"
  on public.projects for delete
  using (public.is_admin());

drop policy if exists "project members can view memberships" on public.project_members;
create policy "project members can view memberships"
  on public.project_members for select
  using (public.can_access_project(project_id));

drop policy if exists "project owners can manage memberships" on public.project_members;
create policy "project owners can manage memberships"
  on public.project_members for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

drop policy if exists "process templates readable by active users" on public.process_templates;
create policy "process templates readable by active users"
  on public.process_templates for select
  using (
    is_active
    or public.can_manage_process_library()
    or (owner_project_id is not null and public.can_access_project(owner_project_id))
  );

drop policy if exists "process managers can create shared templates" on public.process_templates;
create policy "process managers can create shared templates"
  on public.process_templates for insert
  with check (
    public.can_manage_process_library()
    or (owner_project_id is not null and public.can_edit_project(owner_project_id))
  );

drop policy if exists "process managers can update templates" on public.process_templates;
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

drop policy if exists "process managers can delete templates" on public.process_templates;
create policy "process managers can delete templates"
  on public.process_templates for delete
  using (
    public.can_manage_process_library()
    or (owner_project_id is not null and public.can_edit_project(owner_project_id))
  );

drop policy if exists "process steps visible through templates" on public.process_steps;
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

drop policy if exists "process steps managed through templates" on public.process_steps;
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

drop policy if exists "authenticated users can view tools" on public.fabrication_tools;
create policy "authenticated users can view tools"
  on public.fabrication_tools for select
  using (auth.role() = 'authenticated');

drop policy if exists "process managers can manage tools" on public.fabrication_tools;
create policy "process managers can manage tools"
  on public.fabrication_tools for all
  using (public.can_manage_process_library())
  with check (public.can_manage_process_library());

drop policy if exists "authenticated users can view recipes" on public.recipes;
create policy "authenticated users can view recipes"
  on public.recipes for select
  using (auth.role() = 'authenticated');

drop policy if exists "process managers can manage recipes" on public.recipes;
create policy "process managers can manage recipes"
  on public.recipes for all
  using (public.can_manage_process_library())
  with check (public.can_manage_process_library());

drop policy if exists "project access controls wafer lots" on public.wafer_lots;
create policy "project access controls wafer lots" on public.wafer_lots for select
  using (public.can_access_project(project_id));
drop policy if exists "project editors manage wafer lots" on public.wafer_lots;
create policy "project editors manage wafer lots" on public.wafer_lots for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

drop policy if exists "project access controls wafers" on public.wafers;
create policy "project access controls wafers" on public.wafers for select
  using (public.can_access_project(project_id));
drop policy if exists "project editors manage wafers" on public.wafers;
create policy "project editors manage wafers" on public.wafers for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

drop policy if exists "project access controls process assignments" on public.wafer_process_assignments;
create policy "project access controls process assignments"
  on public.wafer_process_assignments for select
  using (public.can_access_wafer(wafer_id));
drop policy if exists "project editors manage process assignments" on public.wafer_process_assignments;
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

drop policy if exists "project access controls step executions" on public.step_executions;
create policy "project access controls step executions" on public.step_executions for select
  using (public.can_access_wafer(wafer_id));
drop policy if exists "project editors manage step executions" on public.step_executions;
create policy "project editors manage step executions" on public.step_executions for all
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

drop policy if exists "project access controls reservations" on public.tool_reservations;
create policy "project access controls reservations" on public.tool_reservations for select
  using (public.can_access_project(project_id));
drop policy if exists "project editors manage reservations" on public.tool_reservations;
create policy "project editors manage reservations" on public.tool_reservations for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

drop policy if exists "project access controls measurements" on public.measurements;
create policy "project access controls measurements" on public.measurements for select
  using (public.can_access_project(project_id));
drop policy if exists "project editors manage measurements" on public.measurements;
create policy "project editors manage measurements" on public.measurements for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

drop policy if exists "project access controls attachments" on public.attachments;
create policy "project access controls attachments" on public.attachments for select
  using (public.can_access_project(project_id));
drop policy if exists "project editors manage attachments" on public.attachments;
create policy "project editors manage attachments" on public.attachments for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

drop policy if exists "project access controls issues" on public.process_issues;
create policy "project access controls issues" on public.process_issues for select
  using (public.can_access_project(project_id));
drop policy if exists "project editors manage issues" on public.process_issues;
create policy "project editors manage issues" on public.process_issues for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

drop policy if exists "project access controls events" on public.process_events;
create policy "project access controls events" on public.process_events for select
  using (public.can_access_project(project_id));
drop policy if exists "project editors create events" on public.process_events;
create policy "project editors create events" on public.process_events for insert
  with check (public.can_edit_project(project_id));

drop policy if exists "admins can view audit events" on public.audit_events;
create policy "admins can view audit events" on public.audit_events for select
  using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('wafer-characterization', 'wafer-characterization', false, 52428800, array['text/csv', 'application/json', 'image/png', 'image/jpeg', 'image/tiff', 'application/pdf']),
  ('wafer-process-files', 'wafer-process-files', false, 52428800, array['text/csv', 'application/json', 'image/png', 'image/jpeg', 'application/pdf']),
  ('wafer-maps', 'wafer-maps', false, 52428800, array['text/csv', 'application/json', 'image/png', 'image/jpeg', 'application/pdf'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "project members can read project storage" on storage.objects;
create policy "project members can read project storage"
  on storage.objects for select
  using (
    bucket_id in ('wafer-characterization', 'wafer-process-files', 'wafer-maps')
    and public.can_access_project(public.path_project_id(name))
  );

drop policy if exists "project editors can upload project storage" on storage.objects;
create policy "project editors can upload project storage"
  on storage.objects for insert
  with check (
    bucket_id in ('wafer-characterization', 'wafer-process-files', 'wafer-maps')
    and public.can_edit_project(public.path_project_id(name))
  );

drop policy if exists "project editors can update project storage" on storage.objects;
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

drop policy if exists "project editors can delete project storage" on storage.objects;
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

notify pgrst, 'reload schema';
