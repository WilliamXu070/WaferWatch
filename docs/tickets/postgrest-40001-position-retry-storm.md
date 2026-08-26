# PostgREST position-conflict retry storm

## Symptom

On 2026-08-26, the production Supabase project reported approximately 3.2–3.4
million Postgres errors in one hour and sustained roughly 96–100% database CPU.
The errors repeated `Process step ... was moved by another collaborator.` for
the Process Flow canvas-position RPC.

## Expected behavior

A stale canvas-position write must roll back once, return HTTP 409 Conflict to
the caller, preserve the winning position, and leave the database available for
normal WaferWatch traffic.

## Diagnosis

`update_process_step_positions_versioned(jsonb)` raises SQLSTATE `40001` for an
ordinary optimistic-concurrency conflict. PostgreSQL reserves `40001` for
`serialization_failure`, and the managed PostgREST 14.15/14.17 workers retry
that code inside the database transaction runner. A single stale position write
therefore became an unbounded internal retry loop. Production evidence included
109,356,572 rollbacks, 3.887 billion request-context statement executions, and
active PostgREST sessions repeatedly executing the position RPC. There were no
blocking queries, deadlocks, long-running queries, or database-size pressure.

## Plan

1. Add an additive migration that preserves the RPC signature and atomic
   compare-and-set behavior but returns PostgREST SQLSTATE `PT409` for stale
   positions.
2. Extend the collaboration verifier to assert the exact `PT409` code as well
   as rollback of every position in the rejected batch.
3. Run the collaboration verifier and the required repository verification
   gates.
4. Apply the migration to production and confirm active retry sessions drain,
   retry counters stop increasing, CPU recovers, and `/api/health` remains
   healthy.

Rollback: restore the previous function body only if required, but never restore
SQLSTATE `40001`; use another non-retryable conflict code. A Supabase service
restart is a last resort only if replacing the function does not drain the old
retry sessions.

## Verification

- `npm test` — 282 tests passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build` — passed.
- Collaboration, checkpoint, Process Flow state, batch lifecycle, archive,
  researcher access, planning, operation-run, workspace-projection, scheduler,
  migration-chain, and workflow-command verifiers — passed.
- Production migration and recovery evidence — pending.

## Status

Locally verified; production mitigation pending. GitHub issue creation is blocked because the
configured `gh` credential is invalid, so this file is the authoritative incident
ticket.
