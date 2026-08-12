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

Pending implementation.

## Status

Diagnosed on 2026-08-12. GitHub issue creation was unavailable because the configured `gh` credential is invalid, so this repository-local ticket is the tracked handoff.
