insert into public.process_templates (name, version, description, is_active)
select
  'MQPG baseline photonic wafer flow',
  '1.0',
  'Starter process flow for photonic integrated circuit development.',
  true
where not exists (
  select 1
  from public.process_templates
  where owner_project_id is null
    and name = 'MQPG baseline photonic wafer flow'
    and version = '1.0'
);

with template as (
  select id
  from public.process_templates
  where name = 'MQPG baseline photonic wafer flow'
    and version = '1.0'
  limit 1
)
insert into public.process_steps (
  template_id,
  step_order,
  name,
  slug,
  process_area,
  expected_duration_minutes,
  queue_target_minutes,
  required_tool_type,
  requires_recipe,
  instructions
)
select id, 10, 'Wafer intake and inspection', 'wafer-intake', 'intake', 30, 240, null, false, 'Record wafer identifiers, incoming condition, and initial images.' from template
union all
select id, 20, 'Solvent clean', 'solvent-clean', 'cleaning', 60, 480, 'wet-bench', true, 'Run approved solvent cleaning recipe and attach run sheet.' from template
union all
select id, 30, 'Lithography coat and expose', 'lithography-coat-expose', 'lithography', 180, 1440, 'lithography', true, 'Track resist, exposure dose, mask, and alignment notes.' from template
union all
select id, 40, 'Etch', 'etch', 'etch', 120, 1440, 'etcher', true, 'Record etch recipe, tool, endpoint, and post-etch inspection.' from template
union all
select id, 50, 'Characterization', 'characterization', 'metrology', 240, 2880, 'metrology', false, 'Attach characterization data and extracted device metrics.' from template
on conflict (template_id, slug) do nothing;

insert into public.fabrication_tools (name, tool_type, location, status, metadata)
values
  ('Wet Bench', 'wet-bench', 'Cleanroom', 'available', '{"owner": "MQPG"}'::jsonb),
  ('Mask Aligner', 'lithography', 'Cleanroom', 'available', '{"owner": "MQPG"}'::jsonb),
  ('ICP Etcher', 'etcher', 'Cleanroom', 'available', '{"owner": "MQPG"}'::jsonb),
  ('Optical Probe Station', 'metrology', 'Photonics Lab', 'available', '{"owner": "MQPG"}'::jsonb)
on conflict (name) do nothing;
