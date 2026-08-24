-- Atomic, idempotent authoring commands used by the canonical application
-- gateway. Existing compatibility tables remain populated during cutover.

create or replace function public.create_process_step_command(
  target_template_id uuid,
  target_name text,
  target_process_area text,
  target_node_type text,
  target_canvas_x integer,
  target_canvas_y integer,
  target_parameters_schema jsonb,
  expected_workspace_revision bigint,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  template public.process_templates%rowtype;
  existing_change public.workflow_change_log%rowtype;
  step public.process_steps%rowtype;
  base_slug text;
  candidate_slug text;
  suffix integer := 1;
  target_order integer;
  current_revision bigint;
  workflow_revision bigint;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if mutation_id is null then
    raise exception using errcode = '22023', message = 'A workflow mutation id is required.';
  end if;
  perform set_config('waferwatch.canonical_workflow_mutation', 'on', true);

  perform pg_advisory_xact_lock(hashtextextended(target_template_id::text, 0));
  select * into template from public.process_templates where id = target_template_id;
  if template.id is null then
    raise exception using errcode = 'P0002', message = 'The process template no longer exists.';
  end if;
  if not public.can_manage_process_library()
     or (template.owner_project_id is not null and not public.can_edit_project(template.owner_project_id)) then
    raise exception using errcode = '42501', message = 'You cannot create a step in this process template.';
  end if;
  if template.lifecycle_status <> 'draft' then
    raise exception using errcode = '55000', message = 'Published process versions are immutable. Duplicate this version to create an editable draft.';
  end if;

  select * into existing_change
  from public.workflow_change_log change
  where change.template_id = target_template_id
    and change.client_mutation_id = mutation_id;
  if existing_change.id is not null then
    if existing_change.mutation_kind <> 'process.step.create' then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different workflow command.';
    end if;
    select * into step
    from public.process_steps candidate
    where candidate.id = (existing_change.changed_entities -> 'processStepIds' ->> 0)::uuid;
    return jsonb_build_object(
      'ok', true,
      'item', to_jsonb(step),
      'workflowRevision', existing_change.revision,
      'changedEntityIds', existing_change.changed_entities,
      'alreadyApplied', true
    );
  end if;

  select coalesce(revision.current_revision, 0) into current_revision
  from public.workflow_revisions revision
  where revision.template_id = target_template_id;
  current_revision := coalesce(current_revision, 0);
  if expected_workspace_revision is not null and expected_workspace_revision <> current_revision then
    return jsonb_build_object('ok', false, 'code', 'stale', 'currentRevision', current_revision);
  end if;
  if length(trim(coalesce(target_name, ''))) < 2
     or length(trim(target_name)) > 180
     or length(trim(coalesce(target_process_area, ''))) < 2
     or length(trim(target_process_area)) > 120
     or target_node_type not in ('start', 'procedure', 'end')
     or target_canvas_x not between 0 and 20000
     or target_canvas_y not between 0 and 20000
     or jsonb_typeof(target_parameters_schema) <> 'object' then
    raise exception using errcode = '22023', message = 'The process step command is invalid.';
  end if;

  base_slug := trim(both '-' from regexp_replace(lower(trim(target_name)), '[^a-z0-9]+', '-', 'g'));
  base_slug := left(coalesce(nullif(base_slug, ''), 'process-step'), 70);
  candidate_slug := base_slug;
  while exists (
    select 1 from public.process_steps candidate
    where candidate.template_id = target_template_id and candidate.slug = candidate_slug
  ) loop
    suffix := suffix + 1;
    candidate_slug := left(base_slug, greatest(1, 78 - length(suffix::text))) || '-' || suffix::text;
  end loop;
  select coalesce(max(candidate.step_order), 0) + 10 into target_order
  from public.process_steps candidate
  where candidate.template_id = target_template_id;

  insert into public.process_steps (
    template_id, step_order, name, slug, process_area,
    expected_duration_minutes, queue_target_minutes, required_tool_type,
    requires_recipe, instructions, parameters_schema, node_type, canvas_x, canvas_y
  ) values (
    target_template_id, target_order, trim(target_name), candidate_slug, trim(target_process_area),
    null, null, null, false, null, target_parameters_schema,
    target_node_type, target_canvas_x, target_canvas_y
  ) returning * into step;

  workflow_revision := public.commit_workflow_change(
    target_template_id,
    mutation_id,
    'process.step.create',
    jsonb_build_object(
      'processStageIds', jsonb_build_array(step.stage_id),
      'processStepIds', jsonb_build_array(step.id)
    )
  );
  return jsonb_build_object(
    'ok', true,
    'item', to_jsonb(step),
    'workflowRevision', workflow_revision,
    'changedEntityIds', jsonb_build_object(
      'processStageIds', jsonb_build_array(step.stage_id),
      'processStepIds', jsonb_build_array(step.id)
    ),
    'alreadyApplied', false
  );
end;
$$;

create or replace function public.create_process_transition_command(
  target_template_id uuid,
  source_step_id uuid,
  destination_step_id uuid,
  target_edge_type text,
  target_label text,
  target_condition jsonb,
  target_priority integer,
  expected_workspace_revision bigint,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  template public.process_templates%rowtype;
  existing_change public.workflow_change_log%rowtype;
  transition public.process_step_transitions%rowtype;
  current_revision bigint;
  workflow_revision bigint;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  perform set_config('waferwatch.canonical_workflow_mutation', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended(target_template_id::text, 0));
  select * into template from public.process_templates where id = target_template_id;
  if template.id is null then
    raise exception using errcode = 'P0002', message = 'The process template no longer exists.';
  end if;
  if not public.can_manage_process_library()
     or (template.owner_project_id is not null and not public.can_edit_project(template.owner_project_id)) then
    raise exception using errcode = '42501', message = 'You cannot connect steps in this process template.';
  end if;
  if template.lifecycle_status <> 'draft' then
    raise exception using errcode = '55000', message = 'Published process versions are immutable. Duplicate this version to create an editable draft.';
  end if;
  if source_step_id = destination_step_id
     or target_edge_type not in ('flow', 'return')
     or target_priority not between 0 and 10000
     or jsonb_typeof(target_condition) <> 'object'
     or not exists (
       select 1 from public.process_steps step
       where step.id = source_step_id and step.template_id = target_template_id and step.archived_at is null
     )
     or not exists (
       select 1 from public.process_steps step
       where step.id = destination_step_id and step.template_id = target_template_id and step.archived_at is null
     ) then
    raise exception using errcode = '22023', message = 'The process transition command is invalid.';
  end if;

  select * into existing_change
  from public.workflow_change_log change
  where change.template_id = target_template_id
    and change.client_mutation_id = mutation_id;
  if existing_change.id is not null then
    if existing_change.mutation_kind <> 'process.transition.create' then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different workflow command.';
    end if;
    select * into transition
    from public.process_step_transitions candidate
    where candidate.id = (existing_change.changed_entities -> 'processTransitionIds' ->> 0)::uuid;
    return jsonb_build_object(
      'ok', true,
      'item', to_jsonb(transition),
      'workflowRevision', existing_change.revision,
      'changedEntityIds', existing_change.changed_entities,
      'alreadyApplied', true
    );
  end if;

  select coalesce(revision.current_revision, 0) into current_revision
  from public.workflow_revisions revision
  where revision.template_id = target_template_id;
  current_revision := coalesce(current_revision, 0);
  if expected_workspace_revision is not null and expected_workspace_revision <> current_revision then
    return jsonb_build_object('ok', false, 'code', 'stale', 'currentRevision', current_revision);
  end if;

  insert into public.process_step_transitions (
    template_id, from_step_id, to_step_id, edge_type, label, condition, priority
  ) values (
    target_template_id, source_step_id, destination_step_id, target_edge_type,
    nullif(trim(target_label), ''), target_condition, target_priority
  ) on conflict (template_id, from_step_id, to_step_id, edge_type) do update set
    label = excluded.label,
    condition = excluded.condition,
    priority = excluded.priority
  returning * into transition;

  workflow_revision := public.commit_workflow_change(
    target_template_id,
    mutation_id,
    'process.transition.create',
    jsonb_build_object('processTransitionIds', jsonb_build_array(transition.id))
  );
  return jsonb_build_object(
    'ok', true,
    'item', to_jsonb(transition),
    'workflowRevision', workflow_revision,
    'changedEntityIds', jsonb_build_object('processTransitionIds', jsonb_build_array(transition.id)),
    'alreadyApplied', false
  );
end;
$$;

create or replace function public.create_process_wafer_command(
  target_template_id uuid,
  target_project_id uuid,
  target_wafer_code text,
  target_die_count integer,
  expected_workspace_revision bigint,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  template public.process_templates%rowtype;
  existing_change public.workflow_change_log%rowtype;
  wafer public.wafers%rowtype;
  assignment public.wafer_process_assignments%rowtype;
  start_step public.process_steps%rowtype;
  start_execution public.step_executions%rowtype;
  run public.operation_runs%rowtype;
  member public.operation_run_members%rowtype;
  normalized_code text;
  die_labels jsonb;
  current_revision bigint;
  workflow_revision bigint;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));
  select * into template from public.process_templates where id = target_template_id;
  if template.id is null then
    raise exception using errcode = 'P0002', message = 'The process template no longer exists.';
  end if;
  if template.lifecycle_status <> 'published' then
    raise exception using errcode = '55000', message = 'Only published process versions can receive wafers.';
  end if;
  if target_project_id is null
     or (template.owner_project_id is not null and template.owner_project_id <> target_project_id)
     or not public.can_edit_project(target_project_id) then
    raise exception using errcode = '42501', message = 'You cannot create a wafer in this process project.';
  end if;

  select * into existing_change
  from public.workflow_change_log change
  where change.template_id = target_template_id
    and change.client_mutation_id = mutation_id;
  if existing_change.id is not null then
    if existing_change.mutation_kind <> 'wafer.create' then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different workflow command.';
    end if;
    select * into wafer
    from public.wafers candidate
    where candidate.id = (existing_change.changed_entities -> 'waferIds' ->> 0)::uuid;
    select * into assignment
    from public.wafer_process_assignments candidate
    where candidate.id = (existing_change.changed_entities -> 'assignmentIds' ->> 0)::uuid;
    select * into member
    from public.operation_run_members candidate
    where candidate.id = assignment.current_operation_run_member_id;
    select * into start_execution from public.step_executions candidate where candidate.id = member.legacy_step_execution_id;
    return jsonb_build_object(
      'ok', true,
      'wafer', to_jsonb(wafer),
      'assignment', to_jsonb(assignment),
      'stepExecution', to_jsonb(start_execution),
      'workflowRevision', existing_change.revision,
      'changedEntityIds', existing_change.changed_entities,
      'alreadyApplied', true
    );
  end if;

  select coalesce(revision.current_revision, 0) into current_revision
  from public.workflow_revisions revision
  where revision.template_id = target_template_id;
  current_revision := coalesce(current_revision, 0);
  if expected_workspace_revision is not null and expected_workspace_revision <> current_revision then
    return jsonb_build_object('ok', false, 'code', 'stale', 'currentRevision', current_revision);
  end if;

  normalized_code := upper(regexp_replace(trim(coalesce(target_wafer_code, '')), '\s+', ' ', 'g'));
  if length(normalized_code) not between 1 and 80
     or normalized_code !~ '^[A-Z0-9]+(?:[ A-Z0-9_.-]*[A-Z0-9])?$'
     or target_die_count not between 1 and 256 then
    raise exception using errcode = '22023', message = 'The wafer creation command is invalid.';
  end if;
  if exists (
    select 1 from public.wafers candidate
    where candidate.project_id = target_project_id
      and upper(regexp_replace(trim(candidate.wafer_code), '\s+', ' ', 'g')) = normalized_code
      and candidate.deleted_at is null
  ) then
    raise exception using errcode = '23505', message = 'A wafer with this name already exists.';
  end if;
  select * into start_step
  from public.process_steps candidate
  where candidate.template_id = target_template_id
    and candidate.archived_at is null
    and candidate.execution_mode <> 'anytime'
  order by candidate.step_order, candidate.id
  limit 1;
  if start_step.id is null then
    raise exception using errcode = '55000', message = 'Create a Beginning step before adding wafers.';
  end if;

  select coalesce(jsonb_agg(normalized_code || '_' || series order by series), '[]'::jsonb)
  into die_labels from generate_series(1, target_die_count) series;
  insert into public.wafers (
    project_id, wafer_code, status, material_stack, diameter_mm, notes, metadata
  ) values (
    target_project_id,
    normalized_code,
    'queued',
    null,
    null,
    null,
    jsonb_build_object(
      'created_by', auth.uid(),
      'created_from', 'canonical_workflow_command',
      'creation_mutation_id', mutation_id,
      'wafer_family', split_part(normalized_code, '-', 1),
      'wafer_display_mode', 'undiced',
      'die_count', target_die_count,
      'die_labels', die_labels
    )
  ) returning * into wafer;

  insert into public.wafer_process_assignments (
    wafer_id, template_id, current_step_id, assigned_by, status, assigned_at
  ) values (
    wafer.id, target_template_id, start_step.id, auth.uid(), 'queued', now()
  ) returning * into assignment;

  insert into public.step_executions (
    assignment_id, wafer_id, process_step_id, status, queue_started_at, metadata
  )
  select
    assignment.id,
    wafer.id,
    step.id,
    case when step.id = start_step.id then 'queued'::public.step_status else 'pending'::public.step_status end,
    case when step.id = start_step.id then now() else null end,
    '{}'::jsonb
  from public.process_steps step
  where step.template_id = target_template_id and step.archived_at is null
  order by step.step_order, step.id;
  select * into start_execution
  from public.step_executions execution
  where execution.assignment_id = assignment.id and execution.process_step_id = start_step.id;

  -- Compatibility executions are the initial state being bridged. Enable the
  -- canonical guard only after they exist, then attach the authoritative run.
  perform set_config('waferwatch.canonical_workflow_mutation', 'on', true);
  insert into public.operation_runs (
    id, template_id, process_step_id, run_kind, status, created_by,
    client_mutation_id, started_at
  ) values (
    mutation_id, target_template_id, start_step.id, 'normal', 'queued',
    auth.uid(), mutation_id, null
  ) returning * into run;
  insert into public.operation_run_members (
    operation_run_id, assignment_id, wafer_id, status, legacy_step_execution_id
  ) values (
    run.id, assignment.id, wafer.id, 'queued', start_execution.id
  ) returning * into member;
  update public.wafer_process_assignments target
  set current_operation_run_member_id = member.id
  where target.id = assignment.id
  returning * into assignment;

  insert into public.process_events (
    project_id, wafer_id, step_execution_id, actor_id, event_type, notes,
    metadata, client_mutation_id, operation_run_id, operation_run_member_id
  ) values (
    target_project_id,
    wafer.id,
    start_execution.id,
    auth.uid(),
    'wafer_created',
    'Created from Process Flow.',
    jsonb_build_object(
      'assignment_id', assignment.id,
      'start_step_id', start_step.id,
      'die_count', target_die_count,
      'die_labels', die_labels,
      'wafer_metadata', wafer.metadata
    ),
    mutation_id,
    run.id,
    member.id
  );

  workflow_revision := public.commit_workflow_change(
    target_template_id,
    mutation_id,
    'wafer.create',
    jsonb_build_object(
      'waferIds', jsonb_build_array(wafer.id),
      'assignmentIds', jsonb_build_array(assignment.id),
      'operationRunIds', jsonb_build_array(run.id),
      'operationRunMemberIds', jsonb_build_array(member.id)
    )
  );
  return jsonb_build_object(
    'ok', true,
    'wafer', to_jsonb(wafer),
    'assignment', to_jsonb(assignment),
    'stepExecution', to_jsonb(start_execution),
    'workflowRevision', workflow_revision,
    'changedEntityIds', jsonb_build_object(
      'waferIds', jsonb_build_array(wafer.id),
      'assignmentIds', jsonb_build_array(assignment.id),
      'operationRunIds', jsonb_build_array(run.id),
      'operationRunMemberIds', jsonb_build_array(member.id)
    ),
    'alreadyApplied', false
  );
end;
$$;

create or replace function public.archive_process_assignments_command(
  target_template_id uuid,
  target_assignment_ids uuid[],
  item_mutation_ids uuid[],
  expected_workspace_revision bigint,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_change public.workflow_change_log%rowtype;
  archived_items jsonb;
  changed_wafer_ids jsonb;
  current_revision bigint;
  workflow_revision bigint;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  perform set_config('waferwatch.canonical_workflow_mutation', 'on', true);
  if coalesce(cardinality(target_assignment_ids), 0) < 1
     or cardinality(target_assignment_ids) <> cardinality(item_mutation_ids)
     or exists (
       select 1
       from unnest(target_assignment_ids) candidate(id)
       left join public.wafer_process_assignments assignment on assignment.id = candidate.id
       where assignment.id is null or assignment.template_id <> target_template_id
     ) then
    raise exception using errcode = '22023', message = 'The archive command is invalid.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(mutation_id::text, 0));

  select * into existing_change
  from public.workflow_change_log change
  where change.template_id = target_template_id
    and change.client_mutation_id = mutation_id;
  if existing_change.id is not null then
    if existing_change.mutation_kind <> 'wafer.archive' then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different workflow command.';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'assignment_id', assignment.id,
      'wafer_id', assignment.wafer_id,
      'archived_at', assignment.archived_at
    ) order by assignment.id), '[]'::jsonb)
    into archived_items
    from public.wafer_process_assignments assignment
    where assignment.id in (
      select value::uuid
      from jsonb_array_elements_text(existing_change.changed_entities -> 'assignmentIds') value
    );
    return jsonb_build_object(
      'ok', true,
      'archived', archived_items,
      'workflowRevision', existing_change.revision,
      'changedEntityIds', existing_change.changed_entities,
      'alreadyApplied', true
    );
  end if;

  select coalesce(revision.current_revision, 0) into current_revision
  from public.workflow_revisions revision
  where revision.template_id = target_template_id;
  current_revision := coalesce(current_revision, 0);
  if expected_workspace_revision is not null and expected_workspace_revision <> current_revision then
    return jsonb_build_object('ok', false, 'code', 'stale', 'currentRevision', current_revision);
  end if;

  select coalesce(jsonb_agg(to_jsonb(archived) order by archived.assignment_id), '[]'::jsonb)
  into archived_items
  from public.archive_completed_wafer_assignments(target_assignment_ids, item_mutation_ids) archived;
  select coalesce(jsonb_agg(assignment.wafer_id order by assignment.id), '[]'::jsonb)
  into changed_wafer_ids
  from public.wafer_process_assignments assignment
  where assignment.id = any(target_assignment_ids);

  workflow_revision := public.commit_workflow_change(
    target_template_id,
    mutation_id,
    'wafer.archive',
    jsonb_build_object(
      'assignmentIds', to_jsonb(target_assignment_ids),
      'waferIds', changed_wafer_ids
    )
  );
  return jsonb_build_object(
    'ok', true,
    'archived', archived_items,
    'workflowRevision', workflow_revision,
    'changedEntityIds', jsonb_build_object(
      'assignmentIds', to_jsonb(target_assignment_ids),
      'waferIds', changed_wafer_ids
    ),
    'alreadyApplied', false
  );
end;
$$;

revoke all on function public.create_process_step_command(uuid, text, text, text, integer, integer, jsonb, bigint, uuid)
  from public, anon;
revoke all on function public.create_process_transition_command(uuid, uuid, uuid, text, text, jsonb, integer, bigint, uuid)
  from public, anon;
revoke all on function public.create_process_wafer_command(uuid, uuid, text, integer, bigint, uuid)
  from public, anon;
revoke all on function public.archive_process_assignments_command(uuid, uuid[], uuid[], bigint, uuid)
  from public, anon;

grant execute on function public.create_process_step_command(uuid, text, text, text, integer, integer, jsonb, bigint, uuid)
  to authenticated;
grant execute on function public.create_process_transition_command(uuid, uuid, uuid, text, text, jsonb, integer, bigint, uuid)
  to authenticated;
grant execute on function public.create_process_wafer_command(uuid, uuid, text, integer, bigint, uuid)
  to authenticated;
grant execute on function public.archive_process_assignments_command(uuid, uuid[], uuid[], bigint, uuid)
  to authenticated;

comment on function public.create_process_step_command(uuid, text, text, text, integer, integer, jsonb, bigint, uuid) is
  'Atomically creates an executable step and compatibility stage, then commits one workflow revision.';
comment on function public.create_process_wafer_command(uuid, uuid, text, integer, bigint, uuid) is
  'Atomically creates a wafer, assignment, compatibility executions, canonical initial run/member, evidence, and one revision.';

notify pgrst, 'reload schema';
