## Symptom

When a wafer is moved after dicing and child die wafers are created, notes from the original wafer are not visible on the diced child wafers.

## Expected behavior

General and step-scoped notes entered on the original wafer before dicing should remain visible on each diced child wafer after the dicing split creates child wafer records.

## Diagnosis

Wafer status notes are stored in `text_surfaces` using scope keys based on `waferId:dieLabel` and `waferId:dieLabel:step:stepId`. Dicing creates new child wafer IDs and die labels, but `splitWaferAfterDicing` only creates wafers, assignments, executions, and process events. It does not copy parent note text surfaces to the child wafer scopes.

## Plan

- Copy parent wafer note text surfaces during `splitWaferAfterDicing`.
- Rewrite only the scope key from parent wafer scope to each child wafer scope.
- Preserve JSON note values and attachment references unchanged.
- Add a focused regression test for dicing note scope cloning.

## Verification

- `npm run lint`
- `npm run build`
- `node --test src/features/runs/dicingNoteTransfer.test.ts`
- `curl -s http://localhost:3015/api/health`
- Playwright screenshot of `/process-flow?processId=11111111-1111-4111-8111-111111111103`

## Status

Fixed locally. The CLI browser was unauthenticated, so the exact signed-in dicing move needs live authenticated acceptance.
