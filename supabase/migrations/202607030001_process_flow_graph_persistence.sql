alter table public.process_steps
  add column if not exists node_type text not null default 'procedure',
  add column if not exists canvas_x integer,
  add column if not exists canvas_y integer;

alter table public.process_steps
  drop constraint if exists process_steps_node_type_check;

alter table public.process_steps
  add constraint process_steps_node_type_check
  check (node_type in ('start', 'procedure', 'end'));

with ranked_steps as (
  select
    id,
    row_number() over (partition by template_id order by step_order, created_at, id) as step_rank,
    count(*) over (partition by template_id) as step_count
  from public.process_steps
)
update public.process_steps as process_step
set node_type = case
  when ranked_steps.step_rank = 1 then 'start'
  when ranked_steps.step_rank = ranked_steps.step_count then 'end'
  else 'procedure'
end
from ranked_steps
where ranked_steps.id = process_step.id
  and process_step.node_type = 'procedure';

create table if not exists public.process_step_transitions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.process_templates(id) on delete cascade,
  from_step_id uuid not null references public.process_steps(id) on delete cascade,
  to_step_id uuid not null references public.process_steps(id) on delete cascade,
  edge_type text not null default 'flow',
  label text,
  condition jsonb not null default '{}'::jsonb,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, from_step_id, to_step_id, edge_type),
  constraint process_step_transitions_edge_type_check check (edge_type in ('flow', 'return'))
);

create index if not exists process_step_transitions_template_priority_idx
  on public.process_step_transitions (template_id, priority, created_at);

create index if not exists process_step_transitions_from_idx
  on public.process_step_transitions (from_step_id);

create index if not exists process_step_transitions_to_idx
  on public.process_step_transitions (to_step_id);

with ordered_steps as (
  select
    template_id,
    id as from_step_id,
    lead(id) over (partition by template_id order by step_order, created_at, id) as to_step_id,
    row_number() over (partition by template_id order by step_order, created_at, id) as step_rank
  from public.process_steps
)
insert into public.process_step_transitions (
  template_id,
  from_step_id,
  to_step_id,
  edge_type,
  priority
)
select
  template_id,
  from_step_id,
  to_step_id,
  'flow',
  step_rank * 10
from ordered_steps
where to_step_id is not null
on conflict (template_id, from_step_id, to_step_id, edge_type) do nothing;

create or replace function public.validate_process_step_transition()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.process_steps
    where id = new.from_step_id
      and template_id = new.template_id
  ) then
    raise exception 'from_step_id must belong to transition template_id';
  end if;

  if not exists (
    select 1
    from public.process_steps
    where id = new.to_step_id
      and template_id = new.template_id
  ) then
    raise exception 'to_step_id must belong to transition template_id';
  end if;

  return new;
end;
$$;

drop trigger if exists process_step_transitions_validate on public.process_step_transitions;
create trigger process_step_transitions_validate
  before insert or update on public.process_step_transitions
  for each row execute function public.validate_process_step_transition();

drop trigger if exists process_step_transitions_set_updated_at on public.process_step_transitions;
create trigger process_step_transitions_set_updated_at before update on public.process_step_transitions
  for each row execute function public.set_updated_at();

alter table public.process_step_transitions enable row level security;

drop policy if exists "process transitions visible through templates" on public.process_step_transitions;
create policy "process transitions visible through templates"
  on public.process_step_transitions for select
  using (
    exists (
      select 1 from public.process_templates pt
      where pt.id = template_id
        and (
          pt.is_active
          or public.can_manage_process_library()
          or (pt.owner_project_id is not null and public.can_access_project(pt.owner_project_id))
        )
    )
  );

drop policy if exists "process transitions managed through templates" on public.process_step_transitions;
create policy "process transitions managed through templates"
  on public.process_step_transitions for all
  using (
    exists (
      select 1 from public.process_templates pt
      where pt.id = template_id
        and (
          public.can_manage_process_library()
          or (pt.owner_project_id is not null and public.can_edit_project(pt.owner_project_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.process_templates pt
      where pt.id = template_id
        and (
          public.can_manage_process_library()
          or (pt.owner_project_id is not null and public.can_edit_project(pt.owner_project_id))
        )
    )
  );
