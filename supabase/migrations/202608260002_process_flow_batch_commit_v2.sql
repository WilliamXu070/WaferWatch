-- Atomic Process Flow batch boundary with explicit process identity and revision.
-- The compatibility RPC remains available for rollback and shadow comparison.

create or replace function public.execute_process_flow_mutations_batch_v2(
  requested_template_id uuid,
  expected_workspace_revision bigint,
  command_mutation_id uuid,
  mutations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mutation jsonb;
  mutation_kind text;
  derived_command_mutation_id uuid;
  mutation_template_id uuid;
  current_revision bigint;
  legacy_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if jsonb_typeof(mutations) <> 'array' or jsonb_array_length(mutations) < 1
     or jsonb_array_length(mutations) > 256 then
    raise exception using errcode = '22023', message = 'A Process Flow batch requires between 1 and 256 mutations.';
  end if;

  derived_command_mutation_id := case
    when mutations -> 0 ->> 'kind' = 'route' then (mutations -> 0 ->> 'movementMutationId')::uuid
    else (mutations -> 0 ->> 'mutationId')::uuid
  end;
  if derived_command_mutation_id <> command_mutation_id then
    raise exception using errcode = '22023', message = 'The batch command id does not match its first operation.';
  end if;

  for mutation in select value from jsonb_array_elements(mutations)
  loop
    mutation_kind := mutation ->> 'kind';
    if mutation_kind = 'submit' then
      select step.template_id into mutation_template_id
      from public.step_executions execution
      join public.process_steps step on step.id = execution.process_step_id
      where execution.id = (mutation ->> 'stepExecutionId')::uuid;
    elsif mutation_kind = 'move' then
      select assignment.template_id into mutation_template_id
      from public.wafer_process_assignments assignment
      where assignment.id = (mutation ->> 'assignmentId')::uuid;
    elsif mutation_kind = 'route' then
      select attempt.template_id into mutation_template_id
      from public.process_step_attempts attempt
      where attempt.id = (mutation ->> 'attemptId')::uuid;
    else
      raise exception using errcode = '22023', message = 'The Process Flow mutation kind is invalid.';
    end if;
    if mutation_template_id is null then
      raise exception using errcode = 'P0002', message = 'A Process Flow mutation target no longer exists.';
    end if;
    if mutation_template_id <> requested_template_id then
      raise exception using errcode = '22023', message = 'The Process Flow batch process identity does not match its assignments.';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(requested_template_id::text, 1));
  if exists (
    select 1
    from public.workflow_change_log change
    where change.template_id = requested_template_id
      and change.client_mutation_id = command_mutation_id
  ) then
    legacy_result := public.execute_process_flow_mutations_batch(mutations);
    return legacy_result || jsonb_build_object(
      'templateId', requested_template_id,
      'mutationId', command_mutation_id
    );
  end if;

  select revision.current_revision
  into current_revision
  from public.workflow_revisions revision
  where revision.template_id = requested_template_id
  for update;
  current_revision := coalesce(current_revision, 0);
  if expected_workspace_revision is not null and current_revision <> expected_workspace_revision then
    raise exception using
      errcode = '40001',
      message = format('The workflow changed before this batch could be applied. Expected revision %s, current revision %s.', expected_workspace_revision, current_revision);
  end if;

  legacy_result := public.execute_process_flow_mutations_batch(mutations);
  return legacy_result || jsonb_build_object(
    'templateId', requested_template_id,
    'mutationId', command_mutation_id
  );
end;
$$;

revoke all on function public.execute_process_flow_mutations_batch_v2(uuid, bigint, uuid, jsonb)
from public, anon;
grant execute on function public.execute_process_flow_mutations_batch_v2(uuid, bigint, uuid, jsonb)
to authenticated;

comment on function public.execute_process_flow_mutations_batch_v2(uuid, bigint, uuid, jsonb) is
  'Validates one process and expected revision before atomically delegating the compatibility batch, returning process and command identity.';

notify pgrst, 'reload schema';
