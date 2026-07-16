alter table public.process_steps
  add column if not exists execution_mode text not null default 'main';

alter table public.process_steps
  drop constraint if exists process_steps_execution_mode_check;

alter table public.process_steps
  add constraint process_steps_execution_mode_check
  check (execution_mode in ('main', 'anytime'));

alter table public.wafer_process_assignments
  add column if not exists anytime_return_step_id uuid
  references public.process_steps(id) on delete set null;

create index if not exists wafer_process_assignments_anytime_return_step_idx
  on public.wafer_process_assignments (anytime_return_step_id)
  where anytime_return_step_id is not null;

create or replace function public.track_anytime_step_return_point()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_mode text;
  new_mode text;
begin
  if new.current_step_id is not distinct from old.current_step_id then
    return new;
  end if;

  select execution_mode into old_mode
  from public.process_steps
  where id = old.current_step_id;

  select execution_mode into new_mode
  from public.process_steps
  where id = new.current_step_id;

  if new_mode = 'anytime' and old_mode = 'main' then
    new.anytime_return_step_id := old.current_step_id;
  elsif new_mode = 'main' then
    new.anytime_return_step_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists wafer_assignment_track_anytime_return on public.wafer_process_assignments;
create trigger wafer_assignment_track_anytime_return
  before update of current_step_id on public.wafer_process_assignments
  for each row execute function public.track_anytime_step_return_point();

create or replace function public.annotate_anytime_process_movement()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  from_step_id uuid;
  to_step_id uuid;
  from_mode text;
  to_mode text;
begin
  if new.event_type not in ('wafer_step_moved', 'wafer_step_reverted', 'checkpoint_step_entered') then
    return new;
  end if;

  begin
    from_step_id := nullif(new.metadata ->> 'from_step_id', '')::uuid;
    to_step_id := coalesce(
      nullif(new.metadata ->> 'to_step_id', '')::uuid,
      nullif(new.metadata ->> 'target_step_id', '')::uuid
    );
  exception when invalid_text_representation then
    return new;
  end;

  select execution_mode into from_mode from public.process_steps where id = from_step_id;
  select execution_mode into to_mode from public.process_steps where id = to_step_id;

  if to_mode = 'anytime' and from_mode = 'main' then
    new.metadata := new.metadata || jsonb_build_object(
      'movement_kind', 'anytime_enter',
      'anytime_return_step_id', from_step_id
    );
  elsif from_mode = 'anytime' and to_mode = 'main' then
    new.metadata := new.metadata || jsonb_build_object(
      'movement_kind', 'anytime_return'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists process_events_annotate_anytime_movement on public.process_events;
create trigger process_events_annotate_anytime_movement
  before insert on public.process_events
  for each row execute function public.annotate_anytime_process_movement();

comment on column public.process_steps.execution_mode is
  'Main steps participate in the connected route. Anytime steps are disconnected optional procedures available between any approved stages.';

comment on column public.wafer_process_assignments.anytime_return_step_id is
  'The main-flow step interrupted by the current anytime-step excursion.';
