## Symptom

Moving multiple dies to one step opens the same step-parameter dialog once per die, shown as “N moved items remaining.”

## Expected behavior

One parameter form should apply its values, local rows, and additional notes to every die moved in that batch.

## Diagnosis

`ProcessFlowDiagram` queues one `PendingStepParameterEntry` per successful movement, while `StepParameterEntryDialog` receives only the first entry. Completing the form removes one queue entry, so the dialog repeats even though every entry shares the destination step and schema. Persistence is correctly movement-scoped and still requires one `step_parameter_records` row per movement.

## Plan

- Pass the complete successful-movement batch to one dialog.
- Build one shared payload and save it once for each movement entry.
- Keep the dialog open and report failures if any movement record cannot be saved.
- Add regression coverage for a multi-die batch and run focused tests, lint, build, and Process Flow browser verification.

## Verification

- Four focused dialog tests passed, including one shared submission producing eight movement-scoped records for A1-A8.
- `npm run lint` passed.
- `npm run build` passed outside the sandbox; Turbopack requires permission to bind its internal localhost process.
- `/wireframe/process-flow?processId=9fb7de9e-31b8-4b5a-aea7-8ee64eedb699` at 1280x720 had no horizontal overflow or console errors. The active process data was unavailable in this browser session, so the live multi-die movement was not submitted against production data.

## Status

Resolved locally. GitHub issue creation was blocked because the configured `gh` token is invalid, so this local ticket records the completed work.
