-- Align every latest append-only route correction, including older automatic
-- corrections, with whether the destination had already been performed when
-- the route occurred. Migration 202608140003 repaired manual corrections; this
-- follow-up covers the older automatic correction layer without editing it.

-- These rows supersede display evidence only. The generic compatibility trigger
-- must not relink their inherited historical attempt as the assignment's
-- current operation member.
alter table public.process_events
  disable trigger process_events_link_effective_history;

with ranked_routes as (
  select
    event.*,
    case
      when event.metadata ->> 'movement_kind' = 'checkpoint_route_auto_redo_correction'
        then coalesce(corrected.event_at, event.event_at)
      else event.event_at
    end as route_anchor_at,
    row_number() over (
      partition by
        event.metadata ->> 'assignment_id',
        event.metadata ->> 'checkpoint_decision_id'
      order by event.event_at desc, event.id desc
    ) as route_rank
  from public.process_events event
  left join public.process_events corrected
    on corrected.id::text = event.metadata ->> 'corrected_event_id'
  where event.event_type = 'checkpoint_step_entered'
    and event.metadata ->> 'movement_kind' in (
      'checkpoint_route_auto_redo_correction',
      'checkpoint_route_correction'
    )
    and event.metadata ->> 'checkpoint_decision_id' is not null
    and coalesce(event.metadata ->> 'assignment_id', '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and coalesce(event.metadata ->> 'target_step_id', '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
), evaluated_routes as (
  select
    route.*,
    exists (
      select 1
      from public.operation_run_members prior_member
      join public.operation_runs prior_run on prior_run.id = prior_member.operation_run_id
      where prior_member.assignment_id = (route.metadata ->> 'assignment_id')::uuid
        and prior_member.history_effective
        and prior_run.process_step_id = (route.metadata ->> 'target_step_id')::uuid
        and (
          prior_member.completed_at <= route.route_anchor_at
          or exists (
            select 1
            from public.process_step_attempts prior_attempt
            where prior_attempt.operation_run_member_id = prior_member.id
              and prior_attempt.submitted_at <= route.route_anchor_at
          )
        )
    ) as destination_was_performed
  from ranked_routes route
  where route.route_rank = 1
), incorrect_routes as (
  select route.*
  from evaluated_routes route
  where route.metadata ->> 'route_decision' is distinct from case
    when route.destination_was_performed then 'redo'
    else 'approved'
  end
)
insert into public.process_events (
  project_id, wafer_id, step_execution_id, actor_id, event_type,
  event_at, notes, metadata, client_mutation_id
)
select
  route.project_id,
  route.wafer_id,
  -- Route labels are historical projection evidence. Do not relink an old
  -- execution as the assignment's current canonical member.
  null,
  route.actor_id,
  'checkpoint_step_entered',
  now(),
  'Aligned effective checkpoint route with performed destination evidence.',
  route.metadata || jsonb_build_object(
    'corrected_event_id', route.id,
    'movement_kind', 'checkpoint_route_auto_redo_correction',
    'route_decision', case when route.destination_was_performed then 'redo' else 'approved' end,
    'correction_reason', 'effective_destination_performance_evidence',
    'history_repair_version', '202608140004'
  ),
  gen_random_uuid()
from incorrect_routes route;

alter table public.process_events
  enable trigger process_events_link_effective_history;

notify pgrst, 'reload schema';
