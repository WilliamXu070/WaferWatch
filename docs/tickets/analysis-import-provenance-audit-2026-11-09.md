# Analysis import provenance and missing-image diagnosis

Status: diagnosis complete; proposed changes not implemented.

Symptom: many blank-image selections and overlapping/repeated points on production /analysis.
Expected: traceable experimental observations, images and repetitions; current source data.

Confirmed: one August12 immutable import,270 rows exactly matching source catalog;206/206 production images return200 and match hashes.64 rows are intentionally workbook-only,45 from TFA4.270 rows occupy115 coordinates; some rows are multiple images for the same parameter tuple. New October28 shared workbook is not imported and includes rounds/geometry/TFA2 information absent from the live snapshot. Source conflicts remain in75 rows.

Detailed evidence and ordered correction/verification plan: [/Users/williamxu/Library/CloudStorage/OneDrive-UniversityofToronto/Employment/output/analysis-diagnosis-2026-11-09/DIAGNOSIS.md](</Users/williamxu/Library/CloudStorage/OneDrive-UniversityofToronto/Employment/output/analysis-diagnosis-2026-11-09/DIAGNOSIS.md>).

No code or database mutation; unrelated primary-checkout modifications preserved. Do not close as fixed until source reconciliation, approved scientific mappings, replacement immutable import and exact live reproduction checks are complete.

## Approved implementation scope — November9

User requested latest workbook, image-backed default, photo grouping, with conflicting mappings shown before any assignment change.

Plan:
1. Reconcile each image-backed record against the latest shared workbook; produce an old/new per-record conflict sheet. Hold conflicted scientific fields unchanged pending user review. Preserve old immutable import and all original records.
2. Add deterministic image-backed experiment grouping in polingData.ts with image membership preserved and no coordinate-based merging. Add gallery controls/source caption in PolingAnalysisMap.tsx; all plotted selections must have an image.
3. Generate a reviewed immutable catalog using latest-workbook provenance only for exact unambiguous matches; held records retain existing provenance and values. Do not introduce image-less experiments.
4. Meaningful regression tests: no data-only graph records, multi-photo gallery, separate pulse settings/runs, nonmutation of input records; workbook matching and held fields unchanged.
5. Verify test/typecheck/lint/build against clean HEAD plus only intended changes, preserving dirty primary checkout. Commit/push intended files, publish fresh production artifact, verify alias/deployment identity and live image-only/grouped selection.
6. Source mapping approval remains a separate pending step; never call held conflicts corrected. Rollback: previous deployment and immutable import retained.
