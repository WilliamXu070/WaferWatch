## Symptom

After dragging one calendar event so it overlaps another, the user can see layer/order changes but cannot reliably drag the moved event back or undo the move.

## Expected behavior

Dragging overlapping events should keep one clear moving preview. Releasing should update the UI immediately, and Cmd/Ctrl+Z should restore the last move even while the backend save is still in flight.

## Diagnosis

The server move path excludes the moved event from conflict checks, so the moved event itself is not the blocker. The client path is too complex:

- The undo handler returns while `isPending` is true, which is exactly when optimistic moves are most likely to be undone.
- The moved event is rendered both as a preview and as a faint button at the original location, which keeps an extra interactive calendar event in the layout during drag.

## Plan

1. Remove the interactive moving-origin button.
2. Render a non-interactive origin marker only when the event has actually moved.
3. Let undo run while server work is pending.
4. Keep overlap packing local to the hovered row and keep drop optimistic.
5. Verify with lint, build, local health, and browser smoke check.

## Verification

- `npm run lint` passes.
- `npm test` is blocked because `package.json` has no `test` script.
- `npm run build` passes.
- `curl -s http://localhost:3000/api/health` returns `{"ok":true,...}`.
- Playwright smoke check loads `http://localhost:3000/processes` and redirects to the login page in the unauthenticated browser context.
- Exact protected dashboard drag/undo repro still needs a signed-in browser session.

## Status

Fixed in code; pending authenticated UI repro.
