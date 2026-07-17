-- Expose the stable wafer/die identity currently stored in metadata as indexed,
-- read-only columns. Generated columns keep legacy writers compatible while the
-- application migrates its read paths away from JSON scans.

alter table public.wafers
  add column if not exists item_type text generated always as (
    case
      when nullif(trim(metadata ->> 'parent_wafer_id'), '') is not null then 'die'
      else 'wafer'
    end
  ) stored,
  add column if not exists parent_wafer_id uuid generated always as (
    case
      when metadata ->> 'parent_wafer_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (metadata ->> 'parent_wafer_id')::uuid
      else null
    end
  ) stored,
  add column if not exists die_label text generated always as (
    coalesce(
      nullif(trim(metadata ->> 'current_die'), ''),
      nullif(trim(metadata ->> 'die'), ''),
      nullif(trim(metadata ->> 'chip'), ''),
      nullif(trim(metadata ->> 'chip_id'), ''),
      nullif(trim(metadata ->> 'die_id'), '')
    )
  ) stored,
  add column if not exists wafer_family text generated always as (
    upper(coalesce(
      nullif(trim(metadata ->> 'wafer_family'), ''),
      nullif(trim(metadata ->> 'family'), ''),
      trim(wafer_code)
    ))
  ) stored,
  add column if not exists die_count integer generated always as (
    case
      when jsonb_typeof(metadata -> 'die_count') = 'number'
       and metadata ->> 'die_count' ~ '^[0-9]+$'
        then least(256, greatest(0, (metadata ->> 'die_count')::integer))
      else null
    end
  ) stored;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.wafers'::regclass
      and conname = 'wafers_item_type_check'
  ) then
    alter table public.wafers
      add constraint wafers_item_type_check check (item_type in ('wafer', 'die'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.wafers'::regclass
      and conname = 'wafers_parent_wafer_id_fkey'
  ) then
    alter table public.wafers
      add constraint wafers_parent_wafer_id_fkey
      foreign key (parent_wafer_id) references public.wafers(id) on delete cascade;
  end if;
end
$$;

create index if not exists wafers_parent_wafer_id_idx
  on public.wafers (parent_wafer_id)
  where parent_wafer_id is not null and deleted_at is null;

create index if not exists wafers_project_family_idx
  on public.wafers (project_id, wafer_family)
  where deleted_at is null;

create index if not exists wafers_project_die_label_idx
  on public.wafers (project_id, die_label)
  where die_label is not null and deleted_at is null;
