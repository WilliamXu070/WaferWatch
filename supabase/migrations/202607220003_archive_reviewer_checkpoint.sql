-- Treat Archive as a terminal approval destination for the assigned reviewer.
-- Submitted checkpoint evidence is approved before the wafer or die is archived.

create or replace function public.archive_completed_wafer_assignments(
  target_assignment_ids uuid[],
  mutation_ids uuid[]
)
returns table (assignment_id uuid, wafer_id uuid, archived_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_count integer := coalesce(cardinality(target_assignment_ids), 0);
  target_index integer;
  assignment public.wafer_process_assignments%rowtype;
  wafer public.wafers%rowtype;
  current_execution public.step_executions%rowtype;
  pending_attempt public.process_step_attempts%rowtype;
  current_member public.operation_run_members%rowtype;
  archive_time timestamptz := now();
  reviewed_during_archive boolean;
begin
  if target_count = 0 or target_count > 200 then
    raise exception using errcode = '22023', message = 'Select between 1 and 200 wafers or dies with a completed current step to archive.';
  end if;
  if target_count <> coalesce(cardinality(mutation_ids), 0) then
    raise exception using errcode = '22023', message = 'Every archive item requires an idempotency key.';
  end if;
  if (select count(distinct candidate) from unnest(target_assignment_ids) candidate) <> target_count
     or (select count(distinct candidate) from unnest(mutation_ids) candidate) <> target_count then
    raise exception using errcode = '22023', message = 'Archive items and idempotency keys must be unique.';
  end if;

  for target_index in 1..target_count loop
    reviewed_during_archive := false;

    select * into assignment
    from public.wafer_process_assignments candidate
    where candidate.id = target_assignment_ids[target_index]
    for update;

    if assignment.id is null then
      raise exception using errcode = 'P0002', message = 'The selected process assignment no longer exists.';
    end if;

    select * into wafer
    from public.wafers candidate
    where candidate.id = assignment.wafer_id
    for update;

    if wafer.id is null or wafer.deleted_at is not null or assignment.deleted_at is not null then
      raise exception using errcode = 'P0002', message = 'The selected wafer or die is no longer active.';
    end if;
    if auth.uid() is null or not public.can_edit_project(wafer.project_id) then
      raise exception using errcode = '42501', message = 'You do not have permission to archive this wafer or die.';
    end if;
    if wafer.archived_at is not null or assignment.archived_at is not null then
      raise exception using errcode = '55000', message = 'This wafer or die is already archived.';
    end if;

    select * into current_execution
    from public.step_executions execution
    where execution.assignment_id = assignment.id
      and execution.wafer_id = wafer.id
      and execution.process_step_id = assignment.current_step_id
    for update;

    if current_execution.status = 'awaiting_checkpoint' then
      select * into pending_attempt
      from public.process_step_attempts attempt
      where attempt.assignment_id = assignment.id
        and attempt.step_execution_id = current_execution.id
        and not exists (
          select 1 from public.checkpoint_decisions decision
          where decision.attempt_id = attempt.id
        )
        and not exists (
          select 1 from public.checkpoint_submission_withdrawals withdrawal
          where withdrawal.attempt_id = attempt.id
        )
      order by attempt.attempt_number desc
      limit 1
      for update;

      if pending_attempt.id is null then
        raise exception using errcode = '55000', message = 'The current checkpoint submission is not available for review.';
      end if;

      perform public.review_step_checkpoint(
        pending_attempt.id,
        'approved',
        public.derived_mutation_uuid(mutation_ids[target_index], assignment.id, 'archive-review'),
        'Approved by the assigned reviewer during archive.',
        null
      );
      reviewed_during_archive := true;

      if assignment.current_operation_run_member_id is not null then
        select * into current_member
        from public.operation_run_members member
        where member.id = assignment.current_operation_run_member_id
        for update;

        if current_member.id is null
           or current_member.assignment_id <> assignment.id
           or current_member.status <> 'awaiting_review' then
          raise exception using errcode = '40001', message = 'The current run member changed before archive review.';
        end if;

        update public.operation_run_members member
        set status = 'completed', completed_at = coalesce(member.completed_at, now())
        where member.id = current_member.id;

        update public.operation_runs run
        set status = case
              when exists (
                select 1 from public.operation_run_members member
                where member.operation_run_id = run.id and member.status = 'awaiting_review'
              ) then 'awaiting_review'
              when exists (
                select 1 from public.operation_run_members member
                where member.operation_run_id = run.id and member.status = 'rejected'
              ) then 'redo_required'
              else 'completed'
            end,
            completed_at = case when not exists (
              select 1 from public.operation_run_members member
              where member.operation_run_id = run.id and member.status = 'awaiting_review'
            ) then coalesce(run.completed_at, now()) else run.completed_at end
        where run.id = current_member.operation_run_id;
      end if;

      select * into current_execution
      from public.step_executions execution
      where execution.id = current_execution.id;
    end if;

    if not (
      (wafer.status = 'completed' and assignment.status = 'completed' and assignment.completed_at is not null)
      or current_execution.status in ('completed', 'ready_to_move')
    ) then
      raise exception using errcode = '55000', message = 'Only completed steps or checkpoints approved by their assigned reviewer can be archived.';
    end if;
    if exists (
      select 1
      from public.wafer_process_assignments other
      where other.wafer_id = wafer.id
        and other.id <> assignment.id
        and other.deleted_at is null
        and other.archived_at is null
    ) then
      raise exception using errcode = '55000', message = 'This wafer or die still has another active process assignment.';
    end if;

    update public.wafer_process_assignments
    set archived_at = archive_time, archived_by = auth.uid()
    where id = assignment.id;

    update public.wafers
    set archived_at = archive_time, archived_by = auth.uid()
    where id = wafer.id;

    insert into public.process_events (
      project_id, wafer_id, actor_id, event_type, notes, metadata, client_mutation_id
    ) values (
      wafer.project_id,
      wafer.id,
      auth.uid(),
      'wafer_archived',
      'Archived after completing the current process step.',
      jsonb_build_object(
        'assignment_id', assignment.id,
        'template_id', assignment.template_id,
        'archived_step_id', assignment.current_step_id,
        'assignment_status', assignment.status,
        'checkpoint_approved_during_archive', reviewed_during_archive,
        'archived_at', archive_time
      ),
      mutation_ids[target_index]
    ) on conflict (client_mutation_id) do nothing;

    assignment_id := assignment.id;
    wafer_id := wafer.id;
    archived_at := archive_time;
    return next;
  end loop;
end;
$$;

revoke execute on function public.archive_completed_wafer_assignments(uuid[], uuid[])
  from public, anon;
grant execute on function public.archive_completed_wafer_assignments(uuid[], uuid[])
  to authenticated;
