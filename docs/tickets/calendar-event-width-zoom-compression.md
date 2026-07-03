## Symptom

When the wireframe calendar is zoomed out far enough, short events stop shrinking and stay wider than their time duration.

## Diagnosis

The wireframe skin sets `.ww-timeline-item { min-width: 148px; }`, so CSS overrides the timeline engine's computed event width. Wrapped title text also makes narrow events look like they are constrained by content.

## Plan

1. Remove the fixed wireframe item minimum width.
2. Keep event boxes border-box and clipped.
3. Truncate event text instead of wrapping when width is narrow.
4. Verify zoomed-out event widths can become smaller than 148px.

## Verification

- `npm run lint` passes.
- `npm run build` passes.
- Playwright route: `http://localhost:3005/wireframe/calendar`
- Viewport: `1600x1000`
- Verified short events render below the old 148px floor: `New event` at `10.27px`, `Tool cleaning` at `6.84px`.
- Verified all visible wireframe items report computed `min-width: 0px` and no console errors were emitted.
- Screenshot: `/Users/williamxu/Desktop/Projects/WaferWatch/test-results/wireframe-calendar-event-width-compression.png`

## Status

Complete.
