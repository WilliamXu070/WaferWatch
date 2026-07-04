# Agent Workflow Notes

## Required verification after every coding change

After every coding change, run both lint and compile/build checks in order:

```bash
npm run lint
npm run build
```

This ensures the code is lint-clean and compile-safe before we move on.

Run this exact sequence for every change, including UI/asset updates.

## Required browser verification after UI changes

After any UI, route, component, CSS, or asset change, also verify the affected surface in a browser with Playwright or the in-app browser after lint and build pass.

Open the changed route, exercise the main interaction that changed, and check for obvious layout breakage, console errors, missing assets, and unusable controls. Capture or report the route, viewport, and what was verified.

For worktree agents, ask the orchestrator to perform or review visual verification when the result needs product judgment, screenshot comparison, or acceptance against a provided reference image.

## Playwright verification against existing worktree dev servers

Use the dev server that belongs to the worktree you are testing. Do not assume `localhost:3000`, and do not start a second server on a port that is already listening.

Known worktree dev servers:

```bash
cd /Users/williamxu/Desktop/Projects/WaferWatch/.worktrees/process-flow
npm run dev -- -p 3001
```

Use `http://localhost:3001` for Process Flow work.

```bash
cd /Users/williamxu/Desktop/Projects/WaferWatch/.worktrees/poling-parameters
npm run dev -- -p 3002
```

Use `http://localhost:3002` for Poling Parameters work.

Before browser testing, confirm the expected server is the one that is running:

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
curl -s http://localhost:3001/api/health
```

or:

```bash
lsof -nP -iTCP:3002 -sTCP:LISTEN
curl -s http://localhost:3002/api/health
```

Then point Playwright or the in-app browser at the matching localhost URL and exact route for the worktree. For example, Process Flow verification should open routes under `http://localhost:3001`, while Poling Parameters verification should open routes under `http://localhost:3002`.

If an authenticated route redirects to `/`, report that the Playwright session is unauthenticated instead of treating the redirect as product behavior. Use an existing confirmed account or saved `playwright/.auth/` storage state when authenticated verification is required; never create a new Supabase user during browser testing.

## Editable text surfaces must be persistent

Any user-editable text surface that represents wafer/process/inspection state must be tied to the database. Do not add local-only textareas for operational notes, comments, descriptions, parameters, or status-like text.

Default to the shared `text_surfaces` table/actions for generic text keyed to an exact object/scope. Use a domain-specific table only when the text is already a first-class domain field, such as poling parameters.

## Commit expectation

After completing each feature, rework, or bug fix, commit the finished changes with a clear message once lint and build pass.

After every development commit, add a short note in this file describing what changed and the route/state verified (if any), so the next developer handoff has immediate context.

## Orchestrator verification checkpoints

When working in a delegated worktree, ask the orchestrator for verification whenever the work needs product judgment, visual comparison, workflow acceptance, schema/persistence approval, merge-order guidance, or any decision that could affect another workstream.

Do not guess through these checkpoints alone. Pause with a short verification request that includes:

1. What changed or what decision is needed.
2. The exact files, route, screenshot, command output, or branch state to inspect.
3. The risk if the choice is wrong.
4. The options you see, if there is more than one reasonable path.

Routine local validation still belongs to the worker: run lint/build checks before completion, and report the results to the orchestrator.

## Playwright and auth testing safety

Never create new Supabase auth users, run signup flows, or use fake/random email addresses while testing this app with Playwright or browser automation. This project may point local development at a live Supabase project, and signup tests can send real transactional emails that bounce and risk Supabase email restrictions.

For authenticated UI testing:

1. Use an existing confirmed test/admin account to sign in.
2. Prefer a saved Playwright storage state/session after one successful login.
3. Keep credentials and storage state out of git.
4. Do not use generated addresses, `example.com`, typo addresses, or unowned Gmail addresses.
5. If signup behavior must be tested, ask the user first and use only a mailbox they explicitly control or a dedicated local/email-sandbox setup.

Ignored auth/session files should remain ignored, such as `playwright/.auth/`.

## Recent development note (2026-07-02 14:43)

- Updated `/wireframe/wafer-status` so each wafer tile supports an explicit undiced
  mode (no die labels, full-wafer geometry). Added a per-wafer switch in the selected
  panel and defaulted Gamma tiles to undiced mode.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3005/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3005/wireframe/wafer-status /tmp/wafer-status-undiced-v1.png`

## Recent development note (2026-07-02 18:41)

- Updated wafer preview swatches so Alpha, Beta, and Gamma use explicit family-level
  color palettes instead of near-neutral hash colors. Alpha is green, Beta is blue,
  and Gamma is soft red while preserving the existing light wireframe theme.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3005/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3005/wireframe/wafer-status /tmp/wafer-status-family-colors-v2.png`
- Note: direct Node-based Playwright DOM inspection could not run because `playwright`
  is not installed as a local project module; the Playwright CLI screenshot path works.

## Recent development note (2026-07-02 22:21)

- Fixed Gamma wafer previews in `/wireframe/wafer-status` so undiced Gamma renders as
  a single flat-bottom pre-dice wafer outline using the imported GDS geometry path,
  with no die labels, cut pieces, selected die state, or array overlay.
- Root cause: the preview had regressed to a synthetic circular wafer outline, and
  `Pre-dice clean` was inferred as `post-dice` because fuzzy matching treated `clean`
  as matching `post clean`.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Browser DOM check: first four Gamma cards each had `visiblePolygonCount: 1`,
    `svgTextCount: 0`, `rectCount: 0`, and `bottomPointCount: 4`.
  - `npx playwright screenshot --full-page --device="Desktop Chrome" http://localhost:3005/wireframe/wafer-status /tmp/wafer-status-gamma-flat-wafer.png`

## Recent development note (2026-07-02 22:26)

- Cleaned `/wireframe/wafer-status` wafer previews and selected panel:
  removed duplicate die-code SVG labels from previews, removed the wafer-mode
  control panel, removed the cut recipe/overlay cards, and collapsed Gamma from
  four repeated mock cards to one undiced wafer card.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Browser DOM check: Gamma header `GAMMA1`, `gammaCardCount: 1`, Gamma SVG
    `visiblePolygonCount: 1`, `svgTextCount: 0`, `rectCount: 0`; side panel has
    no `Wafer mode`, `Cut recipe`, or `Overlay` text.
  - `curl -s http://localhost:3005/api/health`
  - `npx playwright screenshot --full-page --device="Desktop Chrome" http://localhost:3005/wireframe/wafer-status /tmp/wafer-status-gamma-single-clean.png`

## Recent development note (2026-07-03 00:00)

- Updated process flow wireframe to use finite diagram bounds with deterministic
  centering on seed layout, so `/wireframe/process-flow` no longer expands infinitely
  and recenters consistently when steps are seeded.
- Fixed node placement clamp behavior to avoid forced minimum offsets that desynced
  pointer hit-testing and edge creation after add operations.
- Verified with:
  - `npm run lint`
  - `npm run build`

## Recent development note (2026-07-02 23:15)

- Added shared wireframe backend DTOs, pure mapping adapters, and server query
  helpers for dashboard, process-flow, calendar, and wafer-viewer data under
  `src/features/wireframe`.
- Added the missing calendar event update action/schema needed for the existing
  wireframe calendar import to compile.
- No UI route or visual component wiring changed in this backend-contract slice.
- Verified with:
  - `npm run lint`
  - `npm run build`

## Recent development note (2026-07-03 calendar wireframe backend parity)

- Updated `/wireframe/calendar` so backend-ready mode uses canonical Supabase
  schedule data and server actions without falling back to mock events or mock
  people. Empty backend schedules now show an empty-calendar state.
- Unauthenticated sessions now show an explicit disabled backend state instead
  of rendering mock persisted data.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3006/api/health`
  - Playwright at `http://localhost:3006/wireframe/calendar` with a 1440x1100
    viewport. The saved auth state was not accepted, so authenticated mutations
    were not exercised; unauthenticated mode showed the disabled state with no
    mock events, no mock handoffs, and no console errors.
  - Screenshot: `/tmp/waferwatch-calendar-backend-parity.png`

## Recent development note (2026-07-03 dashboard wireframe backend)

- Backend-integrated `/wireframe/dashboard` so the server page passes a database-
  derived dashboard model instead of static mock cards. Empty backend state now
  renders zero stats and empty workflow columns.
- Added the missing calendar event update action/schema required for the app-wide
  production build to compile; no calendar UI internals were changed.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3008/api/health`
  - In-app browser at `http://localhost:3008/wireframe/dashboard`, 1280x720:
    zero stats, four empty columns, no console errors, no horizontal overflow.
  - Screenshot: `/tmp/waferwatch-wireframe-dashboard-backend.png`

## Recent development note (2026-07-03 integrated wireframe backend)

- Integrated the wireframe backend branches and removed the remaining static
  WaferWatch wireframe mock-data exports so active wireframe routes read from
  Supabase-backed loaders or render explicit empty/auth states.
- Restored `/wireframe/process-flow` to the wireframe shell/component styling
  after the backend merge briefly exposed legacy `page-shell` UI in the route.
- Added authenticated-session gating to wireframe shell process/team chrome so
  unauthenticated verification does not show seeded-looking backend labels.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3009/api/health`
  - Playwright at `http://localhost:3009/wireframe/dashboard`,
    `/wireframe/calendar`, `/wireframe/process-flow`, and
    `/wireframe/wafer-status` with a 1440x1000 viewport.
  - Empty/unauthenticated routes rendered zero-state wireframe UI with no
    console errors; `/wireframe/process-flow` had zero legacy `.page-shell`,
    `.page-heading`, or `.panel.dashboard-panel` nodes.
  - Saved auth state `playwright/.auth/user.json` was not accepted, so
    authenticated wafer-status/drag persistence was not exercised.
  - Screenshot: `/tmp/waferwatch-process-flow-wireframe-auth-gated.png`

## Recent development note (2026-07-03 wireframe fixture verification)

- Added `scripts/wireframe-fixture.mjs` plus npm aliases for deterministic
  wireframe backend verification:
  `wireframe:fixture:snapshot`, `wireframe:fixture:clear`,
  `wireframe:fixture:seed`, and `wireframe:fixture:verify`.
- The fixture is scoped to the fixed `codex-wireframe-fixture` project/template
  namespace and cleanup deletes only those deterministic IDs.
- Verified clear/no-fixture state, seeded two wafers (`ALPHA-VERIFY-01`,
  `BETA-VERIFY-02`), two assignments, eight executions, one calendar event, and
  one persisted text surface, then cleared the fixture rows again.
- The existing saved Playwright auth state was decoded only for metadata and was
  expired; its refresh token was invalid, so authenticated calendar/process-flow/
  wafer-status browser verification still needs a fresh existing login.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `npm run wireframe:fixture:snapshot`
  - `npm run wireframe:fixture:clear`
  - `npm run wireframe:fixture:seed`
  - `npm run wireframe:fixture:verify`
  - `curl -s http://127.0.0.1:3010/api/health`
  - Playwright at `http://127.0.0.1:3010/wireframe/dashboard`: seeded cards
    appeared before cleanup and disappeared after cleanup with no console errors.
  - Screenshots: `/tmp/waferwatch-seeded-dashboard.png`,
    `/tmp/waferwatch-cleared-dashboard.png`

## Recent development note (2026-07-03 wireframe auth alignment)

- Aligned `/wireframe/dashboard` and `/wireframe/wafer-status` around the
  authenticated Supabase boundary. Unauthenticated sessions now render explicit
  empty backend states and do not load seeded wafer/template data through admin
  query paths or redirects.
- Fixed the shared wireframe topbar search input hydration mismatch by making
  the read-only caret style explicit in the component render.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `npm run wireframe:fixture:seed`
  - `curl -s http://localhost:3008/api/health`
  - Unauthenticated route checks confirmed `ALPHA-VERIFY-01` and
    `BETA-VERIFY-02` were not visible on `/wireframe/dashboard` or
    `/wireframe/wafer-status`.
  - Playwright screenshots:
    `/tmp/waferwatch-auth-alignment-dashboard-v2.png` and
    `/tmp/waferwatch-auth-alignment-wafer-status-v2.png`
  - `npm run wireframe:fixture:clear` returned zero fixture rows across the
    deterministic project/template/wafer/assignment/execution/calendar/text
    surface namespace.

## Recent development note (2026-07-03 wireframe UI/backend recovery)

- Preserved the dirty root warm-ivory wireframe UI and calendar fixes on
  `codex/wireframe-ui-calendar-preserve`, then merged `origin/main` backend/auth
  work into that branch instead of rebuilding from the backend worktree.
- Kept the backend-only `/wireframe/*` data boundary, shell model, fixture
  verification script, and removed the merge-created duplicate
  `updateProcessCalendarEvent` export.
- Replaced the topbar inline caret style with a CSS utility to avoid the
  hydration mismatch seen during browser verification.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `npm run wireframe:fixture:seed`
  - `curl -s http://localhost:3008/api/health`
  - Unauthenticated checks confirmed `ALPHA-VERIFY-01` and
    `BETA-VERIFY-02` were not visible on `/wireframe/dashboard` or
    `/wireframe/wafer-status`.
  - Playwright screenshots:
    `/tmp/waferwatch-combined-dashboard.png`,
    `/tmp/waferwatch-combined-calendar.png`,
    `/tmp/waferwatch-combined-process-flow.png`,
    `/tmp/waferwatch-combined-wafer-status.png`, and
    `/tmp/waferwatch-combined-dashboard-v2.png`
  - `npm run wireframe:fixture:clear` returned zero fixture rows.

## Recent development note (2026-07-03 process flow editor restore)

- Restored the process-flow canvas selection/delete controls that were present
  in prior git history: clicking/creating a node selects it, the toolbar Delete
  step button enables from selection, Delete/Backspace removes the selected node,
  and local undo snapshots are restored for canvas edits.
- Kept `/wireframe/process-flow` backend-backed: unauthenticated sessions still
  show no Supabase process fallback data, and this change does not add destructive
  `process_steps` database deletes.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3000/api/health`
  - Browser route `http://localhost:3000/wireframe/process-flow` at `1280x720`:
    double-clicked the empty canvas to create a local step, confirmed one
    `.flow-node--selected`, deleted it from the toolbar, recreated a step, and
    deleted it with the keyboard Delete key. Console error log was empty.

## Recent development note (2026-07-03 calendar mode control removal)

- Removed the nonfunctional Day/Week/Month segmented control from
  `/wireframe/calendar` while keeping the current range arrows and Today control.
- Removed the dead `.wireframe-calendar-card__segments` CSS.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3000/api/health`
  - Browser route `http://localhost:3000/wireframe/calendar` at `1280x720`:
    confirmed no Range mode control, no Day/Week/Month sequence, range control
    and Today still present, and console error log was empty.

## Recent development note (2026-07-03 process flow persistence)

- Persisted `/wireframe/process-flow` graph authoring through Supabase-backed
  steps, node positions/types, transitions, organized layouts, multi-select
  deletion, and forward wafer drops that can complete the source execution.
- Removed the permanent toolbar `Delete step` and `Clear` controls; kept
  `Center view` and `Organize`, with hidden canvas scrollbars and fit-to-content
  centering.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3001/api/health`
  - In-app browser at `http://localhost:3001/wireframe/process-flow`,
    1280x720: unauthenticated empty backend state, no toolbar Delete/Clear,
    Center view and Organize visible, no horizontal page overflow, canvas frame
    scrollbars hidden, double-click create guard did not add local-only nodes,
    and console error log was empty.
  - Screenshot:
    `/tmp/waferwatch-process-flow-persistence-cli.png`
- Authenticated create/update/delete persistence was not browser-exercised
  because the available browser session was unauthenticated.

## Recent development note (2026-07-03 process flow editor buffering)

- Refactored `/wireframe/process-flow` for non-blocking editing: new nodes appear
  immediately as `"Untitled"` with no "Creating Step..." toast behavior, inline
  title edits are available by double-clicking nodes, zoom changes were tuned down,
  and canvas dimensions were increased for a much larger scene.
- Added buffered persistence for step creation, transition creation, node position
  updates, and inline name edits so UI updates are local-first, then synchronized
  in debounced/background batches.
- Added `updateProcessStepName` action/schema wiring for name persistence once edits
  settle.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `lsof -nP -iTCP:3001 -sTCP:LISTEN`
  - `curl -s http://127.0.0.1:3001/api/health`
  - `npm run wireframe:fixture:seed`
  - Authenticated Playwright on
    `http://127.0.0.1:3001/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103`
    at `1440x1000`: created two local-first steps, confirmed they appear
    immediately as `Untitled`/renamed inline text with no `Step N` labels,
    shift-dragged a transition between them, waited for background persistence,
    reloaded, and confirmed the two new DB-backed steps plus one DB-backed
    transition rendered again.
  - Direct Supabase check after the Playwright run showed `6` fixture steps
    including `Linked buffer A` and `Untitled`, both with canvas coordinates,
    and `1` `process_step_transitions` row.
  - Screenshot: `/tmp/process-flow-buffering-create-link.png`
  - `npm run wireframe:fixture:seed` again to restore the deterministic fixture
    baseline after the test.

## Recent development note (2026-07-03 process selection gate)

- Updated the wireframe shell so selecting the current process only reveals the
  animated process subnav; Process Flow and Wafer / Die Status stay hidden until
  the user explicitly opens that sub-view with a selected `processId`.
- Added Supabase-backed process-template renaming from the sidebar and scoped
  wafer-status loading by selected process assignment.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://127.0.0.1:3005/api/health`
  - In-app browser at `http://127.0.0.1:3005/wireframe/process-flow`, 1440x1000:
    no process selected shows the empty guard and no flow canvas.
  - In-app browser at `http://127.0.0.1:3005/wireframe/wafer-status`, 1440x1000:
    no process selected shows the empty guard and suppresses wafer metrics.
  - Screenshots:
    `/tmp/process-selection-flow-guard.png`,
    `/tmp/process-selection-wafer-guard.png`
- Authenticated selected-process browser verification was not completed because the
  saved Playwright auth state did not decode into a usable Supabase session.

## Recent development note (2026-07-03 22:50)

- Committed the current WaferWatch main-branch process-flow and wireframe shell
  worktree state, including process-flow canvas/toolbar/action updates and
  sidebar shell cleanup.
- Verified with:
  - `npm run lint`
  - `npm run build`
- Browser verification was not rerun in this commit-only pass.

## Recent development note (2026-07-04 wafer die detail wireframe)

- Added a first-pass `/wireframe/wafer-status` die detail viewport that opens
  when an active diced tile is selected. The detail view includes Overview,
  Process history, Parameters, Results, and Notes tabs, plus the screenshot-style
  header, quick info, process timeline, result metrics, trend, and note panels.
- Files & Data was intentionally left out of the tab set for now, and result
  image slots render as empty placeholders.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3000/api/health`
  - Browser route
    `http://localhost:3000/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    at `1440x1000`: unauthenticated backend empty state rendered with no console
    errors.
  - Playwright CLI with `playwright/.auth/user.json` also rendered the
    unauthenticated empty state, so active-die click verification needs a fresh
    existing authenticated session.
  - Screenshot: `/tmp/wafer-status-detail-auth-check.png`

## Recent development note (2026-07-04 wafer die detail split)

- Split the first-pass wafer die detail wireframe out of the monolithic
  `WaferStatusView.tsx` into `src/ui/waferwatch-wireframe/components/wafer-die-detail/`.
  The folder now separates the detail shell, tab view routing, summary cards,
  process timeline, parameter table, result sequence, mock detail data, and
  helper functions for agent readability.
- Kept `WaferStatusView.tsx` as the wafer grid/detail coordinator only; no backend
  contract or visual behavior was intentionally changed.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3000/api/health`
  - Playwright CLI route screenshot at
    `http://localhost:3000/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with `1440x1000` viewport and `playwright/.auth/user.json`.
  - The saved auth state still rendered the unauthenticated empty state, so
    active-die click verification still needs a fresh existing authenticated
    session.
  - Screenshot: `/tmp/wafer-status-detail-split-check.png`

## Recent development note (2026-07-04 wafer status minimalist pass)

- Reduced visual nesting and color noise across the wafer/die status viewport:
  white topbar, thinner neutral borders, flatter metric rows, simpler family
  groups, white die preview wells, a cleaner selected-die rail, and neutral
  styling across die detail tabs/cards.
- Kept one strong black selection/accent state and removed most beige/green
  filled containers from the wafer-status and die-detail surfaces.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3000/api/health`
  - Playwright CLI route screenshot at
    `http://localhost:3000/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with `1440x1000` viewport and `playwright/.auth/user.json`.
  - The saved auth state still rendered the unauthenticated empty state, so
    authenticated active-die visual acceptance still needs a fresh existing
    session.
  - Screenshot: `/tmp/wafer-status-minimal-white.png`

## Recent development note (2026-07-04 wafer die detail removal pass)

- Removed generated/filler die detail UI: the `Codex Wireframe V1` breadcrumb
  crumb, die metadata chip row, Quick info panel, Performance trend panel, and
  the old repeated Step 4 parameter/live-log block.
- Replaced Key results with only Uniformity plus an empty Best image placeholder.
  Replaced the lower timeline detail block with a concise Key parameter
  information section.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3000/api/health`
  - Playwright CLI route screenshot at
    `http://localhost:3000/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with `1440x1000` viewport and `playwright/.auth/user.json`.
  - The saved auth state still rendered the unauthenticated empty state, so
    authenticated active-die visual acceptance still needs a fresh existing
    session.
  - Screenshot: `/tmp/wafer-die-detail-removal-pass.png`

## Recent development note (2026-07-04 wafer die process timeline polish)

- Updated the die detail Process timeline styling to better match the reference:
  green completed step markers/checks, a continuous vertical progress line,
  a soft active-row background, and muted outlined pending steps.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3000/api/health`
  - Playwright CLI route screenshot at
    `http://localhost:3000/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with `1440x1000` viewport and `playwright/.auth/user.json`.
  - The saved auth state still rendered the unauthenticated empty state, so
    authenticated active-die visual acceptance still needs a fresh existing
    session.
  - Screenshot: `/tmp/wafer-process-timeline-style.png`

## Recent development note (2026-07-04 wafer die timeline family color)

- Fixed the die detail Process timeline connector so the active-row background
  no longer cuts the vertical line.
- Changed completed markers, checks, active text, and progress line to use a
  wafer-family accent matching the wafer preview palette: Alpha green, Beta
  blue, Gamma red, with a neutral fallback.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3000/api/health`
  - Playwright CLI route screenshot at
    `http://localhost:3000/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with `1440x1000` viewport and `playwright/.auth/user.json`.
  - The saved auth state still rendered the unauthenticated empty state, so
    authenticated active-die visual acceptance still needs a fresh existing
    session.
  - Screenshot: `/tmp/wafer-process-timeline-family-color.png`

## Recent development note (2026-07-04 wafer die timeline checkmark fill)

- Updated the completed-step checkmark treatment so it uses the opposite fill:
  a white circular fill with a family-colored border and check glyph instead of
  a solid filled disk.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3000/api/health`
  - Playwright CLI route screenshot at
    `http://localhost:3000/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with `1440x1000` viewport and `playwright/.auth/user.json`.
  - The saved auth state still rendered the unauthenticated empty state, so
    authenticated active-die visual acceptance still needs a fresh existing
    session.
  - Screenshot: `/tmp/wafer-checkmark-opposite-fill.png`
