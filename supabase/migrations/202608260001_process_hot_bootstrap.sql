-- Bounded, route-shared cold bootstrap for the authenticated workspace shell.
-- The complete snapshot remains available during shadow comparison and rollback.

create or replace function public.get_process_hot_bootstrap(
  target_template_id uuid,
  range_start timestamptz,
  range_end timestamptz
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  if range_end <= range_start or range_end > range_start + interval '8 days' then
    raise exception 'Hot bootstrap calendar range must be greater than zero and no more than 8 days.'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'templateId', template.id,
    'revision', coalesce(revision.current_revision, 0),
    'generatedAt', now(),
    'calendarRange', jsonb_build_object(
      'from', range_start,
      'to', range_end
    ),
    'processSummary', jsonb_build_object(
      'id', template.id,
      'name', template.name,
      'version', template.version,
      'ownerProjectId', template.owner_project_id
    ),
    'statusSummary', jsonb_build_object(
      'assignmentCount', coalesce(state_counts.assignment_count, 0),
      'waferCount', coalesce(state_counts.wafer_count, 0),
      'awaitingReviewCount', coalesce(state_counts.awaiting_review_count, 0)
    ),
    'processDefinition', jsonb_build_object(
      'stages', coalesce((
        select jsonb_agg(to_jsonb(stage) order by stage.stage_order, stage.id)
        from public.process_stages stage
        where stage.template_id = template.id
          and stage.archived_at is null
      ), '[]'::jsonb),
      'steps', coalesce((
        select jsonb_agg(to_jsonb(step) order by step.step_order, step.id)
        from public.process_steps step
        where step.template_id = template.id
          and step.archived_at is null
      ), '[]'::jsonb),
      'transitions', coalesce((
        select jsonb_agg(to_jsonb(transition) order by transition.priority, transition.id)
        from public.process_step_transitions transition
        where transition.template_id = template.id
      ), '[]'::jsonb)
    ),
    'currentState', coalesce((
      select jsonb_agg(to_jsonb(state) order by state.wafer_code, state.assignment_id)
      from public.vw_process_current_state state
      where state.template_id = template.id
        and state.archived_at is null
        and state.deleted_at is null
    ), '[]'::jsonb),
    'calendar', coalesce((
      select jsonb_agg(to_jsonb(calendar) order by calendar.starts_at, calendar.id)
      from public.vw_process_calendar_state calendar
      where calendar.process_template_id = template.id
        and calendar.ends_at > range_start
        and calendar.starts_at < range_end
    ), '[]'::jsonb)
  )
  into result
  from public.process_templates template
  left join public.workflow_revisions revision on revision.template_id = template.id
  left join lateral (
    select
      count(*)::integer as assignment_count,
      count(distinct state.wafer_id)::integer as wafer_count,
      count(*) filter (where state.latest_review_status = 'awaiting_review')::integer as awaiting_review_count
    from public.vw_process_current_state state
    where state.template_id = template.id
      and state.archived_at is null
      and state.deleted_at is null
  ) state_counts on true
  where template.id = target_template_id
    and template.is_active;

  if result is null then
    raise exception 'Process is unavailable.' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

revoke all on function public.get_process_hot_bootstrap(uuid, timestamptz, timestamptz)
from public, anon;
grant execute on function public.get_process_hot_bootstrap(uuid, timestamptz, timestamptz)
to authenticated;

comment on function public.get_process_hot_bootstrap(uuid, timestamptz, timestamptz) is
  'Returns one revision-aligned active process definition, current assignment projection, status summary, and at most eight days of calendar data.';

notify pgrst, 'reload schema';
