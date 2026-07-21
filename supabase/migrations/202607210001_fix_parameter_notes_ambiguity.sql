-- Keep the public RPC signature while disambiguating its notes input from
-- process_events.notes under production PL/pgSQL conflict handling.

create or replace function public.save_step_parameter_records_batch(
  entries jsonb,
  global_values jsonb,
  local_parameters jsonb,
  notes text default null
)
returns setof public.step_parameter_records
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict error
declare
  actor_role public.user_role;
  target_step_id uuid;
  target_step public.process_steps%rowtype;
  entry jsonb;
  parameter jsonb;
  schema_fields jsonb;
  schema_snapshot jsonb;
  combined_global_values jsonb := '{}'::jsonb;
  visit_local_parameters jsonb := '[]'::jsonb;
  has_global_additions boolean := false;
  updated_step_count integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select profile.role into actor_role
  from public.profiles profile
  where profile.id = auth.uid() and profile.is_active = true;
  if actor_role is null then
    raise exception using errcode = '42501', message = 'An active account is required.';
  end if;

  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) < 1 or jsonb_array_length(entries) > 256 then
    raise exception using errcode = '22023', message = 'Parameter batches require between 1 and 256 movement entries.';
  end if;
  if jsonb_typeof(global_values) <> 'object' or jsonb_typeof(local_parameters) <> 'array' then
    raise exception using errcode = '22023', message = 'Parameter values have an invalid shape.';
  end if;
  if save_step_parameter_records_batch.notes is not null
    and char_length(save_step_parameter_records_batch.notes) > 4000 then
    raise exception using errcode = '22023', message = 'Parameter notes must be 4000 characters or fewer.';
  end if;
  if (
    select count(*) <> count(distinct value ->> 'movement_mutation_id')
    from jsonb_array_elements(entries)
  ) then
    raise exception using errcode = '22023', message = 'Each movement can only appear once in a parameter batch.';
  end if;
  if (
    select count(*) <> count(distinct value ->> 'assignment_id')
    from jsonb_array_elements(entries)
  ) then
    raise exception using errcode = '22023', message = 'Each assignment can only appear once in a parameter batch.';
  end if;
  if (
    select count(distinct value ->> 'step_id') <> 1
    from jsonb_array_elements(entries)
  ) then
    raise exception using errcode = '22023', message = 'A parameter batch must target one process step.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(local_parameters) candidate(value)
    where jsonb_typeof(candidate.value) <> 'object'
      or candidate.value ->> 'scope' not in ('local', 'global')
      or candidate.value ->> 'type' not in ('text', 'number', 'boolean', 'select')
      or coalesce(candidate.value ->> 'key', '') !~ '^[a-z][a-z0-9_]{0,79}$'
      or length(btrim(coalesce(candidate.value ->> 'label', ''))) < 1
  ) or (
    select count(*) <> count(distinct value ->> 'key')
    from jsonb_array_elements(local_parameters)
  ) then
    raise exception using errcode = '22023', message = 'Added parameter definitions are malformed or duplicated.';
  end if;

  target_step_id := (entries -> 0 ->> 'step_id')::uuid;
  select * into target_step from public.process_steps where id = target_step_id for update;
  if target_step.id is null then
    raise exception using errcode = 'P0002', message = 'The destination process step no longer exists.';
  end if;

  for entry in select value from jsonb_array_elements(entries)
  loop
    if not exists (
      select 1
      from public.process_events event
      join public.wafer_process_assignments assignment
        on assignment.id = (entry ->> 'assignment_id')::uuid
      where event.client_mutation_id = (entry ->> 'movement_mutation_id')::uuid
        and event.wafer_id = assignment.wafer_id
        and event.metadata ->> 'assignment_id' = entry ->> 'assignment_id'
        and event.metadata ->> 'target_step_id' = entry ->> 'step_id'
        and assignment.template_id = target_step.template_id
        and public.can_edit_project(event.project_id)
    ) then
      raise exception using errcode = '42501', message = 'A movement entry is missing, mismatched, or not editable.';
    end if;
  end loop;

  schema_fields := case
    when jsonb_typeof(target_step.parameters_schema -> 'fields') = 'array'
      then target_step.parameters_schema -> 'fields'
    else '[]'::jsonb
  end;

  for parameter in select value from jsonb_array_elements(local_parameters)
  loop
    if parameter ->> 'scope' = 'global' then
      has_global_additions := true;
      if actor_role not in ('admin', 'process_engineer') then
        raise exception using errcode = '42501', message = 'Only process managers can add reusable parameters.';
      end if;
      if not exists (
        select 1 from jsonb_array_elements(schema_fields) existing
        where existing ->> 'key' = parameter ->> 'key'
      ) then
        schema_fields := schema_fields || jsonb_build_array(jsonb_build_object(
          'id', parameter ->> 'id',
          'key', parameter ->> 'key',
          'label', btrim(parameter ->> 'label'),
          'type', parameter ->> 'type',
          'unit', coalesce(parameter ->> 'unit', ''),
          'required', false,
          'description', '',
          'defaultValue', null
        ));
      end if;
    else
      visit_local_parameters := visit_local_parameters || jsonb_build_array(parameter);
    end if;
  end loop;

  schema_snapshot := jsonb_set(
    coalesce(target_step.parameters_schema, '{}'::jsonb),
    '{fields}',
    schema_fields,
    true
  ) || jsonb_build_object('version', 1);

  if has_global_additions and schema_snapshot is distinct from target_step.parameters_schema then
    update public.process_steps
    set parameters_schema = schema_snapshot
    where id = target_step.id
      and revision = target_step.revision;
    get diagnostics updated_step_count = row_count;
    if updated_step_count <> 1 then
      raise exception using errcode = '40001', message = 'The step template changed while these parameters were open. Reload and try again.';
    end if;
  end if;

  select coalesce(jsonb_object_agg(values.key, values.value), '{}'::jsonb)
  into combined_global_values
  from jsonb_each(global_values) values
  where exists (
    select 1 from jsonb_array_elements(schema_fields) field
    where field ->> 'key' = values.key
  );

  for parameter in select value from jsonb_array_elements(local_parameters)
  loop
    if parameter ->> 'scope' = 'global' then
      combined_global_values := combined_global_values || jsonb_build_object(
        parameter ->> 'key', parameter -> 'value'
      );
    end if;
  end loop;

  insert into public.step_parameter_records (
    project_id, wafer_id, assignment_id, process_step_id, step_execution_id,
    process_event_id, movement_mutation_id, schema_snapshot, global_values,
    local_parameters, notes, recorded_by
  )
  select
    event.project_id,
    event.wafer_id,
    (entry.value ->> 'assignment_id')::uuid,
    target_step.id,
    event.step_execution_id,
    event.id,
    (entry.value ->> 'movement_mutation_id')::uuid,
    schema_snapshot,
    combined_global_values,
    visit_local_parameters,
    nullif(btrim(save_step_parameter_records_batch.notes), ''),
    auth.uid()
  from jsonb_array_elements(entries) entry(value)
  join public.process_events event
    on event.client_mutation_id = (entry.value ->> 'movement_mutation_id')::uuid
  on conflict (movement_mutation_id) do update set
    schema_snapshot = excluded.schema_snapshot,
    global_values = excluded.global_values,
    local_parameters = excluded.local_parameters,
    notes = excluded.notes,
    recorded_by = excluded.recorded_by
  where (
    step_parameter_records.schema_snapshot,
    step_parameter_records.global_values,
    step_parameter_records.local_parameters,
    step_parameter_records.notes,
    step_parameter_records.recorded_by
  ) is distinct from (
    excluded.schema_snapshot,
    excluded.global_values,
    excluded.local_parameters,
    excluded.notes,
    excluded.recorded_by
  );

  return query
  select record.*
  from public.step_parameter_records record
  where record.movement_mutation_id in (
    select (value ->> 'movement_mutation_id')::uuid
    from jsonb_array_elements(entries)
  )
  order by record.created_at, record.id;
end;
$$;

revoke execute on function public.save_step_parameter_records_batch(jsonb, jsonb, jsonb, text)
  from public, anon;
grant execute on function public.save_step_parameter_records_batch(jsonb, jsonb, jsonb, text)
  to authenticated;

comment on function public.save_step_parameter_records_batch(jsonb, jsonb, jsonb, text) is
  'Atomically validates and saves one shared parameter form for an idempotent Process Flow movement batch.';
