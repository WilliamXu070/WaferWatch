-- Researchers are lab-wide observers: they can read status data from every
-- active project without being granted project membership. Editing remains
-- governed exclusively by can_edit_project and the existing write policies.

create or replace function public.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_admin()
    or exists (
      select 1
      from public.projects project
      where project.id = target_project_id
        and project.status = 'active'
        and (
          public.current_user_role() = 'researcher'
          or project.visibility = 'group'
        )
    )
    or exists (
      select 1
      from public.project_members member
      where member.project_id = target_project_id
        and member.user_id = auth.uid()
    ),
    false
  )
$$;
