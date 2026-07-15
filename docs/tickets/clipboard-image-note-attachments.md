# Clipboard image note attachments

## Symptom

- Command-V in wafer/die Notes sometimes pasted no screenshot.
- The process movement/revert note dialog had no image attachment support.

## Root cause

- Notes inspected only `clipboardData.items`; macOS/browser clipboard paths may expose an image through `clipboardData.files`.
- Process movement captured text only and had no attachment upload or step-note persistence path.

## Fix

- Read image files from both clipboard collections and deduplicate them.
- Show pasted images in the movement dialog before submission.
- Upload movement screenshots to `wafer-process-files`, register them in `attachments`, and persist them in the moved wafer's step-scoped Notes surface.
- Add stable `id` and `name` attributes to both affected textareas.

## Status

Implemented.

- `npm run lint` passed.
- `npm run build` passed.
- `/wireframe/process-flow` loaded at 1280x720 with no console errors or horizontal overflow.
- The exact paste-and-submit workflow remains data-gated because the workspace currently has no selected process or wafers; verification did not create database fixtures.
