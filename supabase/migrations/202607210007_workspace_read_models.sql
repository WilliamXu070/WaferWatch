-- Canonical RLS-scoped projections consumed by Process Flow, Dashboard,
-- Calendar, and Wafer Status. History is page-friendly and the workspace
-- snapshot deliberately excludes the unbounded historical member table.

create or replace view public.vw_process_current_state
with (security_invoker = true)
as
select
  assignment.id as assignment_id,
  wafer.project_id,
  assignment.template_id,
  wafer.id as wafer_id,
  wafer.wafer_code,
  wafer.item_type,
  wafer.parent_wafer_id,
  wafer.die_label,
  wafer.wafer_family,
  wafer.die_count,
  wafer.notes as wafer_notes,
  wafer.created_at as wafer_created_at,
  wafer.metadata as wafer_metadata,
  wafer.status as wafer_status,
  assignment.status as assignment_status,
  assignment.revision as assignment_revision,
  assignment.current_step_id,
  assignment.anytime_return_step_id,
  step.name as current_step_name,
  step.slug as current_step_slug,
  step.step_order as current_step_order,
  step.stage_id as current_stage_id,
  stage.name as current_stage_name,
  stage.slug as current_stage_slug,
  stage.stage_order as current_stage_order,
  assignment.current_operation_run_member_id,
  member.operation_run_id as current_operation_run_id,
  member.status as current_member_status,
  member.revision as current_member_revision,
  run.run_kind as current_run_kind,
  run.status as current_run_status,
  run.revision as current_run_revision,
  run.planned_operation_id,
  member.legacy_step_execution_id,
  execution.tool_id as current_tool_id,
  coalesce(execution.operator_id, execution.completed_by, assignment.assigned_by) as current_handler_id,
  coalesce(handler.display_name, handler.email) as current_handler_name,
  step.required_reviewer_id,
  coalesce(reviewer.display_name, reviewer.email) as required_reviewer_name,
  attempt.id as latest_attempt_id,
  attempt.submitted_by as latest_attempt_submitted_by,
  attempt.submission_notes as latest_attempt_notes,
  attempt.submitted_at as latest_submitted_at,
  case
    when withdrawal.id is not null then 'withdrawn'
    when decision.decision is not null then decision.decision
    when attempt.id is not null then 'awaiting_review'
    else null
  end as latest_review_status,
  next_step.name as next_step_name,
  parent_route.source_step_id as checkpoint_route_source_step_id,
  parent_route.source_step_id is not null as can_correct_checkpoint_route,
  coalesce(stage_state.stage_progress, '[]'::jsonb) as stage_progress,
  assignment.assigned_at,
  assignment.started_at,
  assignment.completed_at,
  assignment.archived_at,
  assignment.deleted_at
from public.wafer_process_assignments assignment
join public.wafers wafer on wafer.id = assignment.wafer_id
left join public.process_steps step on step.id = assignment.current_step_id
left join public.process_stages stage on stage.id = step.stage_id
left join public.operation_run_members member on member.id = assignment.current_operation_run_member_id
left join public.operation_runs run on run.id = member.operation_run_id
left join public.step_executions execution on execution.id = member.legacy_step_execution_id
left join public.profiles handler
  on handler.id = coalesce(execution.operator_id, execution.completed_by, assignment.assigned_by)
left join public.profiles reviewer on reviewer.id = step.required_reviewer_id
left join lateral (
  select candidate.name
  from public.process_steps candidate
  where candidate.template_id = assignment.template_id
    and candidate.execution_mode <> 'anytime'
    and candidate.archived_at is null
    and candidate.step_order > step.step_order
  order by candidate.step_order, candidate.id
  limit 1
) next_step on true
left join lateral (
  select parent_run.process_step_id as source_step_id
  from public.operation_run_links link
  join public.operation_runs parent_run on parent_run.id = link.parent_run_id
  join public.operation_run_members parent_member
    on parent_member.operation_run_id = parent_run.id
   and parent_member.assignment_id = assignment.id
  where link.child_run_id = run.id
    and link.link_kind = 'successor'
    and exists (
      select 1
      from public.process_step_attempts route_attempt
      join public.checkpoint_decisions route_decision on route_decision.attempt_id = route_attempt.id
      where route_attempt.operation_run_member_id = parent_member.id
        and route_decision.decision = 'approved'
    )
  order by link.created_at desc
  limit 1
) parent_route on true
left join lateral (
  select candidate.*
  from public.process_step_attempts candidate
  where candidate.operation_run_member_id = member.id
  order by candidate.attempt_number desc, candidate.submitted_at desc, candidate.id desc
  limit 1
) attempt on true
left join public.checkpoint_decisions decision on decision.attempt_id = attempt.id
left join public.checkpoint_submission_withdrawals withdrawal on withdrawal.attempt_id = attempt.id
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'stageId', progress.stage_id,
      'name', progress.stage_name,
      'slug', progress.stage_slug,
      'order', progress.stage_order,
      'status', case
        when progress.total_steps > 0 and progress.completed_steps = progress.total_steps then 'completed'
        when progress.active_steps > 0 or progress.visited_steps > 0 then 'in_progress'
        else 'pending'
      end,
      'completedSteps', progress.completed_steps,
      'totalSteps', progress.total_steps
    ) order by progress.stage_order, progress.stage_id
  ) as stage_progress
  from (
    select
      process_stage.id as stage_id,
      process_stage.name as stage_name,
      process_stage.slug as stage_slug,
      process_stage.stage_order,
      count(child_step.id)::integer as total_steps,
      count(child_step.id) filter (where latest_member.status in ('completed', 'skipped'))::integer as completed_steps,
      count(child_step.id) filter (where latest_member.status in ('queued', 'running', 'blocked', 'awaiting_review', 'redo_required'))::integer as active_steps,
      count(latest_member.id)::integer as visited_steps
    from public.process_stages process_stage
    join public.process_steps child_step
      on child_step.stage_id = process_stage.id and child_step.archived_at is null
    left join lateral (
      select history_member.id, history_member.status
      from public.operation_run_members history_member
      join public.operation_runs history_run on history_run.id = history_member.operation_run_id
      where history_member.assignment_id = assignment.id
        and history_run.process_step_id = child_step.id
      order by history_member.created_at desc, history_member.id desc
      limit 1
    ) latest_member on true
    where process_stage.template_id = assignment.template_id
      and process_stage.archived_at is null
    group by process_stage.id, process_stage.name, process_stage.slug, process_stage.stage_order
  ) progress
) stage_state on true
where assignment.deleted_at is null
  and wafer.deleted_at is null;

create or replace view public.vw_operation_run_history
with (security_invoker = true)
as
select
  member.id as operation_run_member_id,
  run.id as operation_run_id,
  member.legacy_step_execution_id,
  run.template_id,
  wafer.project_id,
  member.assignment_id,
  member.wafer_id,
  wafer.wafer_code,
  wafer.item_type,
  wafer.parent_wafer_id,
  wafer.die_label,
  run.process_step_id,
  step.name as process_step_name,
  step.slug as process_step_slug,
  step.process_area,
  step.execution_mode,
  step.parameters_schema,
  step.step_order,
  step.stage_id,
  stage.name as stage_name,
  stage.slug as stage_slug,
  stage.stage_order,
  run.planned_operation_id,
  run.reason as run_reason,
  run.run_kind,
  run.status as run_status,
  run.revision as run_revision,
  member.status as member_status,
  member.revision as member_revision,
  member.note as member_note,
  member.started_at,
  member.completed_at,
  member.created_at,
  run.created_by,
  coalesce(actor.display_name, actor.email, 'Unknown operator') as created_by_name,
  attempt.id as latest_attempt_id,
  attempt.attempt_number as latest_attempt_number,
  attempt.submitted_at as latest_submitted_at,
  case
    when withdrawal.id is not null then 'withdrawn'
    when decision.decision is not null then decision.decision
    when attempt.id is not null then 'awaiting_review'
    else null
  end as latest_review_status,
  coalesce(parameters.records, '[]'::jsonb) as parameter_records,
  coalesce(notes.records, '[]'::jsonb) as notes,
  coalesce(resources.records, '[]'::jsonb) as resources,
  coalesce(checkpoints.records, '[]'::jsonb) as checkpoint_history,
  coalesce(corrections.records, '[]'::jsonb) as history_corrections,
  coalesce(lineage.parents, '[]'::jsonb) as parent_runs,
  coalesce(lineage.children, '[]'::jsonb) as child_runs
from public.operation_run_members member
join public.operation_runs run on run.id = member.operation_run_id
join public.wafers wafer on wafer.id = member.wafer_id
join public.process_steps step on step.id = run.process_step_id
join public.process_stages stage on stage.id = step.stage_id
left join public.profiles actor on actor.id = run.created_by
left join lateral (
  select candidate.*
  from public.process_step_attempts candidate
  where candidate.operation_run_member_id = member.id
  order by candidate.attempt_number desc, candidate.submitted_at desc, candidate.id desc
  limit 1
) attempt on true
left join public.checkpoint_decisions decision on decision.attempt_id = attempt.id
left join public.checkpoint_submission_withdrawals withdrawal on withdrawal.attempt_id = attempt.id
left join lateral (
  select jsonb_agg(
    to_jsonb(record) || jsonb_build_object(
      'recorded_by_name', coalesce(parameter_actor.display_name, parameter_actor.email)
    ) order by record.recorded_at, record.id
  ) as records
  from public.operation_run_parameter_records record
  left join public.profiles parameter_actor on parameter_actor.id = record.recorded_by
  where record.operation_run_id = run.id
    and (record.operation_run_member_id is null or record.operation_run_member_id = member.id)
) parameters on true
left join lateral (
  select jsonb_agg(to_jsonb(note) order by note.created_at, note.id) as records
  from public.operation_run_notes note
  where note.operation_run_id = run.id
    and (note.operation_run_member_id is null or note.operation_run_member_id = member.id)
) notes on true
left join lateral (
  select jsonb_agg(to_jsonb(resource) order by resource.recorded_at, resource.id) as records
  from public.operation_run_resources resource
  where resource.operation_run_id = run.id
    and (resource.operation_run_member_id is null or resource.operation_run_member_id = member.id)
) resources on true
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'attemptId', attempt_row.id,
      'attemptNumber', attempt_row.attempt_number,
      'submittedAt', attempt_row.submitted_at,
      'startedAt', attempt_row.started_at_snapshot,
      'submissionNote', attempt_row.submission_notes,
      'submittedById', attempt_row.submitted_by,
      'submittedByName', attempt_row.submitted_by_name_snapshot,
      'stepName', attempt_row.process_step_name_snapshot,
      'decisionId', decision_row.id,
      'decision', decision_row.decision,
      'decidedAt', decision_row.decided_at,
      'decisionNote', decision_row.decision_notes,
      'decidedById', decision_row.decided_by,
      'decidedByName', decision_row.decided_by_name_snapshot,
      'targetStepId', decision_row.target_step_id,
      'targetStepName', decision_row.target_step_name_snapshot,
      'supersedesDecisionId', null,
      'withdrawalId', withdrawal_row.id,
      'withdrawnAt', withdrawal_row.withdrawn_at,
      'withdrawalReason', withdrawal_row.withdrawal_reason,
      'withdrawnById', withdrawal_row.withdrawn_by,
      'withdrawnByName', withdrawal_row.withdrawn_by_name_snapshot
    ) order by attempt_row.attempt_number, attempt_row.submitted_at, attempt_row.id
  ) as records
  from public.process_step_attempts attempt_row
  left join public.checkpoint_decisions decision_row on decision_row.attempt_id = attempt_row.id
  left join public.checkpoint_submission_withdrawals withdrawal_row on withdrawal_row.attempt_id = attempt_row.id
  where attempt_row.operation_run_member_id = member.id
) checkpoints on true
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id', event.id,
      'eventType', event.event_type,
      'eventAt', event.event_at,
      'actorId', event.actor_id,
      'actorName', coalesce(event_actor.display_name, event_actor.email),
      'notes', event.notes,
      'metadata', event.metadata
    ) order by event.event_at, event.id
  ) as records
  from public.process_events event
  left join public.profiles event_actor on event_actor.id = event.actor_id
  where event.wafer_id = member.wafer_id
    and event.event_type in ('wafer_history_undone', 'wafer_history_correction')
    and coalesce(event.metadata ->> 'assignment_id', member.assignment_id::text) = member.assignment_id::text
) corrections on true
left join lateral (
  select
    coalesce(jsonb_agg(jsonb_build_object('runId', parent.parent_run_id, 'kind', parent.link_kind))
      filter (where parent.id is not null), '[]'::jsonb) as parents,
    coalesce(jsonb_agg(jsonb_build_object('runId', child.child_run_id, 'kind', child.link_kind))
      filter (where child.id is not null), '[]'::jsonb) as children
  from public.operation_runs lineage_run
  left join public.operation_run_links parent on parent.child_run_id = lineage_run.id
  left join public.operation_run_links child on child.parent_run_id = lineage_run.id
  where lineage_run.id = run.id
) lineage on true;

create or replace view public.vw_batch_run_state
with (security_invoker = true)
as
select
  run.id as operation_run_id,
  run.template_id,
  run.process_step_id,
  step.name as process_step_name,
  step.stage_id,
  stage.name as stage_name,
  run.planned_operation_id,
  run.run_kind,
  run.status as run_status,
  case
    when count(distinct member.status) = 1 then min(member.status)
    else 'mixed'
  end as member_status,
  count(*)::bigint as member_count,
  count(*) filter (where member.status in ('completed', 'skipped'))::bigint as completed_count,
  count(*) filter (where member.status in ('redo_required', 'rejected'))::bigint as redo_count,
  min(member.started_at) as started_at,
  max(member.completed_at) as completed_at,
  run.created_at,
  run.revision,
  jsonb_agg(jsonb_build_object(
    'memberId', member.id,
    'assignmentId', member.assignment_id,
    'waferId', member.wafer_id,
    'label', wafer.wafer_code,
    'status', member.status,
    'revision', member.revision,
    'note', member.note
  ) order by wafer.wafer_code, member.id) as members
from public.operation_runs run
join public.operation_run_members member on member.operation_run_id = run.id
join public.wafers wafer on wafer.id = member.wafer_id
join public.process_steps step on step.id = run.process_step_id
join public.process_stages stage on stage.id = step.stage_id
group by run.id, step.name, step.stage_id, stage.name;

create or replace view public.vw_plan_current_state
with (security_invoker = true)
as
select
  plan.id as plan_id,
  plan.project_id,
  plan.template_id,
  revision.id as plan_revision_id,
  revision.revision_number,
  revision.status as revision_status,
  revision.row_version as plan_revision_row_version,
  revision.id = plan.shared_draft_revision_id as is_shared_draft,
  revision.id = plan.current_published_revision_id as is_current_published,
  revision.planning_starts_at,
  revision.planning_ends_at,
  operation.id as planned_operation_id,
  operation.logical_id as operation_logical_id,
  operation.process_step_id,
  step.name as process_step_name,
  step.stage_id,
  stage.name as stage_name,
  operation.planned_batch_id,
  batch.logical_id as batch_logical_id,
  batch.name as batch_name,
  operation.name as operation_name,
  operation.description,
  operation.scheduled_start_at,
  operation.scheduled_end_at,
  operation.status as operation_status,
  operation.user_pinned,
  operation.row_version as operation_row_version,
  coalesce(batch_members.members, '[]'::jsonb) as batch_members,
  coalesce(parameters.records, '[]'::jsonb) as parameters,
  coalesce(resources.records, '[]'::jsonb) as resources,
  coalesce(dependencies.predecessors, '[]'::jsonb) as predecessors,
  coalesce(dependencies.successors, '[]'::jsonb) as successors
from public.process_plans plan
join public.process_plan_revisions revision
  on revision.id in (plan.shared_draft_revision_id, plan.current_published_revision_id)
join public.planned_operations operation on operation.revision_id = revision.id
join public.process_steps step on step.id = operation.process_step_id
join public.process_stages stage on stage.id = step.stage_id
left join public.planned_batches batch on batch.id = operation.planned_batch_id
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'assignmentId', member.assignment_id,
    'waferId', assignment.wafer_id,
    'label', wafer.wafer_code
  ) order by wafer.wafer_code, member.assignment_id) as members
  from public.planned_batch_members member
  join public.wafer_process_assignments assignment on assignment.id = member.assignment_id
  join public.wafers wafer on wafer.id = assignment.wafer_id
  where member.planned_batch_id = batch.id
) batch_members on true
left join lateral (
  select jsonb_agg(to_jsonb(parameter) order by parameter.assignment_id nulls first, parameter.parameter_key) as records
  from public.planned_operation_parameters parameter
  where parameter.planned_operation_id = operation.id
) parameters on true
left join lateral (
  select jsonb_agg(
    to_jsonb(resource)
      || jsonb_build_object(
        'personName', person.display_name,
        'toolName', tool.name,
        'recipeName', recipe.name,
        'locationName', location.name
      )
    order by resource.resource_kind, resource.id
  ) as records
  from public.planned_operation_resources resource
  left join public.process_people person on person.id = resource.person_id
  left join public.fabrication_tools tool on tool.id = resource.tool_id
  left join public.recipes recipe on recipe.id = resource.recipe_id
  left join public.fabrication_locations location on location.id = resource.location_id
  where resource.planned_operation_id = operation.id
) resources on true
left join lateral (
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'operationId', predecessor.id,
      'logicalId', predecessor.logical_id,
      'lagMinutes', predecessor_link.lag_minutes
    )) filter (where predecessor.id is not null), '[]'::jsonb) as predecessors,
    coalesce(jsonb_agg(jsonb_build_object(
      'operationId', successor.id,
      'logicalId', successor.logical_id,
      'lagMinutes', successor_link.lag_minutes
    )) filter (where successor.id is not null), '[]'::jsonb) as successors
  from public.planned_operations dependency_operation
  left join public.planned_operation_dependencies predecessor_link
    on predecessor_link.successor_operation_id = dependency_operation.id
  left join public.planned_operations predecessor on predecessor.id = predecessor_link.predecessor_operation_id
  left join public.planned_operation_dependencies successor_link
    on successor_link.predecessor_operation_id = dependency_operation.id
  left join public.planned_operations successor on successor.id = successor_link.successor_operation_id
  where dependency_operation.id = operation.id
) dependencies on true
where plan.is_active;

create or replace view public.vw_plan_actual_state
with (security_invoker = true)
as
select
  plan.plan_id,
  plan.project_id,
  plan.template_id,
  plan.plan_revision_id,
  plan.revision_status,
  plan.is_shared_draft,
  plan.is_current_published,
  plan.planned_operation_id,
  plan.operation_logical_id,
  plan.process_step_id,
  plan.process_step_name,
  plan.stage_id,
  plan.stage_name,
  plan.scheduled_start_at,
  plan.scheduled_end_at,
  plan.operation_status as planned_status,
  coalesce(actual.run_count, 0)::bigint as actual_run_count,
  actual.first_started_at,
  actual.last_completed_at,
  coalesce(actual.runs, '[]'::jsonb) as actual_runs
from public.vw_plan_current_state plan
left join lateral (
  select
    count(*)::bigint as run_count,
    min(run.started_at) as first_started_at,
    max(run.completed_at) as last_completed_at,
    jsonb_agg(jsonb_build_object(
      'runId', run.id,
      'kind', run.run_kind,
      'status', run.status,
      'startedAt', run.started_at,
      'completedAt', run.completed_at,
      'memberCount', (select count(*) from public.operation_run_members member where member.operation_run_id = run.id)
    ) order by run.created_at, run.id) as runs
  from public.operation_runs run
  where run.planned_operation_id = plan.planned_operation_id
) actual on true;

create or replace view public.vw_process_calendar_state
with (security_invoker = true)
as
select
  operation.planned_operation_id as id,
  'planned_operation'::text as source_kind,
  operation.template_id as process_template_id,
  operation.project_id,
  case when jsonb_array_length(operation.batch_members) = 1
    then (operation.batch_members -> 0 ->> 'waferId')::uuid else null end as wafer_id,
  operation.process_step_id,
  operation.process_step_name as action_name,
  operation.description,
  operation.scheduled_start_at as starts_at,
  operation.scheduled_end_at as ends_at,
  location.id as location_id,
  location.name as location,
  operation.planned_operation_id,
  null::uuid as manual_event_id,
  operation.operation_row_version as revision,
  coalesce(people.names, '[]'::jsonb) as people
from public.vw_plan_current_state operation
left join lateral (
  select resource.location_id as id, resource."locationName" as name
  from jsonb_to_recordset(operation.resources) as resource(
    resource_kind text,
    location_id uuid,
    "locationName" text
  )
  where resource.resource_kind = 'location'
  limit 1
) location on true
left join lateral (
  select jsonb_agg(
    jsonb_build_object('id', resource.person_id, 'display_name', resource."personName")
    order by resource."personName"
  ) as names
  from jsonb_to_recordset(operation.resources) as resource(
    resource_kind text,
    person_id uuid,
    "personName" text
  )
  where resource.resource_kind = 'person'
) people on true
where operation.is_shared_draft

union all

select
  event.id,
  'manual_event'::text,
  event.process_template_id,
  coalesce(template.owner_project_id, wafer.project_id),
  event.wafer_id,
  event.process_step_id,
  coalesce(event.manual_action, event.process_step_name_snapshot, 'Manual action'),
  event.description,
  event.starts_at,
  event.ends_at,
  event.location_id,
  event.location,
  null::uuid,
  event.id,
  event.revision,
  coalesce(people.names, '[]'::jsonb)
from public.process_calendar_events event
join public.process_templates template on template.id = event.process_template_id
left join public.wafers wafer on wafer.id = event.wafer_id
left join lateral (
  select jsonb_agg(
    jsonb_build_object('id', person.id, 'display_name', person.display_name)
    order by person.display_name
  ) as names
  from public.process_calendar_event_people link
  join public.process_people person on person.id = link.person_id
  where link.event_id = event.id
) people on true
where not exists (
  select 1 from public.planned_operations operation
  where operation.legacy_calendar_event_id = event.id
);

create or replace function public.get_process_workspace_snapshot(target_template_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'templateId', target_template_id,
    'revision', coalesce((select current_revision from public.workflow_revisions where template_id = target_template_id), 0),
    'processDefinition', jsonb_build_object(
      'stages', coalesce((
        select jsonb_agg(
          to_jsonb(stage) || jsonb_build_object(
            'steps', coalesce((
              select jsonb_agg(to_jsonb(step) order by step.stage_step_order, step.id)
              from public.process_steps step
              where step.stage_id = stage.id and step.archived_at is null
            ), '[]'::jsonb)
          ) order by stage.stage_order, stage.id
        )
        from public.process_stages stage
        where stage.template_id = target_template_id and stage.archived_at is null
      ), '[]'::jsonb),
      'transitions', coalesce((
        select jsonb_agg(to_jsonb(transition) order by transition.priority, transition.id)
        from public.process_step_transitions transition
        where transition.template_id = target_template_id
      ), '[]'::jsonb)
    ),
    'currentState', coalesce((
      select jsonb_agg(to_jsonb(state) order by state.wafer_code, state.assignment_id)
      from public.vw_process_current_state state
      where state.template_id = target_template_id
        and state.archived_at is null
    ), '[]'::jsonb),
    'plan', coalesce((
      select jsonb_agg(to_jsonb(plan) order by plan.revision_status, plan.scheduled_start_at, plan.planned_operation_id)
      from public.vw_plan_current_state plan
      where plan.template_id = target_template_id
    ), '[]'::jsonb),
    'activeBatchRuns', coalesce((
      select jsonb_agg(to_jsonb(batch) order by batch.created_at, batch.operation_run_id)
      from public.vw_batch_run_state batch
      where batch.template_id = target_template_id
        and batch.run_status in ('queued', 'running', 'blocked', 'awaiting_review', 'redo_required')
    ), '[]'::jsonb),
    'calendar', coalesce((
      select jsonb_agg(to_jsonb(calendar) order by calendar.starts_at, calendar.id)
      from public.vw_process_calendar_state calendar
      where calendar.process_template_id = target_template_id
        and calendar.ends_at >= now() - interval '8 days'
        and calendar.starts_at <= now() + interval '92 days'
    ), '[]'::jsonb)
  )
$$;

create or replace function public.get_process_workspace_delta(
  target_template_id uuid,
  after_revision bigint
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with current_pointer as (
    select coalesce(current_revision, 0) as current_revision
    from public.workflow_revisions
    where template_id = target_template_id
  ),
  available as (
    select coalesce(min(revision), 1) as minimum_revision
    from public.workflow_change_log
    where template_id = target_template_id
  ),
  candidates as (
    select change.*
    from public.workflow_change_log change
    where change.template_id = target_template_id
      and change.revision > after_revision
    order by change.revision
    limit 101
  ),
  changes as (
    select * from candidates order by revision limit 100
  ),
  assignment_ids as (
    select distinct candidate.value::uuid as id
    from changes change
    cross join lateral jsonb_array_elements_text(coalesce(change.changed_entities -> 'assignmentIds', '[]'::jsonb)) candidate(value)
  ),
  run_ids as (
    select distinct candidate.value::uuid as id
    from changes change
    cross join lateral jsonb_array_elements_text(coalesce(change.changed_entities -> 'operationRunIds', '[]'::jsonb)) candidate(value)
  ),
  member_ids as (
    select distinct candidate.value::uuid as id
    from changes change
    cross join lateral jsonb_array_elements_text(coalesce(change.changed_entities -> 'operationRunMemberIds', '[]'::jsonb)) candidate(value)
  ),
  operation_ids as (
    select distinct candidate.value::uuid as id
    from changes change
    cross join lateral jsonb_array_elements_text(coalesce(change.changed_entities -> 'plannedOperationIds', '[]'::jsonb)) candidate(value)
  ),
  stage_ids as (
    select distinct candidate.value::uuid as id
    from changes change
    cross join lateral jsonb_array_elements_text(coalesce(change.changed_entities -> 'processStageIds', '[]'::jsonb)) candidate(value)
  ),
  step_ids as (
    select distinct candidate.value::uuid as id
    from changes change
    cross join lateral jsonb_array_elements_text(coalesce(change.changed_entities -> 'processStepIds', '[]'::jsonb)) candidate(value)
  ),
  ids as (
    select
      coalesce((select jsonb_agg(id order by id) from assignment_ids), '[]'::jsonb) as assignment_ids,
      coalesce((select jsonb_agg(id order by id) from run_ids), '[]'::jsonb) as run_ids,
      coalesce((select jsonb_agg(id order by id) from member_ids), '[]'::jsonb) as member_ids,
      coalesce((select jsonb_agg(id order by id) from operation_ids), '[]'::jsonb) as operation_ids,
      coalesce((select jsonb_agg(id order by id) from stage_ids), '[]'::jsonb) as stage_ids,
      coalesce((select jsonb_agg(id order by id) from step_ids), '[]'::jsonb) as step_ids
  )
  select jsonb_build_object(
    'templateId', target_template_id,
    'afterRevision', after_revision,
    'revision', coalesce((select max(revision) from changes), after_revision),
    'currentRevision', coalesce((select current_revision from current_pointer), 0),
    'hasMore', (select count(*) > 100 from candidates),
    'hasGap', after_revision < (select minimum_revision - 1 from available),
    'changes', coalesce((select jsonb_agg(to_jsonb(change) order by change.revision) from changes change), '[]'::jsonb),
    'removedEntityIds', (select jsonb_build_object(
      'assignmentIds', assignment_ids,
      'operationRunIds', run_ids,
      'operationRunMemberIds', member_ids,
      'plannedOperationIds', operation_ids,
      'processStageIds', stage_ids,
      'processStepIds', step_ids
    ) from ids),
    'currentState', coalesce((
      select jsonb_agg(to_jsonb(state) order by state.assignment_id)
      from public.vw_process_current_state state
      where state.assignment_id in (select id from assignment_ids)
    ), '[]'::jsonb),
    'operationHistory', coalesce((
      select jsonb_agg(to_jsonb(history) order by history.created_at, history.operation_run_member_id)
      from public.vw_operation_run_history history
      where history.operation_run_id in (select id from run_ids)
         or history.operation_run_member_id in (select id from member_ids)
    ), '[]'::jsonb),
    'batchRuns', coalesce((
      select jsonb_agg(to_jsonb(batch) order by batch.created_at, batch.operation_run_id)
      from public.vw_batch_run_state batch
      where batch.operation_run_id in (select id from run_ids)
    ), '[]'::jsonb),
    'plan', coalesce((
      select jsonb_agg(to_jsonb(plan) order by plan.planned_operation_id)
      from public.vw_plan_current_state plan
      where plan.planned_operation_id in (select id from operation_ids)
    ), '[]'::jsonb),
    'processDefinition', (select jsonb_build_object(
      'stages', coalesce((
        select jsonb_agg(to_jsonb(stage) order by stage.stage_order, stage.id)
        from public.process_stages stage
        where stage.id in (select id from stage_ids)
      ), '[]'::jsonb),
      'steps', coalesce((
        select jsonb_agg(to_jsonb(step) order by step.stage_step_order, step.id)
        from public.process_steps step
        where step.id in (select id from step_ids)
      ), '[]'::jsonb)
    ) from ids)
  )
$$;

revoke all on public.vw_process_current_state, public.vw_operation_run_history,
  public.vw_batch_run_state, public.vw_plan_current_state,
  public.vw_plan_actual_state, public.vw_process_calendar_state
from public, anon;
grant select on public.vw_process_current_state, public.vw_operation_run_history,
  public.vw_batch_run_state, public.vw_plan_current_state,
  public.vw_plan_actual_state, public.vw_process_calendar_state
to authenticated;

revoke all on function public.get_process_workspace_snapshot(uuid) from public, anon;
revoke all on function public.get_process_workspace_delta(uuid, bigint) from public, anon;
grant execute on function public.get_process_workspace_snapshot(uuid) to authenticated;
grant execute on function public.get_process_workspace_delta(uuid, bigint) to authenticated;

comment on view public.vw_process_current_state is 'Canonical current assignment/run/stage projection for all product routes.';
comment on view public.vw_operation_run_history is 'Canonical append-only actual operation history, one row per run member.';
comment on view public.vw_plan_actual_state is 'Published/draft plan shadow with aggregate actual run completion.';
comment on function public.get_process_workspace_delta(uuid, bigint) is 'Returns at most 100 ordered committed revisions and only the affected canonical rows.';

notify pgrst, 'reload schema';
