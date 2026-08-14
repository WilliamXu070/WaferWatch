-- Surface append-only checkpoint route corrections through the canonical
-- operation history. The JSON column already carries history evidence, so this
-- remains backward compatible while allowing Status to resolve the effective
-- decision instead of rendering a superseded automatic redo.

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

comment on view public.vw_operation_run_history is
  'Canonical append-only actual operation history, including effective checkpoint route correction evidence.';

notify pgrst, 'reload schema';
