-- Dashboard consumes planned batch identity and members from the same
-- plan/actual projection instead of reconstructing them independently.

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
  coalesce(actual.runs, '[]'::jsonb) as actual_runs,
  plan.batch_name,
  plan.batch_members
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

revoke all on public.vw_plan_actual_state from public, anon;
grant select on public.vw_plan_actual_state to authenticated;

notify pgrst, 'reload schema';
