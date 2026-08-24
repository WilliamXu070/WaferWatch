-- Process-step creation may synthesize its non-executable stage container.
-- The trigger must cross process_stages RLS without widening direct table writes.

create or replace function public.ensure_process_step_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stage public.process_stages%rowtype;
  target_order integer;
begin
  if auth.uid() is not null and not exists (
    select 1
    from public.process_templates template
    where template.id = new.template_id
      and (
        public.can_manage_process_library()
        or (
          template.owner_project_id is not null
          and public.can_edit_project(template.owner_project_id)
        )
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'You cannot create a step in this process template.';
  end if;

  if new.stage_id is not null then
    if not exists (
      select 1
      from public.process_stages candidate
      where candidate.id = new.stage_id
        and candidate.template_id = new.template_id
    ) then
      raise exception using
        errcode = '22023',
        message = 'The selected process stage does not belong to this template.';
    end if;
    new.stage_step_order := coalesce(new.stage_step_order, 1);
    return new;
  end if;

  select * into stage
  from public.process_stages candidate
  where candidate.template_id = new.template_id
    and candidate.slug = new.slug
  order by candidate.archived_at nulls first
  limit 1;

  if stage.id is null then
    target_order := case
      when not exists (
        select 1 from public.process_stages candidate
        where candidate.template_id = new.template_id
          and candidate.stage_order = new.step_order
      ) then new.step_order
      else (
        select coalesce(max(candidate.stage_order), 0) + 1
        from public.process_stages candidate
        where candidate.template_id = new.template_id
      )
    end;

    insert into public.process_stages (
      template_id, name, slug, stage_order, canvas_x, canvas_y, archived_at
    ) values (
      new.template_id, new.name, new.slug, target_order,
      new.canvas_x, new.canvas_y, new.archived_at
    ) returning * into stage;
  end if;

  new.stage_id := stage.id;
  new.stage_step_order := coalesce(new.stage_step_order, 1);
  return new;
end;
$$;

comment on function public.ensure_process_step_stage() is
  'Creates a compatibility stage for an inserted executable step after explicitly validating template edit authority.';

notify pgrst, 'reload schema';
