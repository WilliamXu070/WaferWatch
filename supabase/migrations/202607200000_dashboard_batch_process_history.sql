-- Group checkpoint submissions from one Process Flow action into an append-only
-- dashboard batch without changing the existing checkpoint RPC signature.

alter table public.process_step_attempts
  add column if not exists batch_id uuid generated always as (
    case
      when coalesce(evidence_snapshot ->> '_waferwatch_batch_id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (evidence_snapshot ->> '_waferwatch_batch_id')::uuid
      else null
    end
  ) stored;

create index if not exists process_step_attempts_template_submitted_idx
  on public.process_step_attempts (template_id, submitted_at desc, id desc);

create index if not exists process_step_attempts_batch_idx
  on public.process_step_attempts (batch_id)
  where batch_id is not null;

create or replace view public.vw_process_batch_history
with (security_invoker = true)
as
with attempt_state as (
  select
    attempt.*,
    case
      when withdrawal.id is not null then 'withdrawn'
      when decision.decision = 'approved' then 'approved'
      when decision.decision = 'redo' then 'redo'
      else 'awaiting_review'
    end as history_status
  from public.process_step_attempts attempt
  left join public.checkpoint_decisions decision on decision.attempt_id = attempt.id
  left join public.checkpoint_submission_withdrawals withdrawal on withdrawal.attempt_id = attempt.id
)
select
  coalesce(batch_id::text, min(id::text)) || ':' || process_step_id::text as id,
  batch_id,
  template_id,
  process_step_id,
  max(process_step_name_snapshot) as process_name,
  min(submitted_at) as submitted_at,
  max(submitted_by_name_snapshot) as operator_name,
  nullif(max(submission_notes), '') as note,
  case
    when count(distinct history_status) = 1 then min(history_status)
    else 'mixed'
  end as status,
  count(*)::bigint as sample_count,
  jsonb_agg(
    jsonb_build_object(
      'attemptId', id,
      'label', wafer_code_snapshot,
      'status', history_status
    )
    order by wafer_code_snapshot, id
  ) as samples
from attempt_state
group by coalesce(batch_id, id), batch_id, template_id, process_step_id;

revoke all on public.vw_process_batch_history from public, anon;
grant select on public.vw_process_batch_history to authenticated;

comment on column public.process_step_attempts.batch_id is
  'Shared client batch identity extracted from the immutable checkpoint evidence snapshot.';

comment on view public.vw_process_batch_history is
  'RLS-scoped, append-only checkpoint submissions grouped into dashboard process batches; legacy attempts remain singleton batches.';
