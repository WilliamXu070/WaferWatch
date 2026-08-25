# Process Flow transition save feedback

## Symptom

After a user connects a newly created step, Process Flow remains on `Transition queued for save.` even when the transition command commits.

## Diagnosis

The client inserts the local edge, submits the idempotent transition command, and replaces the temporary edge ID after a successful response. It did not update the feedback state on that success, so the initial queued message remained visible and incorrectly implied a database failure. A thrown transport error also escaped the retry loop, leaving the same stale message.

Production evidence from 2026-08-25: the Test process committed Baking and Deposition as workflow revisions 1 and 2, then committed Dicing to Baking and Baking to Deposition as revisions 3 and 4. The latter connection was therefore present in the database despite the stale queued message.

## Repair

After all currently queued transition saves settle successfully, replace the queued feedback with `Transition saved.` (or the plural form). Normalize a thrown client transport error into the existing retry/failure path.

## Verification

- A focused regression check protects the success acknowledgement and transport-error handling.
- Run the full repository and workflow verification suite before release.
- Replay the production Process Flow connection path without creating or modifying lab workflow data solely for verification.
