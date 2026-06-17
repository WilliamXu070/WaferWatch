create table if not exists public.process_people (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique,
  profile_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint process_people_display_name_not_blank check (length(trim(display_name)) > 0)
);

create table if not exists public.process_calendar_events (
  id uuid primary key default gen_random_uuid(),
  process_template_id uuid not null references public.process_templates(id) on delete cascade,
  location text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  process_step_id uuid references public.process_steps(id) on delete set null,
  manual_action text,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint process_calendar_events_positive_duration check (ends_at > starts_at),
  constraint process_calendar_events_location_known check (location in ('McMaster', 'Waterloo', 'Toronto')),
  constraint process_calendar_events_has_action check (
    process_step_id is not null
    or length(trim(coalesce(manual_action, ''))) > 0
  )
);

create table if not exists public.process_calendar_event_people (
  event_id uuid not null references public.process_calendar_events(id) on delete cascade,
  person_id uuid not null references public.process_people(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, person_id)
);

create index if not exists process_calendar_events_template_time_idx
  on public.process_calendar_events(process_template_id, starts_at, ends_at);
create index if not exists process_calendar_event_people_person_idx
  on public.process_calendar_event_people(person_id);

drop trigger if exists process_people_set_updated_at on public.process_people;
create trigger process_people_set_updated_at before update on public.process_people
  for each row execute function public.set_updated_at();

drop trigger if exists process_calendar_events_set_updated_at on public.process_calendar_events;
create trigger process_calendar_events_set_updated_at before update on public.process_calendar_events
  for each row execute function public.set_updated_at();

alter table public.process_people enable row level security;
alter table public.process_calendar_events enable row level security;
alter table public.process_calendar_event_people enable row level security;

drop policy if exists "authenticated users can view process people" on public.process_people;
create policy "authenticated users can view process people"
  on public.process_people for select
  using (auth.uid() is not null and is_active);

drop policy if exists "process managers can manage process people" on public.process_people;
create policy "process managers can manage process people"
  on public.process_people for all
  using (public.can_manage_process_library())
  with check (public.can_manage_process_library());

drop policy if exists "users can view process calendar events" on public.process_calendar_events;
create policy "users can view process calendar events"
  on public.process_calendar_events for select
  using (
    exists (
      select 1
      from public.process_templates pt
      where pt.id = process_template_id
        and (
          pt.is_active
          or public.can_manage_process_library()
          or (pt.owner_project_id is not null and public.can_access_project(pt.owner_project_id))
        )
    )
  );

drop policy if exists "users can manage process calendar events" on public.process_calendar_events;
create policy "users can manage process calendar events"
  on public.process_calendar_events for all
  using (
    exists (
      select 1
      from public.process_templates pt
      where pt.id = process_template_id
        and (
          public.can_manage_process_library()
          or (pt.owner_project_id is null and pt.is_active and auth.uid() is not null)
          or (pt.owner_project_id is not null and public.can_edit_project(pt.owner_project_id))
        )
    )
  )
  with check (
    exists (
      select 1
      from public.process_templates pt
      where pt.id = process_template_id
        and (
          public.can_manage_process_library()
          or (pt.owner_project_id is null and pt.is_active and auth.uid() is not null)
          or (pt.owner_project_id is not null and public.can_edit_project(pt.owner_project_id))
        )
    )
  );

drop policy if exists "users can view process calendar people links" on public.process_calendar_event_people;
create policy "users can view process calendar people links"
  on public.process_calendar_event_people for select
  using (
    exists (
      select 1
      from public.process_calendar_events event
      where event.id = event_id
        and exists (
          select 1
          from public.process_templates pt
          where pt.id = event.process_template_id
            and (
              pt.is_active
              or public.can_manage_process_library()
              or (pt.owner_project_id is not null and public.can_access_project(pt.owner_project_id))
            )
        )
    )
  );

drop policy if exists "users can manage process calendar people links" on public.process_calendar_event_people;
create policy "users can manage process calendar people links"
  on public.process_calendar_event_people for all
  using (
    exists (
      select 1
      from public.process_calendar_events event
      where event.id = event_id
        and exists (
          select 1
          from public.process_templates pt
          where pt.id = event.process_template_id
            and (
              public.can_manage_process_library()
              or (pt.owner_project_id is null and pt.is_active and auth.uid() is not null)
              or (pt.owner_project_id is not null and public.can_edit_project(pt.owner_project_id))
            )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.process_calendar_events event
      where event.id = event_id
        and exists (
          select 1
          from public.process_templates pt
          where pt.id = event.process_template_id
            and (
              public.can_manage_process_library()
              or (pt.owner_project_id is null and pt.is_active and auth.uid() is not null)
              or (pt.owner_project_id is not null and public.can_edit_project(pt.owner_project_id))
            )
        )
    )
  );
