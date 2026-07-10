alter table public.process_people
  drop constraint if exists process_people_display_name_key;

create unique index if not exists process_people_profile_id_key
  on public.process_people(profile_id)
  where profile_id is not null;

create or replace function public.sync_profile_calendar_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  calendar_name text;
begin
  calendar_name := coalesce(
    nullif(trim(new.display_name), ''),
    nullif(trim(new.email), ''),
    'Process user'
  );

  insert into public.process_people (display_name, profile_id, is_active)
  values (calendar_name, new.id, new.is_active)
  on conflict (profile_id) where profile_id is not null
  do update set
    display_name = excluded.display_name,
    is_active = excluded.is_active;

  return new;
end;
$$;

drop trigger if exists profiles_sync_calendar_person on public.profiles;
create trigger profiles_sync_calendar_person
  after insert or update of display_name, email, is_active on public.profiles
  for each row execute function public.sync_profile_calendar_person();

insert into public.process_people (display_name, profile_id, is_active)
select
  coalesce(
    nullif(trim(profile.display_name), ''),
    nullif(trim(profile.email), ''),
    'Process user'
  ),
  profile.id,
  profile.is_active
from public.profiles as profile
on conflict (profile_id) where profile_id is not null
do update set
  display_name = excluded.display_name,
  is_active = excluded.is_active;
