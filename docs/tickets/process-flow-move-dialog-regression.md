## Symptom

After pressing `Move wafer` in Process Flow, the move dialog kept returning and asking for the move again instead of completing the move cleanly.

## Expected behavior

Pressing `Move wafer` should submit the selected source-to-target move once, close the dialog, and persist the source completion plus target queue state in the background.

## Diagnosis

The previous timeline fix added `pending` to the set of current step statuses so first-step moves could complete a pending source execution. The move action still selected the current execution with a broad `existingExecutions.find(...)`, so an unrelated pending execution could be selected before the dialog's source step. That made the action reject with "This wafer is no longer at the source step", and the client restored the move dialog for retry.

## Plan

- Select the current execution by `parsed.sourceStepId`, not by the first active/pending execution on the assignment.
- Keep pending source execution completion for first-step moves.
- Add a focused regression test that proves an earlier pending row does not hijack source selection.

## Verification

- `npm run lint`
- `npm run build`
- `node --test src/features/runs/stepExecutionSelection.test.ts`
- `curl -s http://localhost:3015/api/health`
- Playwright screenshot of `http://localhost:3015/process-flow?processId=11111111-1111-4111-8111-111111111103`

## Status

Fixed locally. The CLI browser session was unauthenticated, so signed-in drag/drop acceptance still needs a live authenticated browser session.
