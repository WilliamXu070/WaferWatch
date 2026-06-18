alter table public.die_inspections
  add column if not exists pattern_row integer not null default 1 check (pattern_row >= 1 and pattern_row <= 64),
  add column if not exists pattern_column integer not null default 1 check (pattern_column >= 1 and pattern_column <= 64);

create index if not exists die_inspections_wafer_die_cell_idx
  on public.die_inspections (wafer_id, die_code, pattern_row, pattern_column, created_at desc);
