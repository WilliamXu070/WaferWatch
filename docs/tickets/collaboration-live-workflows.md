# Live workflow collaboration

Tracking: [GitHub issue #21](https://github.com/WilliamXu070/WaferWatch/issues/21)

## CPU diagnosis

The hosted database is small (about 18 MB) and cache hit rates are 100%. The
15-day statement sample instead attributes 70.8% of database execution time to
137,138 `realtime.list_changes` calls. Per-request/RLS setup accounts for a
further 18.1% across 17.6 million calls. The old global bridge subscribed every
session to canonical tables without a process filter, then re-ran 12–25 server
queries after each row change. Local `.next` and `supabase/.temp` directories do
not contribute to hosted Supabase CPU.

## Implemented locally

- Database triggers emit compact invalidation payloads through private
  `workflow:process:<processId>`, `workflow:library`, and `team:messages`
  Broadcast topics. Topic access is enforced on `realtime.messages`.
- One authenticated bridge subscribes only to the selected process plus library
  metadata, coalesces bursts for 350 ms, dispatches targeted in-page events, and
  refreshes server data once.
- Result-image and text-surface components consume the bridge event instead of
  creating additional Realtime channels. No application code subscribes to
  `postgres_changes`.
- Migration `202607150008_scoped_workflow_broadcast.sql` removes workflow tables
  from `supabase_realtime` and restores default replica identity, eliminating
  the per-subscriber `list_changes` authorization path.
- Migration `202607150009_process_event_idempotency_constraint.sql` replaces the
  partial process-event mutation index with a real unique constraint. This makes
  checkpoint `ON CONFLICT (client_mutation_id)` branches valid while preserving
  multiple `NULL` values.
- Dashboard queries now constrain templates, steps, transitions, assignments,
  and calendar events in SQL when a process is selected. Calendar fallback loads
  one active process directly instead of reading every template and graph.
- Existing optimistic concurrency remains intact for calendar revisions,
  process-flow compare-and-swap, atomic wafer movement, note merging, parameter
  patches, and versioned result metrics.

Verification:

- `npm run collaboration:verify` — passes concurrency checks, verifies private
  process/team Broadcast payloads and topic authorization, and confirms no
  canonical table remains in the public Realtime publication.
- Realtime helper tests — 3 passed.
- `npm run checkpoint:verify` — passed all checkpoint, dicing, reviewer, and
  soft-delete transaction checks.
- `npm run lint` — passes.
- `npm run build` — passes.
- Authenticated browser at `http://127.0.0.1:3013`, 1440x1000:
  - Calendar selected the active process without horizontal overflow or console
    errors.
  - Process Flow rendered eight database steps without horizontal overflow or
    console errors.
  - Team Messages rendered normally but reports `Reconnecting` until the pending
    Broadcast migration is deployed.
- `supabase db push --linked --dry-run` — only migrations `202607150008` and
  `202607150009` are pending.

Deployment gate:

- The hosted project already contains migrations through `202607150007`.
- Deploy this application code, immediately push migrations `202607150008` and
  `202607150009`, then reload open clients. Do not push `202607150008` ahead of
  the matching application deploy: it intentionally removes the tables used by
  the currently deployed Postgres Changes client.
- After deployment, run an authenticated two-browser mutation check and compare
  `pg_stat_statements` over the next workload window. The success signal is that
  `realtime.list_changes` stops accumulating calls while cross-client Calendar,
  Process Flow, notes, results, and team messages continue updating.
