-- Keep legacy authoring and parameter entry safe while canonical stages,
-- operation runs, and revision deltas are authoritative.

create or replace function public.ensure_process_step_stage()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  stage public.process_stages%rowtype;
  target_order integer;
begin
  if new.stage_id is not null then
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
      new.template_id, new.name, new.slug, target_order, new.canvas_x, new.canvas_y, new.archived_at
    ) returning * into stage;
  end if;

  new.stage_id := stage.id;
  new.stage_step_order := coalesce(new.stage_step_order, 1);
  return new;
end;
$$;

drop trigger if exists process_steps_ensure_stage on public.process_steps;
create trigger process_steps_ensure_stage
  before insert on public.process_steps
  for each row execute function public.ensure_process_step_stage();

create or replace function public.save_operation_parameter_records_batch(
  entries jsonb,
  global_values jsonb,
  local_parameters jsonb,
  notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict error
declare
  legacy_records jsonb;
  record_row jsonb;
  target_event public.process_events%rowtype;
  target_member public.operation_run_members%rowtype;
  prior_parameter_id uuid;
  prior_note_id uuid;
  target_step_id uuid;
  base_mutation_id uuid;
  batch_mutation_id uuid;
  evidence_mutation_id uuid;
  member_ids jsonb := '[]'::jsonb;
  workflow_revision bigint;
begin
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) < 1 then
    raise exception using errcode = '22023', message = 'At least one movement entry is required.';
  end if;
  perform set_config('waferwatch.canonical_workflow_mutation', 'on', true);
  target_step_id := (entries -> 0 ->> 'step_id')::uuid;
  select (candidate.value ->> 'movement_mutation_id')::uuid into base_mutation_id
  from jsonb_array_elements(entries) candidate(value)
  order by candidate.value ->> 'movement_mutation_id'
  limit 1;
  batch_mutation_id := public.derived_mutation_uuid(base_mutation_id, target_step_id, 'parameter-batch');
  perform pg_advisory_xact_lock(hashtextextended(batch_mutation_id::text, 0));

  select coalesce(jsonb_agg(to_jsonb(saved) order by saved.created_at, saved.id), '[]'::jsonb)
  into legacy_records
  from public.save_step_parameter_records_batch(entries, global_values, local_parameters, notes) saved;

  if exists (
    select 1 from public.workflow_change_log change
    where change.client_mutation_id = batch_mutation_id
  ) then
    return jsonb_build_object('records', legacy_records, 'alreadyApplied', true);
  end if;

  for record_row in select value from jsonb_array_elements(legacy_records)
  loop
    select * into target_event
    from public.process_events event
    where event.id = (record_row ->> 'process_event_id')::uuid;
    select * into target_member
    from public.operation_run_members member
    where member.id = target_event.operation_run_member_id;
    if target_member.id is null then
      raise exception using errcode = 'P0002', message = 'The canonical operation member for this movement is missing.';
    end if;

    select parameter.id into prior_parameter_id
    from public.operation_run_parameter_records parameter
    where parameter.operation_run_member_id = target_member.id
    order by parameter.recorded_at desc, parameter.id desc
    limit 1;
    evidence_mutation_id := public.derived_mutation_uuid(batch_mutation_id, target_member.id, 'parameter-evidence');
    insert into public.operation_run_parameter_records (
      operation_run_id, operation_run_member_id, scope, schema_snapshot, values,
      recorded_by, supersedes_record_id, correction_reason, client_mutation_id
    ) values (
      target_member.operation_run_id,
      target_member.id,
      'member',
      coalesce(record_row -> 'schema_snapshot', '{}'::jsonb),
      jsonb_build_object(
        'global_values', coalesce(record_row -> 'global_values', '{}'::jsonb),
        'local_parameters', coalesce(record_row -> 'local_parameters', '[]'::jsonb),
        'legacy_record_id', record_row ->> 'id'
      ),
      auth.uid(),
      prior_parameter_id,
      case when prior_parameter_id is null then null else 'Superseded by a later parameter submission.' end,
      evidence_mutation_id
    );

    if nullif(btrim(notes), '') is not null then
      select note.id into prior_note_id
      from public.operation_run_notes note
      where note.operation_run_member_id = target_member.id
        and note.note_kind in ('general', 'completion', 'correction')
      order by note.created_at desc, note.id desc
      limit 1;
      insert into public.operation_run_notes (
        operation_run_id, operation_run_member_id, note_kind, body, created_by,
        supersedes_note_id, correction_reason, client_mutation_id
      ) values (
        target_member.operation_run_id,
        target_member.id,
        case when prior_note_id is null then 'completion' else 'correction' end,
        btrim(notes),
        auth.uid(),
        prior_note_id,
        case when prior_note_id is null then null else 'Superseded by a later parameter submission.' end,
        public.derived_mutation_uuid(batch_mutation_id, target_member.id, 'parameter-note')
      );
    end if;
    member_ids := member_ids || jsonb_build_array(target_member.id);
  end loop;

  workflow_revision := public.commit_workflow_change(
    (select template_id from public.process_steps where id = target_step_id),
    batch_mutation_id,
    'operation_run.parameters.record',
    jsonb_build_object(
      'processStepIds', jsonb_build_array(target_step_id),
      'operationRunMemberIds', member_ids
    )
  );
  return jsonb_build_object(
    'records', legacy_records,
    'workflowRevision', workflow_revision
  );
end;
$$;

revoke all on function public.save_operation_parameter_records_batch(jsonb, jsonb, jsonb, text)
  from public, anon;
grant execute on function public.save_operation_parameter_records_batch(jsonb, jsonb, jsonb, text)
  to authenticated;

comment on function public.save_operation_parameter_records_batch(jsonb, jsonb, jsonb, text) is
  'Atomically records compatibility parameter rows and append-only operation-run evidence, then publishes one workflow revision.';
