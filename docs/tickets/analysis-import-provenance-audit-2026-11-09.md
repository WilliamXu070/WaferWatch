# Image-backed analysis and workbook reconciliation

Issue: https://github.com/WilliamXu070/WaferWatch/issues/74

## Symptom and diagnosis

Production showed270 records, including64 workbook-only rows with no microscopy.206 actual images loaded and matched hashes. Image-keyed records represented repeated photos as separate points; the August12 import did not use the October28 shared workbook. No restore-induced database corruption was found.

## Approved scope and implementation

Show image-backed experiments, group photos, use latest workbook only for exact unambiguous provenance, and show conflicts before changing them. groupImageBackedExperiments now produces198 points with206 photos. Gallery selection preserves individual image/source metadata. Workbook reconciliation matched132 image records;74 ambiguous or previously-reconciled image mappings retain previous values and provenance. All270 scientific assignments are unchanged; no original import rows were deleted.

Held groups:52 TFA6 labels/geometry,12 TFB1 die-column offsets,9 TFA1 labels/columns,1 TFA7 R2C8 voltage. Their review table was shown to William; assignment changes remain unapproved.

## Verification and release

- Clean HEAD plus intended changes:300 tests, typecheck, lint, build and analysis-persistence verifier pass. Five source-reconciliation regression cases pass.
- Commit006d4cd451fb4973a3a6c4f4583e1464eaf61053 deployed as dpl_8RBUrnECfGqXj9tiuaAjrfxjni3Q; production domain aliases verified.
- New immutable import4484196e-2e89-48d6-91a3-0ddf25ebc691 is ready; prior import retained. Production comparison confirms0 scientific field changes and132 updated workbook references.
- Signed-in production reload:198 graph points,0 data-only points. TFA6 R3C9 has5 photos, Next changes image and slide caption while preserving experiment. Desktop and390x844 replay have no horizontal overflow; no console errors. /api/health returns200; fresh-deployment error scan empty.

## Status

Safe implementation released. Conflicting mapping reassignment is deliberately held for William's review. Rollback evidence: prior deployment dpl_77p1SJsYSNKT4XzEFNYrzQJTjfnC and immutable import8e6d9dc4-a345-455f-817b-55ad72c548d3 are retained. Unrelated primary-checkout work was not released.
