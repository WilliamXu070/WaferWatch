## Symptom

Tracking: [GitHub issue #23](https://github.com/WilliamXu070/WaferWatch/issues/23)

On a phone, zooming the Process Flow canvas pulls the graph toward the top-left instead of keeping the visible center fixed. Continuous pinch zoom also jitters while the scale changes.

## Expected behavior

- Phone pinch zoom stays anchored to the center of the visible process canvas.
- Repeated gesture frames preserve the same scene point under that center.
- The existing desktop pointer-anchored wheel zoom and mobile canvas panning remain available.

## Diagnosis

The WebKit `gesturestart` path conditionally trusts `clientX` and `clientY`. Mobile Safari can expose those properties with unusable zero coordinates, which turns the intended pinch anchor into the frame's top-left corner.

`applyScaleAtAnchor` also recalculates its scene anchor from `scrollLeft`, `scrollTop`, and `scaleRef` on every gesture animation frame. When a second frame arrives before React has committed the previous scale and its layout effect has corrected scrolling, those values describe different viewport states. That mismatch moves the scene anchor and produces jitter.

## Plan

1. Use the visible pane center as the stable WebKit gesture anchor.
2. Derive pending zoom calculations from the effective pending viewport instead of stale DOM scroll offsets.
3. Add focused regression tests for center anchoring and consecutive pre-commit zoom frames.
4. Run lint, build, and mobile browser verification on Process Flow.

## Verification

- `npm exec --yes tsx -- --test src/components/process-flow/gesture.test.ts`: 6/6 pass, including stable center anchoring and consecutive pre-commit gesture frames.
- `npm run lint`: pass.
- `npm run build`: pass.
- Authenticated in-app browser at `http://localhost:3001/wireframe/process-flow?processId=9fb7de9e-31b8-4b5a-aea7-8ee64eedb699`, 390x844:
  - repeated phone zoom moved from 35% to 71%; the scene coordinate under the viewport center changed by only 0.60 px horizontally and 0.42 px vertically;
  - no horizontal page overflow;
  - no browser console errors;
  - screenshot: `/tmp/waferwatch-mobile-center-zoom.png`.

The in-app browser cannot synthesize Safari's proprietary `gesturestart`/`gesturechange` event, so physical iPhone pinch input is covered by the pure consecutive-frame regression rather than a browser-emitted Safari event.

## Status

Fixed and verified locally.
