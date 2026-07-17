# Refactor plan

Goal: reduce code and operator actions while preserving workflow evidence and production data.

## Completed foundation

- Removed duplicate/prototype routes and verified unreachable runtime modules.
- Removed unused dependencies, server exports, validation schemas, and private helper chains.
- Made `/dashboard`, `/calendar`, `/process-flow`, and `/wafer-status` canonical.
- Added one complete test command and restored a clean typecheck/lint/build gate.
- Replaced the chronological 4,000-line agent log and completed ticket archive with stable guidance.
- Replaced Process Flow's mutation prop list with one typed action boundary.
- Removed Calendar's unused preview and local-persistence branches.
- Added generated, indexed wafer/die identity columns and moved hot reads off JSON metadata scans.

## Next: UI decomposition

- Split `ProcessFlowDiagram.tsx` into canvas/navigation, graph editing, wafer movement, and checkpoint/parameter controllers.
- Keep one selection model and one gesture owner; remove duplicated mouse/touch branches where tests prove equivalence.
- Split `ProcessCalendarBoard.tsx` into schedule state, timeline viewport, event editor, and persistence hooks.

## Next: read path

- Replace the sequential Wafer Status query waterfall with one database read model or RPC.
- Return typed visits, reviews, parameters, notes, and attachments rather than reconstructing them across the client boundary.
- Continue replacing overloaded metadata only through generated columns or explicit backfills with parity checks.

## Database sequence

1. Expand: add normalized `process_runs`, `step_visits`, and `step_reviews` without changing current writes. Explicit die identity fields are complete.
2. Backfill: populate normalized rows idempotently from assignments, executions, attempts, decisions, and events.
3. Shadow: compare current and normalized status/history outputs for every active assignment.
4. Cut over: dual-write, then read from the normalized model after parity holds.
5. Drop later: remove compatibility tables, metadata keys, triggers, and old RPCs in a separate release.

No destructive schema cutover is authorized until the shadow comparison is clean.
