-- Complete the canonical workspace document so every command can reconcile
-- through one ordered projection rather than component-owned durable mirrors.

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
      'steps', coalesce((
        select jsonb_agg(to_jsonb(step) order by step.step_order, step.id)
        from public.process_steps step
        where step.template_id = target_template_id and step.archived_at is null
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
        and state.deleted_at is null
    ), '[]'::jsonb),
    'archivedState', coalesce((
      select jsonb_agg(to_jsonb(state) order by state.archived_at desc, state.assignment_id)
      from public.vw_process_current_state state
      where state.template_id = target_template_id
        and state.archived_at is not null
        and state.deleted_at is null
    ), '[]'::jsonb),
    'operationHistory', coalesce((
      select jsonb_agg(to_jsonb(history) order by history.created_at, history.operation_run_member_id)
      from (
        select candidate.*
        from public.vw_operation_run_history candidate
        where candidate.template_id = target_template_id
        order by candidate.created_at desc, candidate.operation_run_member_id desc
        limit 1000
      ) history
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
  wafer_ids as (
    select distinct candidate.value::uuid as id
    from changes change
    cross join lateral jsonb_array_elements_text(coalesce(change.changed_entities -> 'waferIds', '[]'::jsonb)) candidate(value)
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
  calendar_event_ids as (
    select distinct candidate.value::uuid as id
    from changes change
    cross join lateral jsonb_array_elements_text(coalesce(change.changed_entities -> 'calendarEventIds', '[]'::jsonb)) candidate(value)
  ),
  calendar_ids as (
    select id from calendar_event_ids
    union
    select id from operation_ids
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
  transition_ids as (
    select distinct candidate.value::uuid as id
    from changes change
    cross join lateral jsonb_array_elements_text(coalesce(change.changed_entities -> 'processTransitionIds', '[]'::jsonb)) candidate(value)
  ),
  ids as (
    select
      coalesce((select jsonb_agg(id order by id) from assignment_ids), '[]'::jsonb) as assignment_ids,
      coalesce((select jsonb_agg(id order by id) from wafer_ids), '[]'::jsonb) as wafer_ids,
      coalesce((select jsonb_agg(id order by id) from run_ids), '[]'::jsonb) as run_ids,
      coalesce((select jsonb_agg(id order by id) from member_ids), '[]'::jsonb) as member_ids,
      coalesce((select jsonb_agg(id order by id) from operation_ids), '[]'::jsonb) as operation_ids,
      coalesce((select jsonb_agg(id order by id) from calendar_ids), '[]'::jsonb) as calendar_ids,
      coalesce((select jsonb_agg(id order by id) from stage_ids), '[]'::jsonb) as stage_ids,
      coalesce((select jsonb_agg(id order by id) from step_ids), '[]'::jsonb) as step_ids,
      coalesce((select jsonb_agg(id order by id) from transition_ids), '[]'::jsonb) as transition_ids
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
      'waferIds', wafer_ids,
      'operationRunIds', run_ids,
      'operationRunMemberIds', member_ids,
      'plannedOperationIds', operation_ids,
      'calendarEventIds', calendar_ids,
      'processStageIds', stage_ids,
      'processStepIds', step_ids,
      'processTransitionIds', transition_ids
    ) from ids),
    'currentState', coalesce((
      select jsonb_agg(to_jsonb(state) order by state.assignment_id)
      from public.vw_process_current_state state
      where state.assignment_id in (select id from assignment_ids)
        and state.archived_at is null
        and state.deleted_at is null
    ), '[]'::jsonb),
    'archivedState', coalesce((
      select jsonb_agg(to_jsonb(state) order by state.assignment_id)
      from public.vw_process_current_state state
      where state.assignment_id in (select id from assignment_ids)
        and state.archived_at is not null
        and state.deleted_at is null
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
    'calendar', coalesce((
      select jsonb_agg(to_jsonb(calendar) order by calendar.starts_at, calendar.id)
      from public.vw_process_calendar_state calendar
      where calendar.id in (select id from calendar_ids)
    ), '[]'::jsonb),
    'processDefinition', (select jsonb_build_object(
      'stages', coalesce((
        select jsonb_agg(to_jsonb(stage) order by stage.stage_order, stage.id)
        from public.process_stages stage
        where stage.id in (select id from stage_ids) and stage.archived_at is null
      ), '[]'::jsonb),
      'steps', coalesce((
        select jsonb_agg(to_jsonb(step) order by step.stage_step_order, step.id)
        from public.process_steps step
        where step.id in (select id from step_ids) and step.archived_at is null
      ), '[]'::jsonb),
      'transitions', coalesce((
        select jsonb_agg(to_jsonb(transition) order by transition.priority, transition.id)
        from public.process_step_transitions transition
        where transition.id in (select id from transition_ids)
      ), '[]'::jsonb)
    ) from ids)
  )
$$;

comment on function public.get_process_workspace_snapshot(uuid) is
  'Canonical bounded workspace state, including definition, active/archive state, recent history, batches, plan, and calendar.';
comment on function public.get_process_workspace_delta(uuid, bigint) is
  'Returns at most 100 ordered revisions with complete changed canonical entities and explicit active/archive removals.';

-- This table was introduced after the original schema-wide authenticated
-- grants. Its RLS policies still scope every visible row to an accessible
-- template; the grant only lets the invoker projection evaluate those rows.
grant select on public.process_step_transitions, public.process_people,
  public.process_calendar_events, public.process_calendar_event_people
to authenticated;

notify pgrst, 'reload schema';
