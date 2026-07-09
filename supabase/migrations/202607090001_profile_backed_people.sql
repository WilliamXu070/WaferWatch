create or replace function public.can_view_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    target_profile_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1
      from public.project_members viewer_member
      join public.project_members target_member
        on target_member.project_id = viewer_member.project_id
      where viewer_member.user_id = auth.uid()
        and target_member.user_id = target_profile_id
    ),
    false
  )
$$;

drop policy if exists "profiles are visible to self and admins" on public.profiles;
create policy "profiles are visible to self admins and project teammates"
  on public.profiles for select
  using (public.can_view_profile(id));

update public.process_people
set is_active = false
where profile_id is null
  and lower(display_name) in ('adam', 'barbara', 'calvin', 'derik');
