create table if not exists public.text_surfaces (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scope_type text not null,
  scope_key text not null,
  field_key text not null,
  value text not null default '',
  version integer not null default 1 check (version >= 1),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, scope_type, scope_key, field_key),
  constraint text_surfaces_scope_type_format check (scope_type ~ '^[a-z][a-z0-9_:-]{1,79}$'),
  constraint text_surfaces_field_key_format check (field_key ~ '^[a-z][a-z0-9_:-]{1,79}$'),
  constraint text_surfaces_scope_key_length check (length(scope_key) between 1 and 400),
  constraint text_surfaces_value_length check (length(value) <= 20000)
);

create index if not exists text_surfaces_project_scope_idx
  on public.text_surfaces (project_id, scope_type, scope_key);

alter table public.text_surfaces enable row level security;

drop policy if exists "project members can read text surfaces" on public.text_surfaces;
create policy "project members can read text surfaces"
  on public.text_surfaces for select
  using (public.can_access_project(project_id));

drop policy if exists "project editors can insert text surfaces" on public.text_surfaces;
create policy "project editors can insert text surfaces"
  on public.text_surfaces for insert
  with check (public.can_edit_project(project_id));

drop policy if exists "project editors can update text surfaces" on public.text_surfaces;
create policy "project editors can update text surfaces"
  on public.text_surfaces for update
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

drop policy if exists "project editors can delete text surfaces" on public.text_surfaces;
create policy "project editors can delete text surfaces"
  on public.text_surfaces for delete
  using (public.can_edit_project(project_id));
