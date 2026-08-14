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

Resolved and verified in production. GitHub issue creation was unavailable because the configured `gh` credential is invalid, so this repository-local ticket is the release record.
