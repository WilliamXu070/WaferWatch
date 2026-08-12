# Process Flow transition state-matrix repair

## Symptom

Valid Process Flow actions can fail with `An unexpected error occurred.`. The confirmed reproduction is dragging a queued die from Beginning to Complete and submitting its checkpoint; PostgREST returns `55000: The canonical operation-run transition is invalid.`

## Expected behavior

Every valid Process Flow transition succeeds atomically and idempotently across queued, running, blocked, awaiting-checkpoint, ready-to-move, redo-required, completed, skipped, and failed states. Invalid or stale transitions return a specific error and leave state unchanged.

## Diagnosis

`execute_process_flow_mutations_batch` enables `waferwatch.canonical_workflow_mutation` and then invokes compatibility checkpoint/movement functions. `enforce_checkpoint_execution_transition` currently requires `step_executions.metadata.operation_run_id` before considering the existing assignment-scoped transition token. Current active compatibility executions have coherent `current_operation_run_member_id` links but lack that metadata, so valid checkpoint submissions fail and roll back. The same ordering can affect route, correction, redo, anytime, and future arrival paths. Existing static verifiers do not execute the real batch RPC, and deployed error normalization hides the database message.

## Plan

1. Add an additive migration that backfills execution identity from the coherent current operation-run member.
2. Preserve canonical validation, but allow a missing canonical ID only when the existing scoped checkpoint or dicing authorization validates.
3. Persist canonical run identity in compatibility execution creation and arrival paths before future protected transitions.
4. Add a full-migration Process Flow action/state verifier covering valid transitions, idempotent retries, and rejected invalid transitions.
5. Preserve detailed Supabase errors through server actions, run every repository and workflow gate, deploy, and verify production health plus an isolated signed-in replay.

## Verification

- Exact batch RPC submission succeeds from every valid submit source state and reaches `awaiting_checkpoint` and `awaiting_review`.
- Approved and redo routes create coherent successor run, member, and execution identity.
- Valid move, correction, anytime, undo, archive, and restore paths succeed once and remain idempotent on retry.
- Invalid state, stale identity, unauthorized reviewer, and reused mutation IDs remain rejected with no partial writes.
- `npm test`, typecheck, lint, build, and all workflow/database verifiers pass.

## Status

Implementation in progress.
