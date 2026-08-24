# Canonical workflow execution and golden-flow verification

## Symptom

- Creating a Process Flow step can fail with `new row violates row-level security policy for table "process_stages"`.
- Calendar and Process Flow components keep durable local mirrors, queues, rollback branches, and command-specific `try/catch` paths that can diverge from the canonical workspace projection.
- Existing database verifiers do not execute every named workflow through the same authenticated mutation boundary used by the UI, and there is no staging-only UI harness for the ten agreed golden flows.

## Expected behavior

The real UI executes Calendar create, move, and delete plus Process Flow step creation, connection, wafer creation, full operator/reviewer movement, batch movement, redo, and archive through one typed command boundary. Each successful command commits once, returns a canonical revision/delta, remains idempotent by mutation ID, and survives reload. Failed commands produce a stable error and no partial writes.

## Diagnosis

`createProcessFlowStep` inserts `process_steps` without `stage_id`. The `ensure_process_step_stage` trigger then inserts the compatibility `process_stages` container as the authenticated user. RLS is enabled on `process_stages`, but the migration chain grants only a read policy, so the hidden trigger insert is rejected. The existing migration-chain fixture creates its initial step before switching to `authenticated`, which misses the exact application path.

The broader workflow already has narrow database commands, operation-run identity, workspace revisions, snapshots, and deltas, but those boundaries are incomplete and inconsistent. Calendar and Process Flow components still own durable state and recovery logic, while the workspace store does not merge every canonical entity required by the agreed flows. A staged command cutover is required; removing component recovery logic before parity would create a larger regression surface.

## Plan

1. Add the exact authenticated Process Flow step regression and an additive, security-definer trigger repair.
2. Add a typed command envelope/result/error contract, handler registry, mutation overlay, and one unexpected-error gateway.
3. Make each command atomic and idempotent, returning exactly one workflow revision and canonical delta.
4. Expand snapshot/delta and store coverage for stages, steps, transitions, current wafer state, calendar, operation history, batches, and archive removals.
5. Cut over Calendar first, then graph/wafer creation, then submit/route/batch/redo/archive. Retire legacy component queues only after command and UI parity.
6. Add staging-only scenario factories and desktop plus 390x844 UI goldens. Backend code establishes only the precondition; the named action runs through the real UI and is verified through canonical projections plus reload.
7. Run all repository and workflow gates, deploy the exact verified commit, prove runtime identity, replay the signed-in workflow, and verify `/api/health` without creating production golden data.

## Rollback and risk

- Applied migrations are never edited; database repair and command infrastructure are additive.
- Compatibility tables and handlers remain until isolated shadow comparison proves projection parity.
- Test fixture endpoints and service-role credentials are staging-only and must fail closed in production.
- The checkout contains unrelated user edits in Process Flow and Calendar UI files. Those changes must remain intact and must not be included in a release unless they are already intended by the user.

## Verification

- Authenticated `process_steps` insert creates exactly one stage and step without an RLS error and is idempotent under the command mutation ID.
- All ten golden flows pass canonical projection assertions and reloaded UI assertions.
- Unauthorized, stale, duplicate, invalid-state, and forced mid-command failures pass with zero partial writes.
- `npm test`, typecheck, lint, build, every required workflow verifier, command goldens, desktop replay, and 390x844 replay pass.

## Status

Implemented locally on 2026-08-24. The RLS repair, command gateway, atomic authoring/archive commands, complete workspace projection/store, UI cutovers, command verifier, and staging-only Playwright harness are present. The final local gate passes 275 unit/component tests, TypeScript, lint, the production build, all required workflow verifiers, the 68-migration chain, and the command-engine database goldens.

The signed-in staging browser gate is pending because this checkout has only one saved auth state and no staging project ref/service-role environment. The 390x844 specification is present and includes a non-mutating visual-viewport check, but there was no physical iPhone keyboard replay. Per the blocking release policy, production deployment and `/api/health` verification must wait for that operator/reviewer staging replay. GitHub issue creation also remains unavailable because the configured `gh` credential is invalid, so this file is the implementation record.
