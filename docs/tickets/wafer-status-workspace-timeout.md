# Wafer Status workspace timeout

## Symptom

An authenticated visit to `/wafer-status` reaches the shell and then shows
"This page couldn't load" with server-error digest `643496189@E394`.

## Expected behavior

Wafer Status and its workspace snapshot endpoint load the selected active
process within the production database statement deadline.

## Diagnosis

Production Vercel logs map digest `643496189@E394` to PostgreSQL `57014`
(`canceling statement due to statement timeout`) for both `/wafer-status` and
`/api/processes/:processId/workspace`.

`getWaferStatusModel` starts the full workspace snapshot, current-state view,
and operation-history view in parallel. The snapshot already materializes the
current state and history, while the client `RealtimeWorkflowBridge` also
immediately fetches that full snapshot. For the affected production process,
the snapshot contains 25 current rows, 231 history rows, and 75 active batches
and takes roughly 1.2 seconds even with service access; the RLS-scoped request
exceeds its statement deadline.

## Plan

1. Replace the Status route's duplicate snapshot/current/history reads with a
   bounded Status-specific read that obtains only the definition, state, and
   history it renders.
2. Add additive indexes only for the operation-history correlation paths used
   repeatedly by the RLS-scoped projections.
3. Add a production-shaped performance verifier that runs as `authenticated`,
   asserts the Status read remains bounded, and covers a 25-wafer/231-history
   fixture.
4. Run the required application/database gates, apply the migration, deploy,
   then replay the signed-in production `/wafer-status` route and check Vercel
   logs for the absence of `57014`.

## Verification

- Exact repro: signed-in production `/wafer-status` must render Status rather
  than its Server Components error surface.
- The workspace endpoint and Status read must complete below the relevant
  authenticated statement deadline under the fixture and real active process.
- Existing state, history, RLS, and append-only evidence contracts remain
  unchanged.

## Rollback and risk

The database change is additive indexes only. The application change narrows
read composition without mutating workflow evidence. Roll back by reverting the
application commit; indexes are harmless to retain.

## Status

Implemented and deployed in application commit `7cae659`. `npm test` (276
tests), typecheck, lint, build, migration-chain, workflow-command, checkpoint,
Process Flow state, batch, archive, collaboration, researcher, planning,
operation-run, workspace-projection, scheduler, history-correction,
history-recovery, dashboard-history, and analysis-persistence checks pass.

Clean Vercel deployment `dpl_HqjvbmiA4SZAPTof7WpBH1icQ3US` is READY and aliases
`https://wafer-watch.vercel.app`. Production health is HTTP 200. The exact
signed-in `/wafer-status` replay renders Die A1 and its full Process History,
and the deployment's error logs contain no `57014` timeout or Status render
error.

The approved production migration batch is now applied: the index hardening,
the active-process workflow commands, and the requested default-new-account
admin policy are live. The signed-in Process Flow replay and the deployment's
error logs remain clean after the migration. GitHub issue creation is
unavailable because the configured `gh` credential is invalid; this local
ticket records the diagnosis and evidence.
