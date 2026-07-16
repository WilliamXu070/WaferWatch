# Anytime step rejects Beginning-side drag

## Symptom

A wafer or die on the Beginning side of a main-flow step cannot be dragged into
an anytime step. The node does not become a valid drop target, so the optional
procedure cannot interrupt work that is already in progress.

## Expected behavior

A Beginning-side wafer or die can detour from a main step into an anytime step.
The interrupted main step remains the return point. After the anytime step is
completed and approved, the wafer or die can return to that main step and its
full movement, parameter, note, and checkpoint history remains chronological.

## Diagnosis

The anytime implementation only changed graph rendering and move-target order.
`ProcessFlowDiagram` still permits cross-step drops only for `ready_to_move`
executions, and `move_approved_checkpoint_assignment` enforces the same approved
source-state requirement. A Beginning execution such as `queued` is therefore
rejected in both the client and database transaction.

## Plan

1. Add an atomic database branch for main-to-anytime detours that suspends the
   source execution, activates the anytime execution, and records the movement.
2. Permit Beginning-side drag only when the destination is an anytime step;
   preserve the existing approval requirement for ordinary main-flow moves.
3. Add regression coverage for the exact Beginning-to-anytime case and the
   unchanged main-to-main restriction.
4. Apply the migration and verify drag, saved return point, history, lint, build,
   and the authenticated browser workflow.

## Verification

- Focused checkpoint-phase, graph, node, target, and history tests passed.
- `npm run checkpoint:verify` proved queued main work enters the anytime step,
  leaves the interrupted execution pending, queues the anytime execution, stores
  the return step, annotates history, and still rejects queued main-to-main moves.
- `npm run lint` and `npm run build` passed.
- Migration `202607160002` was applied to the linked database.
- Authenticated Process Flow at 1280x720 selected queued die A2 at Cleaning and
  exposed `Move to Piranha`; there was no horizontal overflow or console error.
  The final live drop was not submitted because it would mutate an operational
  production die, while the same move transaction was exercised in isolation.

## Status

Resolved locally and in the linked database. GitHub issue creation remained
blocked by the expired local `gh` token, so this file tracks the completed fix.
