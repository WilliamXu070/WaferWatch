## Symptom

Gamma wafers in `/wireframe/wafer-status` still visually read as a generated wafer/cut preview instead of a plain pre-dice wafer. The user expects Gamma to show only the intact wafer body.

## Expected behavior

Gamma should render as a single undiced pre-dice wafer outline using the same bottom-flat wafer source used by the earlier wafer viewer. It should not show G1-G8/G1-G4 labels, die cuts, selected die focus, array overlays, or a circular backdrop.

## Diagnosis

`WaferStatusView` already marks Gamma as undiced and suppresses die labels/focus. The remaining mismatch is in `WaferGeometryPreview`: it builds the source shape with `buildSyntheticWaferOutline()`, which creates a full circle. The previous wafer viewer path in `src/components/WaferCutVisualizer.tsx` loads `/wafer-assets/wafer_4in_100mm_bottom_primary_flat_only.gds`, parses it, normalizes it, and derives the wafer outline.

After loading the flat wafer outline, browser verification exposed a second cause: `Pre-dice clean` was inferred as `post-dice` because the fuzzy matcher treated the generic token `clean` as a match for `post clean`. That caused Gamma to render 8 polygons and 45 overlay rectangles even with labels hidden.

## Plan

1. Reuse the GDS parsing path in the wireframe preview by loading the bottom-primary-flat wafer asset.
2. Use a flat-bottom fallback outline before the GDS asset resolves.
3. Remove the circular ellipse backdrop from the non-focused preview path.
4. Keep undiced/pre-dice mode as one whole wafer polygon with no labels or overlays.

## Verification

- `npm run lint`
- `npm run build`
- Browser verification of `http://localhost:3005/wireframe/wafer-status`
- Confirm Gamma previews have no SVG text labels and no post-dice overlay rectangles.
- DOM proof after fix: first four Gamma cards each returned `visiblePolygonCount: 1`, `svgTextCount: 0`, `rectCount: 0`, and `bottomPointCount: 4`.
- Screenshot artifact: `/tmp/wafer-status-gamma-flat-wafer.png`

## Status

Resolved locally. GitHub issue creation was unavailable because `gh` is not authenticated in this environment.
