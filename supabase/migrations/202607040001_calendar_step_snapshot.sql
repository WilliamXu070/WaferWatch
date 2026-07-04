alter table public.process_calendar_events
  add column if not exists process_step_name_snapshot text;

update public.process_calendar_events event
set process_step_name_snapshot = step.name
from public.process_steps step
where event.process_step_id = step.id
  and (event.process_step_name_snapshot is null or length(trim(event.process_step_name_snapshot)) = 0);

alter table public.process_calendar_events
  drop constraint if exists process_calendar_events_has_action;

alter table public.process_calendar_events
  add constraint process_calendar_events_has_action check (
    process_step_id is not null
    or length(trim(coalesce(process_step_name_snapshot, ''))) > 0
    or length(trim(coalesce(manual_action, ''))) > 0
  );
