## Symptom

After the calendar gained Shift-drag event creation, zooming still works, but clicking and dragging empty calendar space horizontally does not navigate the timeline.

## Expected behavior

Plain mouse drag on empty timeline space should pan horizontally. Shift-drag should create a new event. Dragging an existing saved event or unsaved draft should still move that event, not pan the whole timeline.

## Diagnosis

The third-party timeline owns horizontal panning through native pointer listeners on `.rct-scroll`, while WaferWatch now owns a React capture-phase pointer path for Shift-drag event creation. Even though the Shift handler only starts when Shift is pressed, the empty-canvas drag behavior was too dependent on the library's internal drag state and became unreliable after adding a custom pointer interaction layer.

## Plan

1. Keep Shift-drag creation on empty timeline space.
2. Add a WaferWatch-controlled fallback pan for plain mouse drags on empty `.rct-scroll` space.
3. Exclude existing timeline items, headers, and sidebars so event move/resize remains unchanged.
4. Clamp panning to the process calendar bounds.
5. Verify lint, typecheck, test, and build.

## Verification

- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm test` is blocked because `package.json` has no `test` script.
- `npm run build` passes.
- `curl -s http://localhost:3000/api/health` returns `{"ok":true,...}`.
- Exact signed-in dashboard drag repro was not completed in automation because the in-app browser was unavailable and the fallback browser page closed.

## Status

Fix implemented locally; needs user/session confirmation for the exact protected dashboard gesture.
