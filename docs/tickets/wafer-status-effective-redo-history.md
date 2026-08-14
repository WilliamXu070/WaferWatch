# Wafer Status effective redo history

## Symptom

- Every diced child shows Dicing twice in Process History.
- An ordinary corrected route can still render as `Redo → <destination>`.
- A genuine redo highlights the completed source visit instead of the new repeated destination visit.

## Expected behavior

- A diced child inherits the one real parent Dicing visit without also showing its zero-duration child handoff marker.
- Append-only checkpoint-route corrections determine the effective decision shown in history.
- Completed work remains visible. A redo is a distinct destination visit, and that repeated visit carries the redo highlight.

## Diagnosis

Production BETA_8 proves all three causes:

1. The parent Dicing member completed at `2026-07-17T13:15:01.583493Z`; every child has a checkpoint-free, zero-duration Dicing marker at that exact timestamp. `mergeParentHistory` retains both.
2. The raw Pre-Bake decision was historically stored as redo-to-Chromium, then append-only event `9f3dddba-d769-4212-8c47-712191c7b586` corrected it to an approved route. `vw_operation_run_history.history_corrections` excludes checkpoint route-correction events, so `buildCanonicalHistory` still uses the superseded raw decision.
3. `buildStepVisitHistory` maps a redo decision onto the completed source as `returned`; the destination operation run already has separate `run_kind = 'redo'` identity but does not receive the redo history action.

No assignment contains two independently performed Dicing visits, and current routing already preserves completed source operation members. No destructive data repair is needed.

## Plan

1. Add a new migration that exposes append-only effective checkpoint-route correction events through `vw_operation_run_history`.
2. Resolve the latest effective correction per checkpoint decision before building the checkpoint timeline.
3. Suppress only checkpoint-free, zero-duration child handoff visits that exactly match an inherited parent completion.
4. Keep the completed source visit normal and attach the redo action/highlight to the repeated destination visit.
5. Add exact regression fixtures for the duplicated parent/child Dicing pair, the corrected Pre-Bake-to-Chromium forward route, and completed Chromium followed by a Pre-Bake redo visit.
6. Run the full required gates plus checkpoint, operation-run, workspace-projection, and migration-chain verification.

## Rollback and risk

The migration changes only a canonical view filter. Raw checkpoint decisions, correction events, operation runs, and operation members remain append-only and unchanged. Rolling back the application commit restores the prior presentation; the additional view evidence remains safe for older clients because the JSON column shape is unchanged.

## Verification

- Exact regression: one inherited parent Dicing visit replaces the matching zero-duration child marker.
- Exact regression: corrected Pre-Bake-to-Chromium evidence resolves to approved, not redo.
- Exact regression: completed Chromium remains normal while the current Pre-Bake redo destination is highlighted.
- 265 tests, typecheck, lint, and production build pass.
- `checkpoint:verify`, `history-correction:verify`, `history-recovery:verify`, `operation-runs:verify`, `process-flow-states:verify`, `workspace-projection:verify`, `planning:verify`, `scheduler:verify`, and `migration-chain:verify` pass.
- Migration `202608140001_effective_status_history.sql` applied successfully to the linked Supabase project.
- Production deployment `dpl_BgrVyLFb9eDy9RzJN2B2XQacrB8p` was promoted successfully.
- Authenticated production replay of BETA_8 shows one Dicing visit, retains completed Pre-Bake and Chromium Deposition visits, and attaches `Redo → Spin Coating` to the actual repeated destination visit.
- `GET https://wafer-watch.vercel.app/api/health` returned HTTP 200 with `{"ok":true}` and healthy Supabase state.

## Status

Reopened on 2026-08-14 after the production-wide history audit found that route correction still inferred redo from process order instead of performed destination evidence.

## Reopened diagnosis — 2026-08-14

### Symptom

- A1 shows EBL twice and labels both visits as redo even though its only EBL checkpoint is attempt 1.
- Other dies can label a first-time corrected destination as redo, or store a repeated destination as approved.
- Completed source visits, true repeat visits, operation batches, and append-only checkpoint evidence must remain intact.

### Diagnosis

The read-only production audit covered all 18 active die assignments, 127 effective operation members, and 93 checkpoint attempts. Three effective route corrections disagree with performed destination evidence:

- A1 Spin Coating to first-time EBL is stored as redo but must be approved.
- B4 Post-Bake to first-time Pad Formation is stored as redo but must be approved.
- B10 Cleaning to previously performed Pre-Bake is stored as approved but must be redo.

`correct_checkpoint_route_assignment` classifies corrections with `destination_step.step_order <= checkpoint_step.step_order`. Step order is recipe presentation, not proof that the destination was already performed. The Status model then trusts both the correction outcome and `operation_runs.run_kind`, so one bad classification can highlight both the empty destination wrapper and the later completed member.

A1 has one effective EBL member with no completion or checkpoint evidence followed by one completed EBL member carrying attempt 1. The empty member is a superseded false-redo route entry. B9's superficially similar single Post-Bake redo is genuine: it carries attempt 2 after attempt 1 was undone, and must remain highlighted.

### Plan

1. Replace step-order inference with canonical prior-performance evidence for the correction destination.
2. Append effective correction events for the three misclassified production routes; never rewrite checkpoint decisions.
3. Mark only A1's evidence-free EBL wrapper ineffective using a generic, rerunnable recovery predicate; preserve its raw member, completed EBL attempt, operation run, and batch membership.
4. Require redo presentation evidence: a prior performed visit of the same step or a later checkpoint attempt number.
5. Add exact regressions for first-time EBL, repeated Pre-Bake, and B9's attempt-2 redo.
6. Re-audit all active die histories, run every required workflow/database gate, and replay A1/B4/B10/B9 plus a normal control die on desktop and 390x844.

### Rollback and risk

The repair is additive and rerunnable. It adds superseding events and changes only the effective-history flag of evidence-free placeholders. Raw events, checkpoint attempts and decisions, completed operation members, operation links, batch IDs, and batch membership remain present. The function replacement keeps its public signature and idempotency contract.

### Status

Implemented and locally verified. The focused history regressions, 268-test suite, typecheck, lint, production build, 64-migration chain, and all required workflow/database verifiers pass. The linked Supabase dry run selects only migration `202608140003_history_redo_evidence_repair.sql`. Production migration, deployment, and signed-in desktop/mobile replay remain pending. GitHub issue update is unavailable because the configured `gh` credential is invalid; this existing repository-local ticket remains the release record.
