-- The collaboration idempotency key was enforced by a partial unique index.
-- PostgreSQL cannot infer that partial index from the checkpoint workflow's
-- ON CONFLICT (client_mutation_id) clauses, so those branches failed at runtime.
-- A regular UNIQUE constraint preserves multiple NULL values while making the
-- conflict target valid for every process-event writer.

drop index if exists public.process_events_client_mutation_id_idx;

alter table public.process_events
  drop constraint if exists process_events_client_mutation_id_key;

alter table public.process_events
  add constraint process_events_client_mutation_id_key
  unique (client_mutation_id);
