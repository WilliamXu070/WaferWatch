-- Make dicing checkpoint approval and child-wafer handoff one transaction.
-- The general checkpoint decision RPC remains the source of approval semantics;
-- this wrapper adds validated child creation and reconciliation before commit.

create or replace function public.review_dicing_step_checkpoint(
  target_attempt_id uuid,
  mutation_id uuid,
  notes text default null,
  child_specs jsonb default '[]'::jsonb
)
returns public.checkpoint_decisions
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.process_step_attempts%rowtype;
  source_step public.process_steps%rowtype;
  parent_wafer public.wafers%rowtype;
  child_wafer public.wafers%rowtype;
  decision public.checkpoint_decisions%rowtype;
  child_spec jsonb;
  child_code text;
  die_label text;
  wafer_family text;
  die_prefix text;
  configured_die_count integer;
  child_codes text[] := array[]::text[];
  die_labels text[] := array[]::text[];
  expected_child_codes text[] := array[]::text[];
  expected_die_labels text[] := array[]::text[];
  child_ids uuid[] := array[]::uuid[];
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select * into attempt
  from public.process_step_attempts
  where id = target_attempt_id
  for update;

  if attempt.id is null then
    raise exception using errcode = 'P0002', message = 'The checkpoint submission no longer exists.';
  end if;

  select * into source_step
  from public.process_steps
  where id = attempt.process_step_id;

  select * into parent_wafer
  from public.wafers
  where id = attempt.wafer_id
  for update;

  if not public.checkpoint_step_is_dicing(
    source_step.name,
    source_step.slug,
    source_step.process_area
  ) then
    raise exception using errcode = '23514', message = 'Only a dicing checkpoint can create child wafers.';
  end if;

  wafer_family := coalesce(
    nullif(trim(parent_wafer.metadata ->> 'wafer_family'), ''),
    upper(trim(parent_wafer.wafer_code))
  );
  if jsonb_typeof(parent_wafer.metadata -> 'die_labels') = 'array'
     and jsonb_array_length(parent_wafer.metadata -> 'die_labels') > 0 then
    select coalesce(array_agg(label order by first_ordinal), array[]::text[])
    into expected_die_labels
    from (
      select trim(value) as label, min(ordinality) as first_ordinal
      from jsonb_array_elements_text(parent_wafer.metadata -> 'die_labels') with ordinality
      where nullif(trim(value), '') is not null
      group by trim(value)
    ) configured_labels;
  elsif jsonb_typeof(parent_wafer.metadata -> 'die_count') = 'number'
        and floor((parent_wafer.metadata ->> 'die_count')::numeric) > 0 then
    configured_die_count := floor((parent_wafer.metadata ->> 'die_count')::numeric)::integer;
    if configured_die_count > 256 then
      raise exception using errcode = '22023', message = 'Configured die count cannot exceed 256.';
    end if;
    select array_agg(parent_wafer.wafer_code || '_' || die_index order by die_index)
    into expected_die_labels
    from generate_series(1, configured_die_count) die_index;
  else
    die_prefix := coalesce(
      substring(upper(wafer_family) from '[A-Z]'),
      substring(upper(parent_wafer.wafer_code) from '[A-Z]'),
      'D'
    );
    select array_agg(die_prefix || die_index order by die_index)
    into expected_die_labels
    from generate_series(1, 8) die_index;
  end if;

  select array_agg(
    case
      when left(upper(label), length(upper(parent_wafer.wafer_code)) + 1)
           = upper(parent_wafer.wafer_code) || '_'
        then label
      else parent_wafer.wafer_code || '-' || label
    end
    order by ordinal
  )
  into expected_child_codes
  from unnest(expected_die_labels) with ordinality as expected(label, ordinal);

  if jsonb_typeof(child_specs) <> 'array'
     or jsonb_array_length(child_specs) < 1
     or jsonb_array_length(child_specs) > 256 then
    raise exception using errcode = '22023', message = 'Dicing approval requires between 1 and 256 child wafer specifications.';
  end if;

  for child_spec in select value from jsonb_array_elements(child_specs)
  loop
    child_code := nullif(trim(child_spec ->> 'wafer_code'), '');
    die_label := nullif(trim(child_spec ->> 'die_label'), '');
    if child_code is null or die_label is null then
      raise exception using errcode = '22023', message = 'Every dicing child needs a wafer code and die label.';
    end if;
    if child_code = any(child_codes) or die_label = any(die_labels) then
      raise exception using errcode = '22023', message = 'Dicing child wafer codes and die labels must be unique.';
    end if;
    child_codes := array_append(child_codes, child_code);
    die_labels := array_append(die_labels, die_label);
  end loop;

  if child_codes is distinct from expected_child_codes
     or die_labels is distinct from expected_die_labels then
    raise exception using
      errcode = '22023',
      message = 'Dicing child specifications must exactly match the parent wafer die configuration.';
  end if;

  -- If anything below fails, this approval is rolled back with the split.
  perform set_config(
    'waferwatch.atomic_dicing_review',
    target_attempt_id::text || ':' || mutation_id::text,
    true
  );
  select * into decision
  from public.review_step_checkpoint(target_attempt_id, 'approved', mutation_id, notes);

  for child_spec in select value from jsonb_array_elements(child_specs)
  loop
    child_code := trim(child_spec ->> 'wafer_code');
    die_label := trim(child_spec ->> 'die_label');

    insert into public.wafers (
      project_id,
      wafer_code,
      material_stack,
      diameter_mm,
      status,
      notes,
      metadata
    ) values (
      parent_wafer.project_id,
      child_code,
      parent_wafer.material_stack,
      parent_wafer.diameter_mm,
      'queued',
      null,
      jsonb_build_object(
        'parent_wafer_id', parent_wafer.id,
        'parent_wafer_code', parent_wafer.wafer_code,
        'wafer_family', wafer_family,
        'wafer_display_mode', 'diced',
        'current_die', die_label,
        'dicing_source_step_id', source_step.id,
        'dicing_source_step_name', source_step.name,
        'created_from', 'dicing_completion'
      )
    )
    on conflict (project_id, wafer_code) do nothing;

    select * into child_wafer
    from public.wafers child
    where child.project_id = parent_wafer.project_id
      and child.wafer_code = child_code
    for update;

    if child_wafer.id is null
       or child_wafer.metadata ->> 'parent_wafer_id' is distinct from parent_wafer.id::text
       or child_wafer.metadata ->> 'current_die' is distinct from die_label then
      raise exception using
        errcode = '23505',
        message = format('%s already belongs to another wafer or dicing run.', child_code);
    end if;

    child_ids := array_append(child_ids, child_wafer.id);
  end loop;

  perform public.reconcile_dicing_checkpoint_split(decision.id, child_ids);
  return decision;
end;
$$;

revoke execute on function public.review_dicing_step_checkpoint(uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.review_dicing_step_checkpoint(uuid, uuid, text, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
