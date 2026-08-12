# Analysis mouse and trackpad navigation

## Symptom

The Analysis poling map treats every unmodified `wheel` event as a pan. A physical mouse wheel therefore cannot zoom, while a zoomed pulse viewport may not make its zero boundary obvious or easily reachable. Dragging starts only on empty chart space, which makes two-dimensional mouse panning unreliable in dense point regions.

## Expected behavior

- The pulse axis has a hard lower boundary of `0` for every dataset.
- A mouse wheel zooms around the cursor.
- A trackpad two-finger scroll pans on both axes and a trackpad pinch zooms.
- Primary-button click-drag pans on both axes, including when the drag starts over a data point; a stationary point click still selects it.
- Wheel gestures remain inside the chart instead of scrolling or zooming the browser page.

## Diagnosis

`getPolingWheelIntent` distinguishes only `ctrlKey`: Chromium pinch events zoom, but all unmodified mouse and trackpad wheel events pan. The web `WheelEvent` API does not expose a reliable device type, so vertical pixel streams from smooth mice and trackpads can be ambiguous. The component also uses React's passive wheel delegation, so its `preventDefault()` cannot reliably contain the gesture. Finally, the full-domain calculation merely prevents a negative pulse minimum instead of defining zero as the invariant floor, and pointer-down intentionally refuses drags that begin on a point.

## Plan

1. Make zero the full pulse-domain floor and move clamping/panning math into a tested domain helper.
2. Use a native non-passive wheel listener and cursor-anchored, delta-proportional zoom.
3. Add automatic burst classification for trackpad pan versus mouse zoom, with a persisted Trackpad/Mouse override for ambiguous smooth-scroll hardware.
4. Add thresholded point-aware pointer dragging so click selects and click-drag pans in two dimensions.
5. Add focused unit tests, then replay mouse wheel, trackpad scroll/pinch, point selection, zero-boundary panning, desktop, and 390x844 production behavior.

## Verification

- `npm test`: 238/238 passed.
- `npm run typecheck`, `npm run lint`, and `npm run build`: passed.
- Signed-in production desktop replay on `https://wafer-watch.vercel.app/analysis`:
  - Mouse mode wheel zoom reduced the visible pulse span from 2100 to 1199 while page scroll remained unchanged.
  - Auto mode classified an isolated mouse notch as zoom (pulse span 2100 to 1706) and a rapid continuous trackpad-style burst as pan (span stayed 1344 while its center moved).
  - Trackpad mode diagonal scroll preserved both spans while moving both axes, and further scrolling reached an exact `0` pulse minimum.
  - The Chromium pinch event path reduced pulse span from 1680 to 1365 without changing browser scale or page scroll.
  - Blank-space and point-origin drags moved both axes, preserved their spans, and did not mis-select the dragged point.
- Exact 390x844 replay: both input selectors and navigation tools were reachable, the pulse floor remained 0, and document horizontal overflow was false.
- Production console: no warnings or errors. `/api/health`: HTTP 200 with a healthy Supabase probe.

The browser replay exercised the real production handlers with mouse, pointer, and pinch-equivalent Chromium events. Physical mouse and trackpad hardware were not mechanically actuated; the persisted Mouse/Trackpad override remains available because browsers cannot identify every smooth-scroll device unambiguously.

## Status

Resolved and released on 2026-08-12.

- Runtime commit: `20dfb1c`
- Deployment: `dpl_DVJ2NaYe8X1J2PrFmnmz3hSBpUYM`
- GitHub issue creation was unavailable because the configured `gh` credential is invalid, so this repository-local ticket is the tracked record.
