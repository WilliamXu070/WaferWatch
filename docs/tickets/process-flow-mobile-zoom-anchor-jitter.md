## Symptom

Tracking: [GitHub issue #23](https://github.com/WilliamXu070/WaferWatch/issues/23)

On a phone, zooming the Process Flow canvas pulls the graph toward the top-left instead of keeping the visible center fixed. Continuous pinch zoom also jitters while the scale changes.

## Expected behavior

- Phone pinch zoom stays anchored to the center of the visible process canvas.
- Repeated gesture frames preserve the same scene point under that center.
- The existing desktop pointer-anchored wheel zoom and mobile canvas panning remain available.

## Diagnosis

The first correction fixed two real anchor bugs but did not fix the user's physical iPhone repro. Mobile Safari could expose unusable zero coordinates to the WebKit gesture path, and consecutive React frames could combine a new scale with stale DOM scroll offsets.

The remaining root cause was a second, competing movement owner. Mobile CSS explicitly used `touch-action: pan-x pan-y`, delegating canvas movement to Safari, while the WebKit gesture handler simultaneously changed React scale and container scroll. Button zoom was stable because it never entered that mixed native/custom path. A physical pinch could still let Safari move the container toward its origin while the app applied scale.

## Plan

1. Disable native touch handling and browser scroll anchoring only inside the Process Flow canvas.
2. Own touch movement with pointer events: one finger pans the canvas; two fingers calculate scale from their distance around one fixed visible-center anchor.
3. Keep WebKit gesture listeners only to cancel Safari's native gesture, not to apply a second scale path.
4. Preserve touch taps and single-wafer drag behavior until a pan or second pointer is detected.
5. Add focused regressions for touch distance scaling, manual pan offsets, center anchoring, and consecutive pre-commit frames.
6. Run lint, build, and authenticated phone-size browser verification.

## Verification

- `npm exec --yes tsx -- --test src/components/process-flow/gesture.test.ts src/components/process-flow/interactions.test.ts`: 10/10 pass, including physical pointer-distance scaling, manual one-finger pan offsets, stable center anchoring, consecutive pre-commit frames, and wafer tap/drag thresholds.
- `npm run lint`: pass.
- `npm run build`: pass.
- Authenticated in-app browser at `http://localhost:3001/wireframe/process-flow?processId=9fb7de9e-31b8-4b5a-aea7-8ee64eedb699`, 390x844:
  - computed `touch-action` is `none` on both the frame and SVG, and `overflow-anchor` is `none`;
  - repeated zoom moved from 35% to 59%; the scene coordinate under the viewport center changed by only 0.49 px horizontally and 0.34 px vertically;
  - no horizontal page overflow;
  - no browser console errors;
  - screenshot: `/tmp/waferwatch-mobile-controlled-pinch-v2.png`.

The in-app browser cannot emit a physical two-finger Safari pointer sequence. The exact user workflow therefore remains the final acceptance gate after deployment; issue #23 stays open until the user confirms it on the iPhone.

## Status

Revised implementation verified locally; awaiting physical iPhone confirmation.
