# Hot loading and DOM movement performance

## Symptom

Selecting an active process and opening Calendar or Process Flow can take several
seconds even after earlier route-prefetch work. Process Flow moves are painted
optimistically, but command acknowledgement and cross-session convergence are not
measured end to end. The initiating browser also waits for realtime reconciliation
despite the command server already reading the committed workspace delta.

## Expected behavior

- Cold Calendar and Process Flow readiness stays within 2.5 seconds p95.
- Warm session navigation stays within 750 milliseconds p95.
- One-, eight-, and twenty-five-die moves paint optimistically within 100
  milliseconds, acknowledge within 1 second, and converge authoritatively in the
  initiating and second sessions within 1.5 seconds p95.
- Performance proof uses disposable staging fixtures and never mutates real wafer
  data.

## Diagnosis

The authenticated layout and route pages assemble overlapping server-side data,
then `RealtimeWorkflowBridge` starts another no-store workspace snapshot after
hydration. The July route prefetcher warms RSC routes only after load and cannot
serve as a process-keyed session data cache. Movement commands already read and
return a committed revision/delta internally, but the Process Flow action wrapper
drops the delta and the client relies on a later broadcast fetch. Status also uses
a full router refresh on revisions after its prior full-snapshot path exceeded the
authenticated statement timeout.

## Plan

1. Add a bounded additive hot-bootstrap RPC and a three-process in-memory session
   store seeded by the authenticated layout.
2. Reconcile ordered deltas from the stored revision, recover gaps with a bounded
   bootstrap, and remove duplicate startup snapshots.
3. Preserve and apply the command's committed delta in the initiating browser;
   expose stable DOM movement and follow-up states without silent per-item retry.
4. Move Process Flow and Calendar startup data onto the session bootstrap while
   keeping history, archive, reviewers, people, and attachments lazy.
5. Extend the staging-only golden harness with cold/warm navigation and 1/8/25-die
   DOM movement performance reports and blocking budgets.

## Verification

- Exact signed-in staging replay: select a process, open Calendar and Process Flow,
  move one die, move eight dies, move twenty-five dies, verify initiating and
  second-session convergence, then reload and verify canonical persistence.
- Run unit, typecheck, lint, build, migration-chain, workspace, workflow-command,
  checkpoint, Process Flow state, batch, archive, collaboration, planning,
  operation-run, scheduler, and performance gates.
- Replay signed-in production routes read-only, verify `/api/health`, and inspect
  deployment errors for workspace timeouts.

## Rollback and risk

The database change is additive and compatibility RPCs remain. The application is
gated by `WORKSPACE_HOT_LOADING_V2=off|shadow|on`; rollback sets the flag to `off`
and reverts the route/session cutover without rewriting workflow evidence.

## Status

Implementation and local verification are complete behind the default-off flag.
The 73-migration PGlite chain verifies the new RPCs and measures the 500-assignment
hot bootstrap at 75.11 milliseconds p95. Unit, type, lint, build, workflow,
projection, planning, history, scheduler, collaboration, and access gates pass.

Staging acceptance remains blocked because this checkout has no staging project
reference, service-role key, or operator/reviewer storage states. The linked remote
is production and intentionally has not received migrations `202608260001` and
`202608260002`. Do not enable `shadow` or `on` until the additive migrations and
`npm run golden:perf` pass against disposable staging fixtures. GitHub issue
creation is also unavailable because the configured `gh` credential is invalid;
this ticket remains the authoritative local handoff.
