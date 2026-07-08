## Symptom

When a wafer is moved after dicing and child die wafers are created, notes from the original wafer are not visible on the diced child wafers. The generated child wafer note, for example `Diced piece I1 from IOTA.`, is also rendered as if it were a real note and moves between stages as the current step changes.

## Expected behavior

General and step-scoped notes entered on the original wafer before dicing should remain visible on each diced child wafer after the dicing split creates child wafer records. The move note entered while completing Dicing should appear under the child wafer's Dicing stage, and generated bookkeeping text should not render as a user note.

## Diagnosis

Wafer status notes are stored in `text_surfaces` using scope keys based on `waferId:dieLabel` and `waferId:dieLabel:step:stepId`. Dicing creates new child wafer IDs and die labels, but `splitWaferAfterDicing` only creates wafers, assignments, executions, and process events. It did not copy parent note text surfaces to the child wafer scopes. Also, the Dicing move note lives on the parent dicing `step_executions.run_notes`, not in `text_surfaces`, and child assignments start after Dicing, so the child Dicing stage had no execution note. Finally, the generated `wafers.notes` text `Diced piece ... from ...` was treated as a legacy note and attached to the current step.

## Plan

- Copy parent wafer note text surfaces during `splitWaferAfterDicing`.
- Rewrite only the scope key from parent wafer scope to each child wafer scope.
- Preserve JSON note values and attachment references unchanged.
- Add the parent dicing move note into each child wafer's Dicing step note scope.
- Stop generating `Diced piece ...` as child wafer notes and suppress that generated legacy text for existing child data.
- Add a focused regression test for dicing note scope cloning.

## Verification

- `npm run lint`
- `npm run build`
- `node --test src/features/runs/dicingNoteTransfer.test.ts`
- `curl -s http://localhost:3015/api/health`
- Playwright screenshot of `/process-flow?processId=11111111-1111-4111-8111-111111111103`

## Status

Fixed locally. The CLI browser was unauthenticated, so the exact signed-in dicing move needs live authenticated acceptance.
