## Symptom
Wireframe calendar interactions feel sluggish on `/wireframe/calendar`, especially on first open and during `onItemMove`/`onItemResize` drag/resize, wheel zoom, and timeline pan. The editor panel updates and timeline recalculates too often while dragging, causing visible stutter.

## Expected behavior
Calendar should remain fluid while loading and interacting: initial render settles quickly, wheel zoom/pan stay smooth, and drag/resize movements should feel responsive without stuttering. Final data should still persist (local/server) and undo should remain functional.

## Diagnosis
- Current implementation updates `events` on each `onItemMove`/`onItemResize` callback call, which runs for every pointer sample while moving/resizing.
- Each movement update is propagated through full `timelineItems` rebuild and persistence queue logic.
- Timeline `visibleRange` is also updated on each wheel/pan movement tick.
- Undo/history currently relies on each move event; this can work with a single final move record as long as previous and final windows are captured once per drag session.

## Plan
1. Add a drag/resize performance buffer for active movement operations:
   - Capture first movement delta as `previous` window plus streaming `next` window in refs.
   - Coalesce visual event updates to one React update per animation frame while pointer is moving.
   - Apply final move on pointer release only (single persistence call + single undo entry).
2. Keep draft creation and non-move handlers unchanged.
3. Keep existing validation/overlap rules and selection behavior.
4. Keep wheel/pan visible-range updates but avoid extra heavy work by keeping all movement paths focused on drag/resize rerender minimization first.
5. Run required checks: `npm run lint`, `npm run build`, then Playwright smoke on `/wireframe/calendar` at the worktree dev server (`3007`) with interaction verification.

## Status
Blocked from remote tracking: no GitHub auth in current environment (`gh auth status` failed). Proceeding with local ticket in `docs/tickets/calendar-interaction-performance.md`.

## Validation note (2026-07-02)
- Implemented `ProcessCalendarBoard.tsx` batching + deferred commit for item move/resize, with final flush on pointerup.
- Added `requestAnimationFrame` throttling in move/resize path and wrapped wheel/pan zoom updates in `startTransition`.
- Browser smoke: `http://localhost:3007/wireframe/calendar` using Playwright (headless), viewport `1440x900`.
  - Actions: initial render, select event, drag, resize, ctrl+wheel zoom, pan, shift+drag draft.
  - Result: completed with no console errors/page errors; one long task observed at max 58ms.
  - Screenshots: `/tmp/calendar-verification-initial.png`, `/tmp/calendar-verification-loaded.png`.
