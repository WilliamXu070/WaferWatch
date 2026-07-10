create table public.team_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete restrict,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint team_messages_body_present check (char_length(trim(body)) between 1 and 4000)
);

create index team_messages_created_at_idx
  on public.team_messages(created_at desc, id desc);

create or replace function public.stamp_team_message_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_profile public.profiles%rowtype;
begin
  select *
  into author_profile
  from public.profiles
  where id = auth.uid()
    and is_active = true;

  if author_profile.id is null then
    raise exception 'An active authenticated profile is required to send team messages.';
  end if;

  new.author_id := author_profile.id;
  new.author_name := coalesce(
    nullif(trim(author_profile.display_name), ''),
    nullif(trim(author_profile.email), ''),
    'Process user'
  );

  return new;
end;
$$;

create trigger team_messages_stamp_author
  before insert on public.team_messages
  for each row execute function public.stamp_team_message_author();

alter table public.team_messages enable row level security;

create policy "active users can read team messages"
  on public.team_messages for select
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_active = true
    )
  );

create policy "active users can send team messages"
  on public.team_messages for insert
  with check (author_id = auth.uid());

alter publication supabase_realtime add table public.team_messages;
