# Active draft wafer creation regression

## Symptom

On `/process-flow`, an editor can open **Add wafer**, enter a wafer name and die count, and submit, but the UI restores the dialog with `Only published process versions can receive wafers.` / `cannot create wafer`.

## Expected behavior

An authenticated editor should be able to create a wafer at the Beginning step of any active process, including a process just created in the UI.

## Diagnosis

Migration `202607150004_restore_graph_checkpoint_phases.sql` deliberately removed lifecycle gating and made active process templates directly editable. `createProcessTemplate` still creates a process with `lifecycle_status = 'draft'`. Migration `202608240002_atomic_workflow_authoring_commands.sql` later reintroduced `draft` gates for graph authoring and a `published` gate for wafer creation. The UI does not expose a publish action and enables **Add wafer** for the active draft, making the normal Create process -> Add wafer workflow fail by construction.

## Plan

1. Add an additive migration that authorizes step, transition, and wafer commands by active template plus the existing project/role checks, independent of the compatibility lifecycle column.
2. Remove the duplicate published-only server precheck.
3. Update the workflow-command verifier so wafer creation runs against the active draft and asserts inactive processes remain rejected.
4. Replay the signed-in Add wafer workflow and run the full required app/database gates.

## Verification

- Exact UI: Create/select an active draft process -> Add wafer -> fill name/die count -> Create wafer -> wafer appears at Beginning and persists after reload.
- Atomic command: one wafer, assignment, compatibility executions, canonical run/member, evidence event, and workflow revision; retry remains idempotent and forced failure rolls back.
- Security: unauthorized project writes and inactive template writes remain rejected.
- Required `npm test`, typecheck, lint, build, and database/workflow verifiers.

Completed locally:

- The deterministic command reproduction first failed with PostgreSQL `55000` and the reported published-only message, then passed on the same active draft after the fix.
- Active draft wafer creation, active draft/published graph authoring, unauthorized rejection, inactive rejection, idempotent retry, and forced rollback all pass.
- `npm test` passes 275 tests; typecheck, lint, build, migration-chain, workflow-command, checkpoint, process-flow-state, batch, archive, collaboration, researcher, planning, operation-run, workspace-projection, and scheduler gates pass.
- The staging UI replay is unavailable because this checkout has no golden-flow staging credentials. Production replay remains required after release.

## Status

Implemented and locally verified. Production migration, deployment, and signed-in UI replay remain pending.
