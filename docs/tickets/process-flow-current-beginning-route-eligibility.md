## Symptom

An active wafer or die at Beginning cannot be dragged to replace the prior checkpoint's destination, even though its current Beginning was created by a valid checkpoint route.

## Expected behavior

Dragging one active main-flow item from its current Beginning to another main step should open the existing movement-parameter flow, supersede the mistaken arrival, and retain append-only checkpoint history.

## Diagnosis

Process Flow projected one `activeRouteByAssignmentId` by the latest route-event timestamp. Migration `202607170003` appends historical false-redo corrections after the die's current route, so a correction for an old visit can overwrite the current-arrival eligibility. Production `ALPHA_1` is at Post-Bake from a valid checkpoint move, but a later backfilled Spin Coating correction made `canCorrectCheckpointRoute` false and blocked the drag. The correction RPC itself already selects the current target arrival correctly.

## Plan

1. Project correction eligibility from the effective route event targeting the assignment's current step, not the assignment's last historical route event.
2. Preserve the existing history/timeline correction projection.
3. Add a regression that reproduces a later historical correction after the current arrival, then verify the Beginning-to-Beginning route through the checkpoint workflow and production UI surface.

## Verification

- Production `ALPHA_1` reproduced the stale assignment-wide route projection.
- The focused current-arrival projection regression, `npm run checkpoint:verify`,
  `npm run lint`, and `npm run build` pass.
- Production deployment `dpl_BH6bNtayRw7uvj6PZ5wWectjbyin` is Ready and the
  configured production health endpoint returned HTTP 200.

## Status

Closed in GitHub issue #38.
