## Symptom

In Process Flow, opening Add wafer, changing the wafer name, and submitting can close and immediately reopen the same dialog without explaining why the wafer was not added.

## Expected behavior

Valid names create the wafer. Invalid, duplicate, or rejected names keep the dialog actionable and show the exact error beside the form.

## Diagnosis

The dialog enabled submission for every non-empty name, while the server applied stricter wafer-name validation and project-wide uniqueness. On failure, `ProcessFlowDiagram` removed the optimistic wafer, reopened the draft, and placed the server error in the canvas message behind the modal. The visible result was a repeated form with no explanation.

## Plan

1. Share the server wafer-name pattern with client validation.
2. Display validation and server-action failures inside the dialog.
3. Clear stale errors when the user edits or cancels.
4. Preserve optimistic creation for valid submissions.
5. Give every form control a stable `id` and `name` so browser form diagnostics and autofill can identify them.
6. Verify the rename-and-submit path, focused tests, lint, and build.

## Verification

- Direct validator check passes: `custom wafer` is accepted and `custom/wafer` returns the same actionable message used by the server.
- The wafer name and size controls now have stable `id` and `name` attributes with explicit label associations; the name field also references its inline error.
- `npm run lint` completes with two unrelated existing unused-variable warnings in `src/features/text-surfaces/actions.ts` and `src/features/wafers/actions.ts`.
- `npm run build` passes.
- Process Flow runs at `http://127.0.0.1:3001/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103` with a healthy API response and zero browser console errors at `1440x1000`.
- The Playwright account has no active process access, so the exact Add wafer interaction remains auth/data-gated.
- The repository has no TSX-capable test runner configured; direct `node --test` cannot load the existing `.tsx` dialog test file.

## Status

Fixed in code with validator coverage. Production Add wafer was subsequently blocked because deployed code wrote `wafer_process_assignments.current_step_id` before the collaboration migration had reached the linked Supabase database.

On 2026-07-14, `202607130001_collaboration_foundation.sql` was dry-run and applied to production. The local and remote migration ledgers now match, PostgREST successfully selects `current_step_id` and `revision`, and the production health endpoint is green. User-level Add wafer acceptance should be retried against production.
