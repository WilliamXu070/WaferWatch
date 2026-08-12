# Analysis data-only records show unwanted no-image copy

## Symptom

Selecting a workbook-only Analysis record shows a large “No microscopy image” panel. Its graph tooltip also appends “no linked image.” The user asked for these no-image messages not to appear.

## Expected behavior

Workbook-only conditions remain selectable and retain their scientific provenance, but the detail panel does not render an image placeholder or no-image wording. A genuine asset-load failure remains actionable.

## Diagnosis

The catalog provenance flag is already filtered from visible warnings. Two component render paths still expose the concept: the data-only branch in `PolingAnalysisMap` and the SVG point title template.

## Plan

1. Omit the image stage when the selected record has no linked asset.
2. Build point titles without no-image wording.
3. Add regression coverage for data-only point titles.
4. Run the full repository verification gates and replay the Analysis selection when available.

## Verification

- Select a data-only graph point: no empty image panel or no-image message is visible.
- Hover/focus the same point: its accessible title contains the condition and stack information only.
- Select an image-backed point: microscopy loading and retry behavior remains unchanged.

## Status

Complete locally. Signed-in browser replay confirmed that selecting TFA4 R1C1 renders its condition header with zero image stages, zero images, and zero no-image messages. An image-backed TFB4 selection still renders one visible image. The focused Analysis tests, full 246-test suite, typecheck, lint, and production build pass. GitHub issue creation was unavailable because the local `gh` authentication token is invalid.
