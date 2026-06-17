## Symptom

After Shift-dragging to create a calendar event and releasing, the right-side new event form appears, but the temporary event disappears from the calendar table. The user also needs that unsaved event to remain adjustable before saving.

## Expected behavior

The unsaved event should remain visible as a yellow temporary stacked timeline item while the user fills out the form. If it overlaps existing events, it should still occupy a layer in the timeline. Before save, the user should be able to drag it to a different time/location and resize its duration.

## Diagnosis

The timeline item list only rendered a temporary item while `draftDragSelection` was active. Releasing the pointer or Shift key clears `draftDragSelection` and stores the selection as `draft`, but `draft` was only rendered in the inspector.

## Plan

1. Build the temporary timeline item from `draftDragSelection` while dragging.
2. Fall back to the saved `draft` state after release.
3. Keep the active Shift-drag preview noninteractive.
4. Make the released unsaved draft draggable and resizable without writing to the backend.
5. Use yellow styling to separate the unsaved draft from saved events.
6. Verify lint, typecheck, test/build commands, and local health.

## Verification

- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm test` is blocked because `package.json` has no `test` script.
- `npm run build` passes.
- `curl -s http://localhost:3000/api/health` returns `{"ok":true,...}`.

## Status

Fixed in code; exact protected dashboard repro still needs a signed-in browser session or user confirmation.
