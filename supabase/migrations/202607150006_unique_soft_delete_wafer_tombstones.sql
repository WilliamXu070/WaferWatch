-- A deleted wafer code must stay unique even when imported or deterministic UUIDs
-- share a prefix. Use the complete wafer UUID in the audit tombstone.

create or replace function public.soft_delete_process_flow_wafer_family(
  target_project_id uuid,
  target_wafer_ids uuid[]
)
returns table (wafer_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_wafer_ids uuid[];
  existing_wafer_count integer;
  deleted_time timestamptz := now();
begin
  select array_agg(distinct candidate_id order by candidate_id)
  into normalized_wafer_ids
  from unnest(target_wafer_ids) as candidates(candidate_id)
  where candidate_id is not null;

  if coalesce(cardinality(normalized_wafer_ids), 0) = 0 then
    raise exception using errcode = '22023', message = 'Select at least one wafer or die to delete.';
  end if;

  if auth.uid() is null or not public.can_edit_project(target_project_id) then
    raise exception using errcode = '42501', message = 'You do not have permission to delete this wafer or die.';
  end if;

  select count(*)
  into existing_wafer_count
  from public.wafers wafer
  where wafer.project_id = target_project_id
    and wafer.id = any(normalized_wafer_ids);

  if existing_wafer_count <> cardinality(normalized_wafer_ids) then
    raise exception using errcode = 'P0002', message = 'One or more selected wafers or dies no longer exists.';
  end if;

  update public.wafer_process_assignments assignment
  set
    status = 'scrapped',
    deleted_at = coalesce(assignment.deleted_at, deleted_time),
    deleted_by = coalesce(assignment.deleted_by, auth.uid())
  where assignment.wafer_id = any(normalized_wafer_ids)
    and assignment.deleted_at is null;

  update public.wafers wafer
  set
    status = 'scrapped',
    wafer_code = wafer.wafer_code || '__deleted__' || replace(wafer.id::text, '-', ''),
    metadata = coalesce(wafer.metadata, '{}'::jsonb) || jsonb_build_object(
      'process_flow_deleted_at', deleted_time,
      'process_flow_deleted_by', auth.uid(),
      'process_flow_deleted_wafer_code', wafer.wafer_code
    ),
    deleted_at = deleted_time,
    deleted_by = auth.uid()
  where wafer.project_id = target_project_id
    and wafer.id = any(normalized_wafer_ids)
    and wafer.deleted_at is null;

  return query select unnest(normalized_wafer_ids);
end;
$$;

revoke execute on function public.soft_delete_process_flow_wafer_family(uuid, uuid[]) from public;
revoke execute on function public.soft_delete_process_flow_wafer_family(uuid, uuid[]) from anon;
grant execute on function public.soft_delete_process_flow_wafer_family(uuid, uuid[]) to authenticated;
