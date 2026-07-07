## Symptom

When a user creates a loop/connection in `/calendar`-adjacent Process Flow work and then inserts a new step into the middle of an existing connection, the graph does not regenerate that segment. The old connection remains instead of becoming `source -> new step -> target`.

The visible step information can also repeat itself, for example showing a step named `Poling` with a `Poling` subtitle.

## Expected Behavior

Creating a step on an existing connection should split the connection:

- remove `A -> B`
- create `A -> New`
- create `New -> B`
- persist the same transition replacement on the backend

The node card should not repeat identical title/subtitle text.

## Diagnosis

`ProcessFlowDiagram.tsx` currently supports isolated node creation and manual transition creation, but there is no edge-splitting path. `createNode` always appends a standalone optimistic node. `finishConnection` only creates one new transition and never rewires an existing edge.

`FlowNodeCard.tsx` always renders both `node.label` and `node.subLabel`. If `process_area` matches the name, duplicated visible text is expected from the current render path.

## Plan

1. Add a pure graph helper to detect when a new node point falls on/near an existing edge and to split that edge into two transitions.
2. Use the helper from `createNode` so double-clicking a connection inserts the new step into that connection.
3. Delete the replaced transition when it is persisted, or cancel its pending local queue when it is still optimistic.
4. Queue persistence for the two new transitions, relying on existing optimistic-step ID remapping.
5. Add a label helper that suppresses subtitle text when it duplicates the title.
6. Add focused tests for edge hit detection/splitting and duplicate subtitle suppression.

## Verification

- Exact workflow: create/identify `A -> B`, double-click on the connection to create a new step, confirm the visible graph becomes `A -> New -> B` with no old `A -> B`.
- Confirm a loop/return edge can still exist and is not treated as a duplicate.
- Confirm node card text does not show repeated `Poling`/`Poling`.
- Run `npm run lint`.
- Run `npm run build`.

## Status

Fixed locally.

Implementation:

- Added `findEdgeSplitCandidate` and `splitEdgeWithNode`.
- `createNode` now detects when the double-click point is on an existing edge, removes the old edge locally, queues/persists two replacement transitions, and deletes/cancels the replaced transition.
- `FlowNodeCard` now suppresses subtitles that normalize to the same text as the title.
- Added focused `.test.ts` regression coverage for edge detection/splitting and duplicate subtitle suppression.

Verification completed:

- `npm run lint`
- `npm run build`

Remaining limitation:

- Browser automation was not available from this shell, so the exact visual double-click workflow still needs manual acceptance on `http://localhost:3015/process-flow` or `/wireframe/process-flow`.
