-- The post-movement dialog used to expose only an "Add row" action, but those
-- rows were stored as visit-local records. Promote the existing definitions so
-- the next wafer or die entering the same step receives the same template.

with existing_fields as (
  select
    step.id,
    case
      when jsonb_typeof(step.parameters_schema -> 'fields') = 'array'
        then step.parameters_schema -> 'fields'
      else '[]'::jsonb
    end as fields
  from public.process_steps step
),
legacy_fields as (
  select
    record.process_step_id,
    record.created_at,
    record.id as record_id,
    parameter.field
  from public.step_parameter_records record
  cross join lateral jsonb_array_elements(record.local_parameters) as parameter(field)
  where jsonb_typeof(record.local_parameters) = 'array'
    and jsonb_typeof(parameter.field) = 'object'
    and parameter.field ->> 'scope' = 'local'
    and coalesce(parameter.field ->> 'key', '') ~ '^[a-z][a-z0-9_]{0,79}$'
    and coalesce(btrim(parameter.field ->> 'label'), '') <> ''
),
new_fields as (
  select distinct on (legacy.process_step_id, legacy.field ->> 'key')
    legacy.process_step_id,
    jsonb_build_object(
      'id', coalesce(nullif(legacy.field ->> 'id', ''), gen_random_uuid()::text),
      'key', legacy.field ->> 'key',
      'label', btrim(legacy.field ->> 'label'),
      'type', case
        when legacy.field ->> 'type' in ('text', 'number', 'boolean', 'select') then legacy.field ->> 'type'
        else 'text'
      end,
      'unit', coalesce(legacy.field ->> 'unit', ''),
      'required', false,
      'description', '',
      'defaultValue', null
    ) as field
  from legacy_fields legacy
  join existing_fields existing on existing.id = legacy.process_step_id
  where not exists (
    select 1
    from jsonb_array_elements(existing.fields) as current(field)
    where current.field ->> 'key' = legacy.field ->> 'key'
  )
  order by legacy.process_step_id, legacy.field ->> 'key', legacy.created_at, legacy.record_id
),
fields_to_append as (
  select process_step_id, jsonb_agg(field order by field ->> 'label', field ->> 'key') as fields
  from new_fields
  group by process_step_id
)
update public.process_steps step
set parameters_schema = jsonb_set(
  step.parameters_schema,
  '{fields}',
  existing.fields || fields_to_append.fields,
  true
)
from existing_fields existing
join fields_to_append on fields_to_append.process_step_id = existing.id
where step.id = existing.id;
