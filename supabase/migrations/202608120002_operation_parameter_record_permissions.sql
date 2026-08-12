-- Canonical operation evidence is append-only and direct authenticated writes
-- remain revoked. Run the already-validated compatibility save through one
-- security-definer boundary, then verify every canonical identity before the
-- privileged evidence inserts.

create or replace function public.save_operation_parameter_records_batch(
  entries jsonb,
  global_values jsonb,
  local_parameters jsonb,
  notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict error
declare
  legacy_records jsonb;
  record_row jsonb;
  target_event public.process_events%rowtype;
  target_member public.operation_run_members%rowtype;
  target_run public.operation_runs%rowtype;
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

  -- This inner RPC retains authentication, active-account, role, project-edit,
  -- input-shape, movement identity, reusable-schema, and legacy idempotency checks.
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
    if target_event.id is null
       or target_event.client_mutation_id is distinct from (record_row ->> 'movement_mutation_id')::uuid
       or target_event.wafer_id is distinct from (record_row ->> 'wafer_id')::uuid
       or target_event.step_execution_id is distinct from nullif(record_row ->> 'step_execution_id', '')::uuid then
      raise exception using
        errcode = '42501',
        message = 'The canonical movement event does not match this parameter record.';
    end if;

    select * into target_member
    from public.operation_run_members member
    where member.id = target_event.operation_run_member_id;
    select * into target_run
    from public.operation_runs run
    where run.id = target_member.operation_run_id;
    if target_member.id is null
       or target_run.id is null
       or not target_member.history_effective
       or target_event.operation_run_id is distinct from target_run.id
       or target_member.assignment_id is distinct from (record_row ->> 'assignment_id')::uuid
       or target_member.wafer_id is distinct from (record_row ->> 'wafer_id')::uuid
       or target_member.legacy_step_execution_id is distinct from target_event.step_execution_id
       or target_run.process_step_id is distinct from (record_row ->> 'process_step_id')::uuid then
      raise exception using
        errcode = '42501',
        message = 'The canonical operation member does not match this parameter movement.';
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
      target_run.id,
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
        target_run.id,
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
  from public, anon, authenticated;
grant execute on function public.save_operation_parameter_records_batch(jsonb, jsonb, jsonb, text)
  to authenticated;

comment on function public.save_operation_parameter_records_batch(jsonb, jsonb, jsonb, text) is
  'Validates a movement-scoped parameter batch before atomically recording append-only canonical operation evidence.';

notify pgrst, 'reload schema';
