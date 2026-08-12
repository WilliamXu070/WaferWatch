# Analysis unbounded viewport and stacked conditions

## Required behavior

- Navigation: pulse panning has no lower boundary and may show negative values; voltage panning has no left or right boundary. Zoom keeps a finite, usable span, and Reset view returns to the imported-data overview.
- Input: mouse wheel zooms, primary-button drag pans in two dimensions, trackpad two-finger scroll pans, and trackpad pinch zooms. These gestures stay inside the graph and use automatic device-intent classification without an input-mode selector or persisted override.
- Coordinate fidelity: every point uses its raw source voltage and pulse count. Records with identical coordinates overlap exactly; no visual jitter or synthetic voltage offset may imply a different condition.
- Stack selection: the selected record is rendered last so it is visually on top. Repeated stationary clicks on an overlapping point cycle through that coordinate's visible records in stable catalog order without triggering Reset, while a drag beginning on the same point still pans. Filtering a die or pulse width immediately removes its records from the cycle. Double-click Reset applies only to empty graph space.
- Density: the duplicate legend, duplicate Reset control, pulse-width repetition sentence, input selector, parameter metadata grid, source-unit text, and repeated data-only prose are removed. Die filters remain the color key; Undo and Clear appear only after annotations exist; interaction instructions live in one compact Map notes popover. Data-only selections show only a concise no-image state.
- Fit: on desktop, graph height uses the chart frame's actual viewport position so the map and selected-condition panel remain visible without scrolling solely to reach graph controls. The phone layout remains a deliberate vertical stack with no horizontal overflow.

## Implementation workstreams

1. Viewport math (`polingViewport.ts`): preserve candidate voltage bounds, allow negative pulse minima, retain the imported overview as Reset view, and test extreme panning in both directions.
2. Stack model (`polingData.ts`): map every record to its exact raw coordinate, define stable overlap membership/order, and add a pure next-record helper for deterministic cycling.
3. Graph interaction (`PolingAnalysisMap.tsx`): render the selected record last, cycle stacks only on click (not drag), keep wheel ownership unchanged, and describe overlapping point behavior in accessible point text without adding a permanent toolbar.
4. Compact layout (`PolingAnalysisMap.tsx` and module CSS): remove the redundant footer, make annotation actions contextual, consolidate notes into a popover, and size the desktop chart against the visual viewport.

Because workstreams 2-4 converge on the same component and interaction state, the orchestrator owns their integration in the main checkout. Parallel agents perform data/edge-case inventory, interaction review, and release verification rather than producing conflicting edits to the same file.

## Acceptance and regression coverage

- Unit tests prove positive datasets reset at zero, negative datasets retain their data minimum, pulse panning reaches arbitrarily negative ranges without span changes, voltage pans arbitrarily left/right, and Reset view remains deterministic.
- Unit tests prove coincident records receive identical positions and cycling wraps in stable order. Singletons remain unchanged; filtered records never appear in the active stack.
- Interaction replay proves: mouse-wheel zoom; trackpad pan/pinch; two-dimensional point-origin drag; repeated click cycles an overlap without moving the plotted coordinate; selected layer/color/detail/image update together; Reset view restores the overview.
- Desktop replay checks that no removed footer text remains permanently visible and graph controls are reachable without scrolling. Exact 390x844 replay checks touch reachability, the Map notes popover, and horizontal overflow.
- Repository gates: `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` all pass. Production deployment must return HTTP 200 from `/api/health` and show no new console errors on `/analysis`.

## Release sequence

1. Complete exact-position and cycling behavior, then review the integrated diff for unrelated user files.
2. Run focused data/viewport tests followed by all four repository gates.
3. Commit only the Analysis files, this ticket, and the stable Analysis invariant in `agents.md`; push `main`.
4. Deploy the verified commit with `npm run deploy:prod`, point `wafer-watch.vercel.app` at that deployment if needed, and replay the production route at desktop and 390x844.
5. Record the final commit, deployment, health result, interaction evidence, and any physical-hardware caveat in this ticket.

## Status

In implementation on 2026-08-12.
