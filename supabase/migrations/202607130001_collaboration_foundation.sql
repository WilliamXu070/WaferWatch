-- Collaboration foundation: publish canonical workflow state and make the
-- highest-contention mutable surfaces atomic at the database boundary.

alter table public.process_calendar_events
  add column if not exists revision bigint not null default 1;

alter table public.process_steps
  add column if not exists revision bigint not null default 1;

alter table public.wafer_process_assignments
  add column if not exists current_step_id uuid references public.process_steps(id) on delete set null,
  add column if not exists revision bigint not null default 1;

alter table public.process_events
  add column if not exists client_mutation_id uuid;

create unique index if not exists process_events_client_mutation_id_idx
  on public.process_events (client_mutation_id)
  where client_mutation_id is not null;

update public.wafer_process_assignments assignment
set current_step_id = (
  select execution.process_step_id
  from public.step_executions execution
  where execution.assignment_id = assignment.id
    and execution.status in ('queued', 'running', 'blocked')
  order by
    case execution.status
      when 'running' then 1
      when 'blocked' then 2
      else 3
    end,
    execution.updated_at desc,
    execution.created_at desc
  limit 1
)
where assignment.current_step_id is null
  and exists (
    select 1
    from public.step_executions execution
    where execution.assignment_id = assignment.id
      and execution.status in ('queued', 'running', 'blocked')
  );

create or replace function public.bump_collaboration_revision()
returns trigger
language plpgsql
as $$
begin
  new.revision = old.revision + 1;
  return new;
end;
$$;

drop trigger if exists process_calendar_events_bump_revision on public.process_calendar_events;
create trigger process_calendar_events_bump_revision
  before update on public.process_calendar_events
  for each row execute function public.bump_collaboration_revision();

drop trigger if exists process_steps_bump_revision on public.process_steps;
create trigger process_steps_bump_revision
  before update on public.process_steps
  for each row execute function public.bump_collaboration_revision();

drop trigger if exists wafer_process_assignments_bump_revision on public.wafer_process_assignments;
create trigger wafer_process_assignments_bump_revision
  before update on public.wafer_process_assignments
  for each row execute function public.bump_collaboration_revision();

create or replace function public.claim_wafer_assignment_move(
  target_assignment_id uuid,
  expected_source_step_id uuid,
  next_step_id uuid
)
returns public.wafer_process_assignments
language plpgsql
security invoker
set search_path = public
as $$
declare
  assignment public.wafer_process_assignments%rowtype;
  derived_step_id uuid;
begin
  select *
  into assignment
  from public.wafer_process_assignments
  where id = target_assignment_id
  for update;

  if assignment.id is null then
    raise exception using errcode = 'P0002', message = 'The wafer assignment no longer exists.';
  end if;

  if assignment.current_step_id is null then
    select execution.process_step_id
    into derived_step_id
    from public.step_executions execution
    where execution.assignment_id = target_assignment_id
      and execution.status in ('queued', 'running', 'blocked')
    order by
      case execution.status
        when 'running' then 1
        when 'blocked' then 2
        else 3
      end,
      execution.updated_at desc,
      execution.created_at desc
    limit 1;
  else
    derived_step_id := assignment.current_step_id;
  end if;

  if derived_step_id is distinct from expected_source_step_id then
    raise exception using
      errcode = '40001',
      message = 'This wafer was moved by another collaborator. The latest process flow has been loaded.';
  end if;

  update public.wafer_process_assignments
  set current_step_id = next_step_id
  where id = target_assignment_id
  returning * into assignment;

  return assignment;
end;
$$;

create or replace function public.upsert_text_surface_versioned(
  target_project_id uuid,
  target_scope_type text,
  target_scope_key text,
  target_field_key text,
  next_value text,
  expected_version integer default null
)
returns public.text_surfaces
language plpgsql
security invoker
set search_path = public
as $$
declare
  surface public.text_surfaces%rowtype;
begin
  if not public.can_edit_project(target_project_id) then
    raise exception using errcode = '42501', message = 'You do not have permission to edit this project.';
  end if;

  insert into public.text_surfaces (
    project_id,
    scope_type,
    scope_key,
    field_key,
    value,
    updated_by
  )
  values (
    target_project_id,
    target_scope_type,
    target_scope_key,
    target_field_key,
    next_value,
    auth.uid()
  )
  on conflict (project_id, scope_type, scope_key, field_key) do nothing
  returning * into surface;

  if surface.id is not null then
    if expected_version is not null and expected_version not in (0, 1) then
      raise exception using errcode = '40001', message = 'This field changed before your save completed. Review the latest value and try again.';
    end if;
    return surface;
  end if;

  select *
  into surface
  from public.text_surfaces
  where project_id = target_project_id
    and scope_type = target_scope_type
    and scope_key = target_scope_key
    and field_key = target_field_key
  for update;

  if expected_version is not null and surface.version <> expected_version then
    raise exception using errcode = '40001', message = 'This field changed before your save completed. Review the latest value and try again.';
  end if;

  update public.text_surfaces
  set value = next_value,
      version = surface.version + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where id = surface.id
  returning * into surface;

  return surface;
end;
$$;

create or replace function public.mutate_text_surface_json_array(
  target_project_id uuid,
  target_scope_type text,
  target_scope_key text,
  target_field_key text,
  operation text,
  item_id text,
  item jsonb default null
)
returns public.text_surfaces
language plpgsql
security invoker
set search_path = public
as $$
declare
  surface public.text_surfaces%rowtype;
  current_items jsonb := '[]'::jsonb;
  next_items jsonb;
  item_exists boolean;
begin
  if not public.can_edit_project(target_project_id) then
    raise exception using errcode = '42501', message = 'You do not have permission to edit this project.';
  end if;

  if operation not in ('add', 'update', 'delete') then
    raise exception using errcode = '22023', message = 'Unsupported JSON array mutation.';
  end if;

  if item_id is null or length(trim(item_id)) = 0 then
    raise exception using errcode = '22023', message = 'A stable item id is required.';
  end if;

  insert into public.text_surfaces (
    project_id,
    scope_type,
    scope_key,
    field_key,
    value,
    updated_by
  )
  values (
    target_project_id,
    target_scope_type,
    target_scope_key,
    target_field_key,
    '[]',
    auth.uid()
  )
  on conflict (project_id, scope_type, scope_key, field_key) do nothing;

  select *
  into surface
  from public.text_surfaces
  where project_id = target_project_id
    and scope_type = target_scope_type
    and scope_key = target_scope_key
    and field_key = target_field_key
  for update;

  begin
    current_items := surface.value::jsonb;
    if jsonb_typeof(current_items) <> 'array' then
      current_items := '[]'::jsonb;
    end if;
  exception when others then
    current_items := '[]'::jsonb;
  end;

  select exists (
    select 1
    from jsonb_array_elements(current_items) existing_item
    where existing_item->>'id' = item_id
  ) into item_exists;

  if operation = 'add' then
    if item is null or item->>'id' is distinct from item_id then
      raise exception using errcode = '22023', message = 'The note payload must contain the matching stable id.';
    end if;

    select coalesce(jsonb_agg(existing_item order by ordinal), '[]'::jsonb)
    into next_items
    from jsonb_array_elements(current_items) with ordinality entries(existing_item, ordinal)
    where existing_item->>'id' is distinct from item_id;

    next_items := next_items || jsonb_build_array(item);
  elsif operation = 'update' then
    if not item_exists then
      raise exception using errcode = '40001', message = 'This note was changed or deleted by another collaborator.';
    end if;
    if item is null or item->>'id' is distinct from item_id then
      raise exception using errcode = '22023', message = 'The note payload must contain the matching stable id.';
    end if;

    select coalesce(
      jsonb_agg(case when existing_item->>'id' = item_id then item else existing_item end order by ordinal),
      '[]'::jsonb
    )
    into next_items
    from jsonb_array_elements(current_items) with ordinality entries(existing_item, ordinal);
  else
    select coalesce(jsonb_agg(existing_item order by ordinal), '[]'::jsonb)
    into next_items
    from jsonb_array_elements(current_items) with ordinality entries(existing_item, ordinal)
    where existing_item->>'id' is distinct from item_id;
  end if;

  update public.text_surfaces
  set value = next_items::text,
      version = surface.version + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where id = surface.id
  returning * into surface;

  return surface;
end;
$$;

create or replace function public.patch_wafer_die_poling_parameters(
  target_wafer_id uuid,
  target_die_code text,
  updates jsonb
)
returns public.wafers
language plpgsql
security invoker
set search_path = public
as $$
declare
  wafer public.wafers%rowtype;
  next_metadata jsonb;
  update_item jsonb;
  value_path text[];
  current_value text;
  expected_value text;
  next_value text;
begin
  select *
  into wafer
  from public.wafers
  where id = target_wafer_id
  for update;

  if wafer.id is null then
    raise exception using errcode = 'P0002', message = 'The wafer no longer exists.';
  end if;

  if not public.can_edit_project(wafer.project_id) then
    raise exception using errcode = '42501', message = 'You do not have permission to edit this wafer.';
  end if;

  if jsonb_typeof(updates) <> 'array' then
    raise exception using errcode = '22023', message = 'Parameter updates must be an array.';
  end if;

  next_metadata := coalesce(wafer.metadata, '{}'::jsonb);
  for update_item in select value from jsonb_array_elements(updates)
  loop
    next_metadata := jsonb_set(
      next_metadata,
      '{die_poling_parameters}',
      case
        when jsonb_typeof(next_metadata->'die_poling_parameters') = 'object'
          then next_metadata->'die_poling_parameters'
        else '{}'::jsonb
      end,
      true
    );
    next_metadata := jsonb_set(
      next_metadata,
      array['die_poling_parameters', target_die_code],
      case
        when jsonb_typeof(next_metadata#>array['die_poling_parameters', target_die_code]) = 'object'
          then next_metadata#>array['die_poling_parameters', target_die_code]
        else '{}'::jsonb
      end,
      true
    );
    next_metadata := jsonb_set(
      next_metadata,
      array['die_poling_parameters', target_die_code, 'R' || (update_item->>'row')],
      case
        when jsonb_typeof(next_metadata#>array['die_poling_parameters', target_die_code, 'R' || (update_item->>'row')]) = 'object'
          then next_metadata#>array['die_poling_parameters', target_die_code, 'R' || (update_item->>'row')]
        else '{}'::jsonb
      end,
      true
    );
    next_metadata := jsonb_set(
      next_metadata,
      array[
        'die_poling_parameters',
        target_die_code,
        'R' || (update_item->>'row'),
        'C' || (update_item->>'column')
      ],
      case
        when jsonb_typeof(next_metadata#>array[
          'die_poling_parameters',
          target_die_code,
          'R' || (update_item->>'row'),
          'C' || (update_item->>'column')
        ]) = 'object'
          then next_metadata#>array[
            'die_poling_parameters',
            target_die_code,
            'R' || (update_item->>'row'),
            'C' || (update_item->>'column')
          ]
        else '{}'::jsonb
      end,
      true
    );
    value_path := array[
      'die_poling_parameters',
      target_die_code,
      'R' || (update_item->>'row'),
      'C' || (update_item->>'column'),
      update_item->>'field'
    ];
    current_value := coalesce(next_metadata #>> value_path, '');

    if update_item ? 'expectedValue' then
      expected_value := coalesce(update_item->>'expectedValue', '');
      if current_value is distinct from expected_value then
        raise exception using
          errcode = '40001',
          message = format(
            'Parameter %s changed from %s to %s before your save completed.',
            update_item->>'field',
            expected_value,
            current_value
          );
      end if;
    end if;

    next_value := coalesce(update_item->>'value', '');
    if length(trim(next_value)) = 0 then
      next_metadata := next_metadata #- value_path;
    else
      next_metadata := jsonb_set(next_metadata, value_path, to_jsonb(next_value), true);
    end if;
  end loop;

  next_metadata := jsonb_set(next_metadata, '{die_poling_parameter_updated_by}', to_jsonb(auth.uid()::text), true);
  next_metadata := jsonb_set(next_metadata, '{die_poling_parameter_updated_at}', to_jsonb(now()::text), true);

  update public.wafers
  set metadata = next_metadata
  where id = target_wafer_id
  returning * into wafer;

  return wafer;
end;
$$;

create or replace function public.update_process_step_positions_versioned(
  position_updates jsonb
)
returns setof public.process_steps
language plpgsql
security invoker
set search_path = public
as $$
declare
  position_update jsonb;
  step public.process_steps%rowtype;
begin
  if jsonb_typeof(position_updates) <> 'array' then
    raise exception using errcode = '22023', message = 'Position updates must be an array.';
  end if;

  for position_update in
    select value
    from jsonb_array_elements(position_updates)
    order by value->>'stepId'
  loop
    select *
    into step
    from public.process_steps
    where id = (position_update->>'stepId')::uuid
    for update;

    if step.id is null then
      raise exception using errcode = 'P0002', message = 'A selected process step no longer exists.';
    end if;

    if step.canvas_x is distinct from (position_update->>'expectedCanvasX')::integer
      or step.canvas_y is distinct from (position_update->>'expectedCanvasY')::integer then
      raise exception using
        errcode = '40001',
        message = format('Process step %s was moved by another collaborator.', step.name);
    end if;
  end loop;

  for position_update in select value from jsonb_array_elements(position_updates)
  loop
    update public.process_steps
    set canvas_x = (position_update->>'canvasX')::integer,
        canvas_y = (position_update->>'canvasY')::integer
    where id = (position_update->>'stepId')::uuid;
  end loop;

  return query
    select process_step.*
    from public.process_steps process_step
    where process_step.id in (
      select (value->>'stepId')::uuid
      from jsonb_array_elements(position_updates)
    );
end;
$$;

alter table public.process_calendar_events replica identity full;
alter table public.process_calendar_event_people replica identity full;
alter table public.process_steps replica identity full;
alter table public.process_step_transitions replica identity full;
alter table public.wafer_process_assignments replica identity full;
alter table public.step_executions replica identity full;
alter table public.wafers replica identity full;
alter table public.process_events replica identity full;
alter table public.text_surfaces replica identity full;
alter table public.die_inspections replica identity full;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'process_calendar_events',
    'process_calendar_event_people',
    'process_templates',
    'process_steps',
    'process_step_transitions',
    'wafer_process_assignments',
    'step_executions',
    'wafers',
    'process_events',
    'text_surfaces',
    'die_inspections'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
