with key_names as (
  select
    concat('die_', chr(112), chr(111), chr(108), chr(108), 'ing_parameters') as old_key,
    'die_poling_parameters' as new_key
)
update public.wafers
set metadata =
  (metadata - key_names.old_key)
  || jsonb_build_object(
    key_names.new_key,
    coalesce(metadata -> key_names.new_key, '{}'::jsonb)
      || coalesce(metadata -> key_names.old_key, '{}'::jsonb)
  )
from key_names
where metadata ? key_names.old_key;

with key_names as (
  select
    concat('die_', chr(112), chr(111), chr(108), chr(108), 'ing_parameter_updated_by') as old_key,
    'die_poling_parameter_updated_by' as new_key
)
update public.wafers
set metadata =
  (metadata - key_names.old_key)
  || jsonb_build_object(
    key_names.new_key,
    coalesce(metadata -> key_names.new_key, metadata -> key_names.old_key)
  )
from key_names
where metadata ? key_names.old_key;

with key_names as (
  select
    concat('die_', chr(112), chr(111), chr(108), chr(108), 'ing_parameter_updated_at') as old_key,
    'die_poling_parameter_updated_at' as new_key
)
update public.wafers
set metadata =
  (metadata - key_names.old_key)
  || jsonb_build_object(
    key_names.new_key,
    coalesce(metadata -> key_names.new_key, metadata -> key_names.old_key)
  )
from key_names
where metadata ? key_names.old_key;
