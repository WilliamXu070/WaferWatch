-- Reviewer movement selects the next step; it does not implicitly reject the
-- completed work simply because that step appears earlier in the canvas order.
-- The explicit review_step_checkpoint(..., 'redo', ...) RPC remains the
-- authoritative way to record a real redo.

create or replace function public.route_checkpoint_submission(
  target_attempt_id uuid,
  target_step_id uuid,
  decision_mutation_id uuid,
  movement_mutation_id uuid,
  notes text,
  child_specs jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.process_step_attempts%rowtype;
  source_step public.process_steps%rowtype;
  destination_step public.process_steps%rowtype;
  wafer public.wafers%rowtype;
  target_execution public.step_executions%rowtype;
  decision public.checkpoint_decisions%rowtype;
  existing_event public.process_events%rowtype;
  movement jsonb;
  child_movements jsonb := '[]'::jsonb;
  child_spec jsonb;
  child_wafer public.wafers%rowtype;
  child_assignment public.wafer_process_assignments%rowtype;
  child_movement_mutation_id uuid;
  route_is_redo boolean;
begin
  if auth.uid() is null or nullif(trim(notes), '') is null then
    raise exception using errcode = '22023', message = 'Authentication and a process note are required.';
  end if;

  select * into existing_event from public.process_events where client_mutation_id = movement_mutation_id;
  if existing_event.id is not null then
    if existing_event.actor_id is distinct from auth.uid()
       or existing_event.metadata ->> 'target_step_id' is distinct from target_step_id::text then
      raise exception using errcode = '22023', message = 'This mutation id belongs to a different reviewer route.';
    end if;
    return jsonb_build_object(
      'event_id', existing_event.id,
      'step_execution_id', existing_event.step_execution_id,
      'already_routed', true
    ) || existing_event.metadata;
  end if;

  select * into attempt from public.process_step_attempts where id = target_attempt_id for update;
  select * into source_step from public.process_steps where id = attempt.process_step_id;
  select * into destination_step from public.process_steps
  where id = target_step_id and template_id = attempt.template_id and archived_at is null;
  select * into wafer from public.wafers where id = attempt.wafer_id for update;

  if attempt.id is null then
    raise exception using errcode = 'P0002', message = 'The checkpoint submission no longer exists.';
  end if;
  if destination_step.id is null then
    raise exception using errcode = '22023', message = 'Choose an active destination from this process.';
  end if;

  -- A same-step route is an intentional repeat. A different destination is a
  -- normal approved route, including an earlier step or a graph loop.
  route_is_redo := source_step.id = destination_step.id;
  if route_is_redo then
    select * into decision from public.review_step_checkpoint(
      attempt.id,
      'redo',
      decision_mutation_id,
      notes,
      destination_step.id
    );
    select * into target_execution from public.step_executions
    where assignment_id = attempt.assignment_id and process_step_id = destination_step.id;
    insert into public.process_events (
      project_id, wafer_id, step_execution_id, actor_id, event_type,
      notes, metadata, client_mutation_id
    ) values (
      wafer.project_id, wafer.id, target_execution.id, auth.uid(),
      'checkpoint_step_entered', trim(notes),
      jsonb_build_object(
        'assignment_id', attempt.assignment_id,
        'attempt_id', attempt.id,
        'checkpoint_decision_id', decision.id,
        'from_step_id', source_step.id,
        'from_step_name', source_step.name,
        'target_step_id', destination_step.id,
        'target_step_name', destination_step.name,
        'movement_kind', 'checkpoint_redo_route'
      ),
      movement_mutation_id
    ) returning * into existing_event;
    return jsonb_build_object(
      'event_id', existing_event.id,
      'decision_id', decision.id,
      'assignment_id', attempt.assignment_id,
      'step_execution_id', target_execution.id,
      'target_step_id', destination_step.id,
      'route_decision', 'redo'
    );
  end if;

  if public.checkpoint_step_is_dicing(source_step.name, source_step.slug, source_step.process_area) then
    select * into decision from public.review_dicing_step_checkpoint(
      attempt.id,
      decision_mutation_id,
      notes,
      child_specs
    );
    for child_spec in select value from jsonb_array_elements(child_specs)
    loop
      begin
        child_movement_mutation_id := (child_spec ->> 'movement_mutation_id')::uuid;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'Every dicing child route needs a valid movement mutation id.';
      end;
      if child_movement_mutation_id is null then
        raise exception using errcode = '22023', message = 'Every dicing child route needs a movement mutation id.';
      end if;
      select * into child_wafer from public.wafers child
      where child.project_id = wafer.project_id
        and child.wafer_code = trim(child_spec ->> 'wafer_code')
        and child.metadata ->> 'parent_wafer_id' = wafer.id::text;
      select * into child_assignment from public.wafer_process_assignments
      where wafer_id = child_wafer.id and template_id = attempt.template_id;
      movement := public.move_approved_checkpoint_assignment(
        child_assignment.id,
        destination_step.id,
        child_movement_mutation_id,
        notes
      );
      child_movements := child_movements || jsonb_build_array(movement);
    end loop;
    insert into public.process_events (
      project_id, wafer_id, step_execution_id, actor_id, event_type,
      notes, metadata, client_mutation_id
    ) values (
      wafer.project_id, wafer.id, decision.step_execution_id, auth.uid(),
      'checkpoint_dicing_children_routed', trim(notes),
      jsonb_build_object(
        'assignment_id', attempt.assignment_id,
        'attempt_id', attempt.id,
        'checkpoint_decision_id', decision.id,
        'from_step_id', source_step.id,
        'from_step_name', source_step.name,
        'target_step_id', destination_step.id,
        'target_step_name', destination_step.name,
        'movement_kind', 'checkpoint_dicing_route',
        'child_movements', child_movements
      ),
      movement_mutation_id
    ) returning * into existing_event;
    return jsonb_build_object(
      'event_id', existing_event.id,
      'decision_id', decision.id,
      'assignment_id', attempt.assignment_id,
      'step_execution_id', decision.step_execution_id,
      'target_step_id', destination_step.id,
      'route_decision', 'approved',
      'child_movements', child_movements
    );
  end if;

  select * into decision from public.review_step_checkpoint(
    attempt.id,
    'approved',
    decision_mutation_id,
    notes,
    null
  );
  movement := public.move_approved_checkpoint_assignment(
    attempt.assignment_id,
    destination_step.id,
    movement_mutation_id,
    notes
  );
  return movement || jsonb_build_object(
    'decision_id', decision.id,
    'route_decision', 'approved'
  );
end;
$$;

revoke execute on function public.route_checkpoint_submission(uuid, uuid, uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.route_checkpoint_submission(uuid, uuid, uuid, uuid, text, jsonb)
  to authenticated;

-- Keep checkpoint decisions append-only. The original automatic redo decision
-- remains auditable, while this effective-route event makes the historical UI
-- and downstream reads treat the normal move as approved.
insert into public.process_events (
  project_id,
  wafer_id,
  step_execution_id,
  actor_id,
  event_type,
  notes,
  metadata,
  client_mutation_id
)
select
  route.project_id,
  route.wafer_id,
  route.step_execution_id,
  route.actor_id,
  'checkpoint_step_entered',
  route.notes,
  route.metadata || jsonb_build_object(
    'corrected_event_id', route.id,
    'movement_kind', 'checkpoint_route_auto_redo_correction',
    'route_decision', 'approved',
    'correction_reason', 'route_direction_is_not_a_redo'
  ),
  gen_random_uuid()
from public.process_events route
join public.checkpoint_decisions decision
  on decision.id::text = route.metadata ->> 'checkpoint_decision_id'
where route.event_type = 'checkpoint_step_entered'
  and route.metadata ->> 'movement_kind' = 'checkpoint_redo_route'
  and route.metadata ->> 'from_step_id' is distinct from route.metadata ->> 'target_step_id'
  and decision.decision = 'redo'
  and not exists (
    select 1
    from public.process_events correction
    where correction.metadata ->> 'corrected_event_id' = route.id::text
      and correction.metadata ->> 'movement_kind' = 'checkpoint_route_auto_redo_correction'
  );

comment on function public.route_checkpoint_submission(uuid, uuid, uuid, uuid, text, jsonb) is
  'Routes reviewer-approved work to the chosen process step. Only a same-step repeat is recorded as redo; use review_step_checkpoint for an explicit redo decision.';

notify pgrst, 'reload schema';
