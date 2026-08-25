-- Keep authenticated workspace and Status projections inside the statement
-- deadline. These indexes match the correlated run/member and lineage lookups
-- performed by the security-invoker read models; they do not change RLS or
-- durable workflow evidence.

create index if not exists operation_run_members_effective_run_assignment_wafer_idx
  on public.operation_run_members (operation_run_id, assignment_id, wafer_id)
  where history_effective;

create index if not exists operation_run_links_child_created_idx
  on public.operation_run_links (child_run_id, created_at desc, id);

create index if not exists operation_run_links_parent_created_idx
  on public.operation_run_links (parent_run_id, created_at desc, id);
