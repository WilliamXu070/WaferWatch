# Live workflow collaboration

Tracking: [GitHub issue #21](https://github.com/WilliamXu070/WaferWatch/issues/21)

Implemented locally:

- One authenticated realtime bridge refreshes Dashboard, Calendar, Process Flow, Wafer / Die Status, notes, parameters, results, and history from canonical Supabase changes.
- Calendar edits use event revisions; stale moves and form saves are rejected.
- Process-flow names and coordinates use field-specific compare-and-swap checks; multi-node position saves are atomic.
- Wafer moves atomically claim the assignment source step, and client mutation IDs prevent duplicate process history.
- Notes mutate stable note IDs under a row lock, so concurrent adds merge and retries do not duplicate notes.
- Poling parameters patch only targeted cells under a row lock; different cells merge and stale same-cell saves fail.
- Result images refresh from `die_inspections`; uniformity uses versioned text-surface saves.

Verification:

- `npm run collaboration:verify` — passes notes, parameters, wafer movement, calendar, process flow, history idempotency, and 11-table realtime publication checks in PostgreSQL-compatible PGlite.
- `npm run lint` — passes.
- `npm run build` — passes.
- Authenticated browser at `http://127.0.0.1:3013`, 1440x1000:
  - Dashboard: 14 cards, no console errors or horizontal overflow.
  - Process Flow: four nodes, zoom interaction works, no console errors or horizontal overflow.
  - Wafer Status: correct authenticated empty state for the selected process, no console errors or horizontal overflow.

Deployment gate:

- Apply `supabase/migrations/202607130001_collaboration_foundation.sql` before deploying the application code.
- The current remote project has not received that migration. Its Calendar route therefore reports backend unavailable when asked for the new `revision` field. Remote two-user browser mutation/realtime verification remains pending until a Supabase access token or database password is available to push the migration.
