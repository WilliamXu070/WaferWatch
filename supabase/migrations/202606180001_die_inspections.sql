create table if not exists public.die_inspections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  wafer_id uuid not null references public.wafers(id) on delete cascade,
  die_code text not null,
  x_ratio numeric not null check (x_ratio >= 0 and x_ratio <= 1),
  y_ratio numeric not null check (y_ratio >= 0 and y_ratio <= 1),
  image_bucket text not null default 'wafer-process-files',
  image_path text not null,
  image_mime_type text not null,
  image_size_bytes integer not null,
  image_file_name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists die_inspections_wafer_die_idx
  on public.die_inspections (wafer_id, die_code, created_at desc);

alter table public.die_inspections enable row level security;

drop policy if exists "project members can read die inspections" on public.die_inspections;
create policy "project members can read die inspections"
  on public.die_inspections for select
  using (public.can_access_project(project_id));

drop policy if exists "project editors can insert die inspections" on public.die_inspections;
create policy "project editors can insert die inspections"
  on public.die_inspections for insert
  with check (
    public.can_edit_project(project_id)
    and public.can_access_wafer(wafer_id)
  );

drop policy if exists "project editors can update die inspections" on public.die_inspections;
create policy "project editors can update die inspections"
  on public.die_inspections for update
  using (public.can_edit_project(project_id))
  with check (
    public.can_edit_project(project_id)
    and public.can_access_wafer(wafer_id)
  );

drop policy if exists "project editors can delete die inspections" on public.die_inspections;
create policy "project editors can delete die inspections"
  on public.die_inspections for delete
  using (public.can_edit_project(project_id));
