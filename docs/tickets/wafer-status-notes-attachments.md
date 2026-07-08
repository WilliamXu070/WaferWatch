## Symptom

Wafer status notes were not linked to process movement notes. A note entered while moving a wafer between process-flow steps was stored on the runtime execution/event path but did not appear in the wafer status Notes tab.

## Expected behavior

Move notes should appear under the relevant process step in wafer status. New wafer-status notes should remain persisted and may include uploaded images or process documents that can be reopened later.

## Diagnosis

The wafer status Notes tab reads JSON arrays from `text_surfaces` keyed by wafer/die/step. The process-flow move dialog writes its note to `step_executions.run_notes` and `process_events.notes`. `getWaferStatusModel` did not load `run_notes`, so the UI had no data path from movement notes to the status viewer. The existing storage bucket also did not allow Word, PowerPoint, or Excel MIME types.

## Plan

- Load `step_executions.run_notes` into the wafer status step model.
- Seed step notes from execution run notes so move notes are visible in the Notes tab.
- Add note attachment metadata to the persisted note JSON while storing canonical file metadata in `attachments`.
- Upload note files to `wafer-process-files` and add a signed-download action for private storage.
- Update the storage bucket allowed MIME types for Office documents.

## Verification

- `npm run lint`
- `npm run build`
- `npm run db:push:dry`
- `npm run db:push`
- `curl -s http://localhost:3015/api/health`
- Playwright screenshot of `/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`

## Status

Fixed locally and storage migration applied. The CLI browser rendered the auth-gated empty state, so populated signed-in note upload acceptance still needs a live authenticated session.
