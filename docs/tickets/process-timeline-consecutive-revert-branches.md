## Symptom

Two consecutive process reverts render as separate branches from the main process timeline. For example, reverting `EBL Prep -> deposition` and then immediately reverting `deposition -> cleaning` produces unrelated Attempt 1 and Attempt 2 paths.

## Expected behavior

Both revert events and notes remain visible, but the second revert extends the active revision chain. The timeline should render one continuous branch through the consecutive rollback sequence instead of parallel branches from the canonical process path.

## Diagnosis

The persisted `wafer_step_reverted` events already contain ordered source step, target step, timestamp, and reason data. `ProcessTimelineTree` ignored the relationship between adjacent events and assigned every revert a new lane and color, so consecutive rollback segments could not connect.

## Plan

1. Derive revision chains from chronological revert events.
2. Join an event to the preceding chain when its source step is the preceding event's destination step.
3. Keep attempt numbers, notes, and timestamps per event while sharing the chain lane and color.
4. Add a regression covering two consecutive reverts and an unrelated revert.
5. Run the focused regression, lint, build, and authenticated route verification when a signed-in session is available.

## Verification

- `node --test src/ui/waferwatch-wireframe/components/wafer-die-detail/processTimelineReverts.test.ts` passes both the consecutive-chain and independent-branch regressions.
- `npm run lint` passes.
- `npm run build` compiles successfully, then is blocked by a pre-existing type error in `src/features/runs/actions.ts:551` from unrelated note-author metadata work.
- `curl -s http://127.0.0.1:3001/api/health` returns a healthy WaferWatch/Supabase response.
- Playwright loaded `/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103` at `1440x1000` with zero console errors. The signed-in account had no accessible wafer records, so populated two-revert visual acceptance remains data-gated.

## Status

Fixed in code with focused regression coverage; populated authenticated visual acceptance remains pending.
