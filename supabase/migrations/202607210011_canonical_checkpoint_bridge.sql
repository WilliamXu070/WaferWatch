-- Permit the canonical operation-run RPCs to maintain the legacy singleton
-- execution without weakening checkpoint protection for ordinary writes.

create or replace function public.enforce_checkpoint_execution_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment public.wafer_process_assignments%rowtype;
  execution_step public.process_steps%rowtype;
  current_step public.process_steps%rowtype;
  authorized boolean := false;
  canonical_run_id uuid;
begin
  if tg_op = 'UPDATE' and (
    new.assignment_id is distinct from old.assignment_id
    or new.wafer_id is distinct from old.wafer_id
    or new.process_step_id is distinct from old.process_step_id
  ) then
    raise exception using errcode = '55000', message = 'Step execution identity is immutable.';
  end if;

  select * into assignment from public.wafer_process_assignments where id = new.assignment_id;
  select * into execution_step from public.process_steps where id = new.process_step_id;
  select * into current_step from public.process_steps where id = assignment.current_step_id;

  if new.wafer_id is distinct from assignment.wafer_id
     or execution_step.template_id is distinct from assignment.template_id then
    raise exception using errcode = '55000', message = 'Step executions must match their assignment and process.';
  end if;

  if current_setting('waferwatch.canonical_workflow_mutation', true) = 'on' then
    canonical_run_id := nullif(new.metadata ->> 'operation_run_id', '')::uuid;
    if canonical_run_id is null or not exists (
      select 1
      from public.operation_runs run
      where run.id = canonical_run_id
        and run.template_id = assignment.template_id
        and run.process_step_id = execution_step.id
    ) then
      raise exception using errcode = '55000', message = 'The canonical operation-run transition is invalid.';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    authorized := public.checkpoint_transition_is_authorized(assignment.id, new.id)
      or public.checkpoint_dicing_child_is_authorized(assignment.wafer_id, assignment.template_id, execution_step.id);
    if authorized then
      if new.status not in ('queued', 'redo_required', 'ready_to_move') then
        raise exception using errcode = '55000', message = 'Checkpoint actions created an invalid execution state.';
      end if;
    elsif execution_step.id = current_step.id then
      if new.status <> 'queued' then
        raise exception using errcode = '55000', message = 'The current step must begin queued.';
      end if;
    elsif new.status <> 'pending' then
      raise exception using errcode = '55000', message = 'Non-current steps must begin pending.';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and new.process_step_id is distinct from assignment.current_step_id
     and not public.checkpoint_transition_is_authorized(new.assignment_id, new.id) then
    raise exception using errcode = '55000', message = 'Only the current step can be worked before a checkpoint action.';
  end if;
  if new.status is distinct from old.status
     and (
       new.status in ('awaiting_checkpoint', 'ready_to_move', 'completed', 'redo_required')
       or old.status in ('awaiting_checkpoint', 'ready_to_move', 'completed')
     )
     and not public.checkpoint_transition_is_authorized(new.assignment_id, new.id) then
    raise exception using errcode = '55000', message = 'Protected status changes require an explicit checkpoint action.';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_checkpoint_execution_transition() from public, anon, authenticated;
