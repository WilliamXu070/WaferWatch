-- Keep the canonical Status history at one row per effective operation member.
-- Checkpoint decisions, undo events, and shared batch lineage remain append-only;
-- this projection only resolves their effective, member-scoped presentation.

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
    when withdrawal.id is not null
      and (decision.id is null or withdrawal.withdrawn_at >= decision.decided_at)
      then 'withdrawn'
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
left join lateral (
  select candidate.*
  from public.checkpoint_decisions candidate
  where candidate.attempt_id = attempt.id
    and not exists (
      select 1
      from public.process_events undone
      where undone.wafer_id = member.wafer_id
        and undone.event_type = 'wafer_history_undone'
        and undone.metadata ->> 'undone_decision_id' = candidate.id::text
        and coalesce(undone.metadata ->> 'assignment_id', member.assignment_id::text)
          = member.assignment_id::text
    )
  order by candidate.decided_at desc, candidate.id desc
  limit 1
) decision on true
left join lateral (
  select candidate.*
  from public.checkpoint_submission_withdrawals candidate
  where candidate.attempt_id = attempt.id
  order by candidate.withdrawn_at desc, candidate.id desc
  limit 1
) withdrawal on true
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
        and history_member.history_effective
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
    when withdrawal.id is not null
      and (decision.id is null or withdrawal.withdrawn_at >= decision.decided_at)
      then 'withdrawn'
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
left join lateral (
  select candidate.*
  from public.checkpoint_decisions candidate
  where candidate.attempt_id = attempt.id
    and not exists (
      select 1
      from public.process_events undone
      where undone.wafer_id = member.wafer_id
        and undone.event_type = 'wafer_history_undone'
        and undone.metadata ->> 'undone_decision_id' = candidate.id::text
        and coalesce(undone.metadata ->> 'assignment_id', member.assignment_id::text)
          = member.assignment_id::text
    )
  order by candidate.decided_at desc, candidate.id desc
  limit 1
) decision on true
left join lateral (
  select candidate.*
  from public.checkpoint_submission_withdrawals candidate
  where candidate.attempt_id = attempt.id
  order by candidate.withdrawn_at desc, candidate.id desc
  limit 1
) withdrawal on true
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
    ) order by attempt_row.attempt_number, attempt_row.submitted_at, attempt_row.id,
      decision_row.decided_at, decision_row.id
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
    and (
      event.event_type in ('wafer_history_undone', 'wafer_history_correction')
      or (
        event.event_type = 'checkpoint_step_entered'
        and event.metadata ->> 'movement_kind' in (
          'checkpoint_route_auto_redo_correction',
          'checkpoint_route_correction'
        )
        and nullif(event.metadata ->> 'corrected_event_id', '') is not null
        and nullif(event.metadata ->> 'checkpoint_decision_id', '') is not null
      )
    )
    and coalesce(event.metadata ->> 'assignment_id', member.assignment_id::text)
      = member.assignment_id::text
) corrections on true
left join lateral (
  select
    coalesce((
      select jsonb_agg(
        jsonb_build_object('runId', parent.parent_run_id, 'kind', parent.link_kind)
        order by parent.created_at, parent.id
      )
      from public.operation_run_links parent
      where parent.child_run_id = run.id
        and exists (
          select 1
          from public.operation_run_members parent_member
          where parent_member.operation_run_id = parent.parent_run_id
            and parent_member.assignment_id = member.assignment_id
        )
    ), '[]'::jsonb) as parents,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('runId', child.child_run_id, 'kind', child.link_kind)
        order by child.created_at, child.id
      )
      from public.operation_run_links child
      where child.parent_run_id = run.id
        and exists (
          select 1
          from public.operation_run_members child_member
          where child_member.operation_run_id = child.child_run_id
            and child_member.assignment_id = member.assignment_id
        )
    ), '[]'::jsonb) as children
) lineage on true
where member.history_effective;

comment on view public.vw_operation_run_history is
  'One row per effective operation member with append-only checkpoint evidence and assignment-scoped run lineage.';

notify pgrst, 'reload schema';
