alter table public.process_calendar_events
  add column if not exists wafer_id uuid references public.wafers(id) on delete set null;

create index if not exists process_calendar_events_wafer_idx
  on public.process_calendar_events(wafer_id);
