-- Versioned, project-scoped persistence for the curated poling analysis catalog.
-- A completed import is immutable. A replacement catalog creates a new import,
-- and the read view exposes only the newest ready version for each project.

create table if not exists public.analysis_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  schema_version integer not null check (schema_version > 0),
  status text not null default 'importing'
    check (status in ('importing', 'ready', 'failed')),
  generated_at timestamptz,
  source_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_summary) = 'object'),
  record_count integer not null default 0 check (record_count >= 0),
  asset_count integer not null default 0 check (asset_count >= 0 and asset_count <= record_count),
  error_message text,
  imported_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analysis_imports_project_manifest_key unique (project_id, manifest_sha256),
  constraint analysis_imports_id_project_key unique (id, project_id),
  constraint analysis_imports_status_fields_check check (
    (status = 'importing' and completed_at is null and error_message is null)
    or (status = 'ready' and completed_at is not null and error_message is null)
    or (status = 'failed' and completed_at is not null and nullif(btrim(error_message), '') is not null)
  )
);

create table if not exists public.poling_analysis_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  import_id uuid not null,
  catalog_record_id text not null check (nullif(btrim(catalog_record_id), '') is not null),
  source_key text not null check (nullif(btrim(source_key), '') is not null),
  specimen_reference text not null check (nullif(btrim(specimen_reference), '') is not null),
  die_label text not null check (die_label ~ '^R[0-9]+C[0-9]+$'),
  voltage numeric not null check (voltage >= 0),
  pulse_width_ms numeric not null check (pulse_width_ms >= 0),
  pulse_count integer not null check (pulse_count >= 0),
  post_pulse_voltage numeric not null check (post_pulse_voltage >= 0),
  post_pulse_width_ms numeric not null check (post_pulse_width_ms >= 0),
  image_path text,
  image_sha256 text,
  source_file text not null check (nullif(btrim(source_file), '') is not null),
  source_slide integer check (source_slide is null or source_slide > 0),
  source_image_label text,
  source_appearances jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_appearances) = 'array'),
  parameter_source jsonb not null default '{}'::jsonb
    check (jsonb_typeof(parameter_source) = 'object'),
  workbook_provenance jsonb
    check (workbook_provenance is null or jsonb_typeof(workbook_provenance) = 'object'),
  confidence text not null check (nullif(btrim(confidence), '') is not null),
  flags jsonb not null default '[]'::jsonb check (jsonb_typeof(flags) = 'array'),
  replicate_index integer not null default 1 check (replicate_index > 0),
  replicate_count integer not null default 1
    check (replicate_count > 0 and replicate_index <= replicate_count),
  display_order integer not null check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint poling_analysis_records_import_project_fkey
    foreign key (import_id, project_id)
    references public.analysis_imports(id, project_id)
    on delete cascade,
  constraint poling_analysis_records_import_source_key unique (import_id, source_key),
  constraint poling_analysis_records_import_catalog_record_key
    unique (import_id, catalog_record_id),
  constraint poling_analysis_records_image_fields_check check (
    (image_path is null and image_sha256 is null)
    or (
      nullif(btrim(image_path), '') is not null
      and image_sha256 ~ '^[0-9a-f]{64}$'
    )
  )
);

create index if not exists analysis_imports_latest_ready_idx
  on public.analysis_imports (project_id, completed_at desc, created_at desc, id desc)
  where status = 'ready';

create index if not exists poling_analysis_records_import_order_idx
  on public.poling_analysis_records (import_id, display_order, id);

create index if not exists poling_analysis_records_project_specimen_die_idx
  on public.poling_analysis_records (project_id, specimen_reference, die_label, display_order);

drop trigger if exists analysis_imports_set_updated_at on public.analysis_imports;
create trigger analysis_imports_set_updated_at
  before update on public.analysis_imports
  for each row execute function public.set_updated_at();

drop trigger if exists poling_analysis_records_set_updated_at on public.poling_analysis_records;
create trigger poling_analysis_records_set_updated_at
  before update on public.poling_analysis_records
  for each row execute function public.set_updated_at();

create or replace function public.protect_ready_analysis_import()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stored_record_count integer;
  stored_asset_count integer;
begin
  if old.status = 'ready' then
    raise exception using
      errcode = '55000',
      message = 'Ready analysis imports are immutable; create a new manifest import.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.status = 'ready' then
    if old.status <> 'importing' then
      raise exception using
        errcode = '55000',
        message = 'Only an importing analysis manifest can become ready.';
    end if;
    select count(*)::integer, count(record.image_path)::integer
    into stored_record_count, stored_asset_count
    from public.poling_analysis_records record
    where record.import_id = old.id;
    if new.record_count <> stored_record_count or new.asset_count <> stored_asset_count then
      raise exception using
        errcode = '23514',
        message = format(
          'Ready analysis import counts do not match stored records (%s records, %s assets).',
          stored_record_count,
          stored_asset_count
        );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists analysis_imports_protect_ready on public.analysis_imports;
create trigger analysis_imports_protect_ready
  before update or delete on public.analysis_imports
  for each row execute function public.protect_ready_analysis_import();

create or replace function public.protect_ready_analysis_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_import_id uuid;
  target_status text;
begin
  target_import_id := case when tg_op = 'INSERT' then new.import_id else old.import_id end;
  select analysis_import.status into target_status
  from public.analysis_imports analysis_import
  where analysis_import.id = target_import_id;

  if target_status = 'ready' then
    raise exception using
      errcode = '55000',
      message = 'Records in a ready analysis import are immutable.';
  end if;

  if tg_op = 'UPDATE' and new.import_id is distinct from old.import_id then
    select analysis_import.status into target_status
    from public.analysis_imports analysis_import
    where analysis_import.id = new.import_id;
    if target_status = 'ready' then
      raise exception using
        errcode = '55000',
        message = 'Records cannot be moved into a ready analysis import.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists poling_analysis_records_protect_ready on public.poling_analysis_records;
create trigger poling_analysis_records_protect_ready
  before insert or update or delete on public.poling_analysis_records
  for each row execute function public.protect_ready_analysis_record();

alter table public.analysis_imports enable row level security;
alter table public.poling_analysis_records enable row level security;

drop policy if exists analysis_imports_select on public.analysis_imports;
create policy analysis_imports_select on public.analysis_imports
  for select to authenticated
  using (public.can_access_project(project_id));

drop policy if exists analysis_imports_insert on public.analysis_imports;
create policy analysis_imports_insert on public.analysis_imports
  for insert to authenticated
  with check (public.can_edit_project(project_id));

drop policy if exists analysis_imports_update on public.analysis_imports;
create policy analysis_imports_update on public.analysis_imports
  for update to authenticated
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

drop policy if exists analysis_imports_delete on public.analysis_imports;
create policy analysis_imports_delete on public.analysis_imports
  for delete to authenticated
  using (public.can_edit_project(project_id));

drop policy if exists poling_analysis_records_select on public.poling_analysis_records;
create policy poling_analysis_records_select on public.poling_analysis_records
  for select to authenticated
  using (public.can_access_project(project_id));

drop policy if exists poling_analysis_records_insert on public.poling_analysis_records;
create policy poling_analysis_records_insert on public.poling_analysis_records
  for insert to authenticated
  with check (public.can_edit_project(project_id));

drop policy if exists poling_analysis_records_update on public.poling_analysis_records;
create policy poling_analysis_records_update on public.poling_analysis_records
  for update to authenticated
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

drop policy if exists poling_analysis_records_delete on public.poling_analysis_records;
create policy poling_analysis_records_delete on public.poling_analysis_records
  for delete to authenticated
  using (public.can_edit_project(project_id));

create or replace view public.vw_poling_analysis_latest_records
with (security_invoker = true)
as
with latest_ready_import as (
  select distinct on (analysis_import.project_id)
    analysis_import.id,
    analysis_import.project_id,
    analysis_import.manifest_sha256,
    analysis_import.completed_at
  from public.analysis_imports analysis_import
  where analysis_import.status = 'ready'
  order by
    analysis_import.project_id,
    analysis_import.completed_at desc,
    analysis_import.created_at desc,
    analysis_import.id desc
)
select
  record.*,
  latest.manifest_sha256,
  latest.completed_at as import_completed_at
from latest_ready_import latest
join public.poling_analysis_records record
  on record.import_id = latest.id
 and record.project_id = latest.project_id;

revoke all on public.analysis_imports from anon;
revoke all on public.poling_analysis_records from anon;
revoke all on public.vw_poling_analysis_latest_records from anon;
grant select, insert, update, delete on public.analysis_imports to authenticated;
grant select, insert, update, delete on public.poling_analysis_records to authenticated;
grant select on public.vw_poling_analysis_latest_records to authenticated;

revoke all on function public.protect_ready_analysis_import() from public, anon, authenticated;
revoke all on function public.protect_ready_analysis_record() from public, anon, authenticated;
