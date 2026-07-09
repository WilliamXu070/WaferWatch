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

## Recent development note (2026-07-04 wafer die timeline single checkmark)

- Replaced the completed-step timeline checkmark from a nested circle icon to a
  single filled family-color disk with a plain white check glyph, avoiding the
  double-circle artifact.
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
  - Screenshot: `/tmp/wafer-checkmark-filled-single.png`

## Recent development note (2026-07-05 wafer die preview controls removal)

- Removed the nonfunctional Front/Back/3D segmented control from the die preview
  card in the wafer die detail viewer.
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
  - Screenshot: `/tmp/wafer-die-preview-toggle-removed.png`

## Recent development note (2026-07-05 wafer die tab order)

- Reordered the wafer die detail tabs to Overview, Parameters, Results, Notes,
  then Process history.
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
  - Screenshot: `/tmp/wafer-die-tabs-reordered.png`

## Recent development note (2026-07-07 results gallery viewport)

- Replaced the Results tab grid plus right selected-image rail with a full-width
  gallery viewport that shows eight chip samples at once and keeps the parameter
  context directly underneath.
- Sample clicks now select a chip, or cycle through that chip's uploaded images
  when it is already selected. Arrow keys walk through images first, then move to
  the adjacent chip only at the image boundary.
- Uniformity remains editable per sample, uploads still support add/delete plus
  paste/drop images, and the bottom parameter table now follows the visible
  gallery columns with the selected column highlighted.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - `npx playwright screenshot --full-page --device="Desktop Chrome" http://localhost:3012/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103 /tmp/waferwatch-results-gallery-viewport-auth-gated.png`
  - Playwright rendered the unauthenticated backend empty state, so authenticated
    visual acceptance of the Results gallery still needs William's signed-in
    browser session.

## Recent development note (2026-07-07 results no-wrap navigation)

- Removed wraparound behavior from the Results gallery. Arrow navigation now
  stops at row and column boundaries, and selected-sample image clicks stop at
  the last uploaded image instead of cycling back to the first.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - `npx playwright screenshot --full-page --device="Desktop Chrome" http://localhost:3012/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103 /tmp/waferwatch-results-no-wrap-auth-gated.png`
  - Playwright rendered the unauthenticated backend empty state, so authenticated
    visual acceptance still needs William's signed-in browser session.

## Recent development note (2026-07-07 results five-sample gallery)

- Reduced the Results gallery viewport from eight visible samples to five visible
  samples so each capture has more horizontal room.
- Changed each capture well from a tall viewport-height slot to a 4:3 image well,
  preserving `object-contain` while removing the large vertical blank bands.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - `npx playwright screenshot --full-page --device="Desktop Chrome" http://localhost:3012/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103 /tmp/waferwatch-results-five-gallery-auth-gated.png`

## Recent development note (2026-07-07 cellphone view)

- Added a mobile WaferWatch shell for phone widths: compact topbar, slide-out
  drawer, bottom primary navigation, safe-area viewport handling, and hidden
  desktop sidebar/topbar below `768px`.
- Tightened mobile layouts for dashboard, calendar, process flow, wafer status,
  die detail headers/tabs, and parameter tables. Parameter tables now scroll
  horizontally with a sticky first column instead of clipping.
- Added explicit selected-wafer Process Flow actions so phone users can choose
  next-step moves through the existing backend note dialog instead of relying
  only on drag/drop.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - Playwright route checks at `390x844` for `/wireframe/dashboard`,
    `/wireframe/calendar`, `/wireframe/process-flow`, and
    `/wireframe/wafer-status`.
  - Playwright regression checks at `768x1024` and `1440x1000`.
  - Console error log was empty. Authenticated wafer/die data interactions were
    not exercised because the browser session was unauthenticated.

## Recent development note (2026-07-07 cellphone touch scrolling)

- Fixed phone touch movement after the cellphone shell pass. The mobile shell now
  uses normal document scrolling instead of trapping all motion inside a fixed
  `100svh` container.
- Process Flow touch input no longer enters the desktop canvas selection, node
  drag, or wafer drag handlers. Touch now pans the scrollable 2D canvas, while
  mouse/keyboard editing remains unchanged.
- Calendar wireframe timeline panels now allow native touch panning instead of
  forcing `touch-action: none`.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright touch-emulation on `/wireframe/process-flow` at `390x844`: dragging
    inside `.flow-map-frame` moved its scroll position from `0` to `521`.
  - Playwright touch-emulation on `/wireframe/dashboard` at `390x844`: page drag
    moved `window.scrollY` to `603`.
  - Console error log was empty.

## Recent development note (2026-07-07 calendar mobile logic)

- Fixed calendar week navigation by wiring the Previous, Next, and Today controls
  to the board's visible start date instead of leaving them inert.
- Added a visible `New event` entry point in the timeline toolbar and defaulted
  draft events to the first available process person, so seeded event creation
  does not immediately fail the required people validation.
- Improved phone calendar sizing: full-width mobile card, compact header,
  visible timeline toolbar, smaller site column, shorter mobile rows, and shorter
  date headers.
- Adjusted timeline touch history movement so vertical swipes can scroll the
  page while horizontal swipes on blank timeline space pan through calendar
  history.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -I http://localhost:3015/calendar?processId=11111111-1111-4111-8111-111111111103`
    confirmed the Playwright/CLI session is unauthenticated and redirects to `/`;
    authenticated seeded browser mutation testing still needs William's signed-in
    browser session.
  - Playwright rendered the unauthenticated backend empty state, so authenticated
    visual acceptance still needs William's signed-in browser session.

## Recent development note (2026-07-07 results gallery hot-load)

- Changed visible Results tiles to keep all uploaded images for that sample
  mounted in a hidden stack, so advancing within a chip reveals a preloaded image
  instead of swapping a fresh image source.
- Narrowed image warming to the current five-sample viewport plus adjacent row
  columns and the selected sample, matching the old inspection-viewer preload
  approach without warming the whole board every time.
- Arrow keys now move chip selection only. Image advancement is limited to an
  explicit click or Return/Enter on the chip image; Space is suppressed so scroll
  intent does not accidentally advance the gallery from a focused image button.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - `npx playwright screenshot --full-page --device="Desktop Chrome" http://localhost:3012/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103 /tmp/waferwatch-results-gallery-hotload-auth-gated.png`
  - Playwright rendered the unauthenticated backend empty state, so authenticated
    visual acceptance still needs William's signed-in browser session.

## Recent development note (2026-07-07 results gallery loop dedupe)

- Restored loop-around for explicit image cycling inside one selected chip:
  clicking or pressing Return on the selected result image now advances from the
  last image back to the first.
- Fixed duplicate single-image registration by stopping paste events from being
  handled by both the gallery dropzone and the global paste listener, and by
  de-duping inspection records by id when loading/appending results.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - `npx playwright screenshot --full-page --device="Desktop Chrome" http://localhost:3012/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103 /tmp/waferwatch-results-gallery-loop-dedupe-auth-gated.png`
  - Playwright rendered the unauthenticated backend empty state, so authenticated
    upload/gallery acceptance still needs William's signed-in browser session.

## Recent development note (2026-07-07 results optimistic delete undo)

- Changed Results image delete to be optimistic: the selected image is removed
  from the gallery immediately, then the server/storage delete is committed in
  the background after a short undo window.
- Added keyboard shortcuts for the Results gallery: Cmd/Ctrl+Delete or
  Cmd/Ctrl+Backspace deletes the selected result image, and Cmd/Ctrl+Z restores
  the last pending deletion before it is committed.
- If a second image is deleted before the previous pending deletion is undone,
  the previous deletion is committed in the background and the new deletion
  becomes the undo target.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - `npx playwright screenshot --full-page --device="Desktop Chrome" http://localhost:3012/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103 /tmp/waferwatch-results-optimistic-delete-auth-gated.png`
  - Playwright rendered the unauthenticated backend empty state, so authenticated
    delete/undo acceptance still needs William's signed-in browser session.

## Recent development note (2026-07-07 results parameter row control removal)

- Removed the Row dropdown from the Results parameter context header. The
  parameter row now follows the selected gallery sample only.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - `npx playwright screenshot --full-page --device="Desktop Chrome" http://localhost:3012/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103 /tmp/waferwatch-results-parameter-row-control-removed-auth-gated.png`
  - Playwright rendered the unauthenticated backend empty state, so authenticated
    visual acceptance still needs William's signed-in browser session.

## Recent development note (2026-07-07 results plus upload)

- Removed the Results toolbar `Add images` button. Empty result tiles now open
  the image picker directly when the plus/image well is clicked or activated
  with Return.
- Populated image tiles keep the existing click-to-select/cycle behavior.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - `npx playwright screenshot --full-page --device="Desktop Chrome" http://localhost:3012/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103 /tmp/waferwatch-results-plus-upload-auth-gated.png`
  - Playwright rendered the unauthenticated backend empty state, so authenticated
    plus-upload acceptance still needs William's signed-in browser session.

## Recent development note (2026-07-07 results uniformity editor polish)

- Restyled the per-tile Uniformity editor as one cohesive metric pill with a
  muted label, divider, larger tabular numeric value, and non-selectable label
  text to avoid the fragmented selected-text look.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - `npx playwright screenshot --full-page --device="Desktop Chrome" http://localhost:3012/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103 /tmp/waferwatch-results-uniformity-editor-auth-gated.png`
  - Playwright rendered the unauthenticated backend empty state, so authenticated
    visual acceptance still needs William's signed-in browser session.

## Recent development note (2026-07-07 viewer integration branch)

- Created `codex/viewer-integration` from local `main` and integrated the active
  viewer workstreams in order: latest Results, latest Parameters, guarded
  Process Flow, then the larger local-first Process Flow branch.
- Resolved merge conflicts by preserving the latest Results gallery, keeping the
  Parameters Notes row while exporting shared parameter section data, keeping
  note-gated wafer moves from the guarded Process Flow branch, and combining
  return-edge side-lane routing with local-first avoiding curves.
- Verified after each workstream merge with:
  - `npm run lint`
  - `npm run build`
- Final verification from the integration checkout:
  - `curl -s http://localhost:3015/api/health`
  - `npx playwright screenshot --full-page --device="Desktop Chrome" http://localhost:3015/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103 /tmp/waferwatch-viewer-integration-wafer-status.png`
  - `npx playwright screenshot --full-page --device="Desktop Chrome" http://localhost:3015/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103 /tmp/waferwatch-viewer-integration-process-flow.png`
  - Playwright rendered unauthenticated backend empty/guard states, so signed-in
    product acceptance for Results, Parameters, Notes, and Process Flow still
    needs William's authenticated browser session.

## Recent development note (2026-07-06 results review board)

- Replaced the wafer die detail Results tab with an image-first result review
  board: all row/column samples render at once, sample selection drives the
  right-side inspector, the bottom parameter context follows the selected row
  and column, related images are grouped below, and notes are scoped to the
  selected result sample via `text_surfaces`.
- Kept Parameters, Notes, Process history, wafer grid behavior, auth, and schema
  surfaces unchanged.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - In-app browser at
    `http://localhost:3012/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`:
    unauthenticated backend empty state rendered with no console errors.
  - Playwright CLI screenshot of the same unauthenticated route:
    `/tmp/waferwatch-results-review-board-auth-gated.png`
- Authenticated visual interaction with the Results board still needs a fresh
  existing browser session; this worktree has no saved `playwright/.auth/user.json`.

## Recent development note (2026-07-06 results parameter context alignment)

- Updated the Results review board so the bottom parameter context and right-side
  source parameters read from the same exported Parameters display contract:
  chip row grouping, chip columns, row metadata, parameter values, and color tone
  maps now come from `ParametersTableCard.tsx`.
- This keeps Results column highlighting and row switching aligned with the
  Parameters tab instead of maintaining a duplicate static parameter copy.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - Playwright CLI screenshot of the unauthenticated route:
    `/tmp/waferwatch-results-parameter-context-shared-auth-gated-v2.png`
- In-app browser control timed out while reloading the route; authenticated
  interaction with the actual Results board still needs a fresh signed-in
  browser session.

## Recent development note (2026-07-06 wafer die notes persistence)

- Added persistent create/edit/delete support for the wafer die detail Notes tab.
  Notes are stored in `text_surfaces` under a wafer/die scope instead of local-only
  component state, and Overview/latest note cards read from the same note list.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3013/api/health`
  - Playwright at
    `http://localhost:3013/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with a `1440x1000` viewport and the existing saved auth state.
  - The saved auth state still rendered the unauthenticated empty state, so
    authenticated add/edit/delete persistence was not browser-exercised.
  - Screenshot: `/tmp/waferwatch-notes-tab-persistence-final.png`

## Recent development note (2026-07-06 wafer die notes bottom composer)

- Moved the wafer die detail Notes composer to the bottom of the Notes tab,
  appends newly created notes after existing notes, and added Newest first /
  Oldest first order controls for the note list.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3013/api/health`
  - Playwright at
    `http://localhost:3013/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with a `1440x1000` viewport and the existing saved auth state.
  - The saved auth state still rendered the unauthenticated empty state, so
    authenticated visual confirmation of the Notes controls was not browser-exercised.
  - Screenshot: `/tmp/waferwatch-notes-bottom-sort.png`

## Recent development note (2026-07-06 wafer die notes remove key results)

- Removed the Key results side panel from the wafer die detail Notes tab so the
  Notes dashboard owns the full tab width.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3013/api/health`
  - Playwright at
    `http://localhost:3013/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with a `1440x1000` viewport and the existing saved auth state.
  - The saved auth state still rendered the unauthenticated empty state, so
    authenticated visual confirmation of the Notes tab was not browser-exercised.
  - Screenshot: `/tmp/waferwatch-notes-key-results-removed.png`

## Recent development note (2026-07-06 notes branch main merge)

- Merged `codex/wafer-notes-tab` into local `main` with a non-fast-forward merge
  commit so the Notes feature remains revertable as one integration unit.
- Verified from the main checkout with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3014/api/health`
  - Playwright at
    `http://localhost:3014/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with a `1440x1000` viewport and the existing saved auth state.
  - The saved auth state still rendered the unauthenticated empty state, so
    authenticated Notes interaction was not browser-exercised in the main checkout.
  - Screenshot: `/tmp/waferwatch-main-notes-merge.png`

## Recent development note (2026-07-06 fabrication parameters chip matrix)

- Updated the wafer die detail Fabrication parameters card from pulse-oriented
  columns to a chip-row matrix while preserving the original light product-table
  style: recipe metadata, R1/R2/R3 sections, R*C1-C15 chip columns, the
  requested voltage/pulse/post-pulse rows, no separate units column, and
  row-level note actions.
- Made parameter cells editable with local-first draft updates and debounced
  batched background persistence to `wafers.metadata.die_poling_parameters`
  through the existing wafer poling parameter action path.
- Kept the existing component reuse behavior unchanged; Results still imports
  the same Parameters table component.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3011/api/health`
  - Playwright CLI screenshot at
    `http://localhost:3011/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with a `1440x1000` viewport.
  - Screenshot: `/tmp/wafer-parameters-editable-smoke.png`
  - The available browser sessions rendered the unauthenticated backend empty
    state, so authenticated parameter editing and DB persistence still need a
    fresh existing login to exercise visually.

## Recent development note (2026-07-06 fabrication parameters clipboard selection)

- Added spreadsheet-style selection behavior to the Fabrication parameters
  matrix: drag or Shift+Arrow selects rectangular cell ranges, clicking an
  R1/R2/R3 chip-row header selects the full 5x15 section, and browser copy/paste
  uses tab-separated values so a full R1 parameter block can be pasted onto R2
  or R3.
- Pasted parameter values continue through the same debounced batched background
  save path as individual cell edits, and paste is blocked in read-only states
  instead of creating local-only parameter drafts.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3011/api/health`
  - In-app browser route
    `http://localhost:3011/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    reloaded at the target URL with zero console errors.
  - Playwright CLI screenshot at the same route with a `1440x1000` viewport:
    `/tmp/wafer-parameters-clipboard-empty-state.png`
  - The available browser session rendered the unauthenticated backend empty
    state, so authenticated R1-to-R2 clipboard and database persistence still
    need a fresh existing login to exercise visually.

## Recent development note (2026-07-06 fabrication parameters paste origin)

- Fixed Fabrication parameters range paste so multi-cell paste always starts at
  the selected range's top-left cell instead of the drag end/active cell. This
  makes top-left-to-bottom-right and bottom-right-to-top-left selections behave
  the same when copying one chip-row block into another.
- Replaced the heavy black active-cell outline/focus box with a quieter selected
  cell tint and neutral focus border so the table no longer shows the boxed
  selectable UI around an edited value.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3011/api/health`
  - In-app browser route
    `http://localhost:3011/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    had zero console errors.
  - The available browser session rendered the unauthenticated backend empty
    state, so authenticated clipboard interaction still needs a fresh existing
    login to exercise visually.

## Recent development note (2026-07-06 fabrication parameters value colors)

- Removed the visible Fabrication parameters save-status label from each chip-row
  header while keeping the existing debounced background save behavior.
- Added value-based cell tinting for parameter rows: fields with multiple
  distinct values get a subtle per-field palette, and identical values share the
  same tint across R1/R2/R3. Uniform fields remain neutral.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3011/api/health`
  - Browser verification still needs an authenticated session to visually inspect
    the live parameter table; the available session has recently rendered the
    unauthenticated backend empty state.

## Recent development note (2026-07-06 parameters branch main merge)

- Merged `codex/parameters-chip-matrix` into local `main` with a non-fast-forward
  merge commit so the Parameters feature remains revertable as one integration
  unit.
- Resolved conflicts with the already-merged Notes work by keeping Notes state
  and text-surface wiring from `main` while adding Parameters tile metadata,
  editable chip matrix persistence, clipboard behavior, and value-based coloring.
- Verified from the main checkout with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3014/api/health`
  - Playwright at
    `http://localhost:3014/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with a `1440x1000` viewport.
  - The route rendered the unauthenticated backend empty state with zero console
    errors, so authenticated Parameters interaction was not browser-exercised in
    the main checkout.
  - Screenshot: `/tmp/waferwatch-main-parameters-merge.png`

## Recent development note (2026-07-06 results related images removal)

- Removed the lower `All images for ...` thumbnail/upload strip from the Results
  review board so the selected-image workflow stays focused in the right rail.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - Playwright CLI screenshot of the unauthenticated route:
    `/tmp/waferwatch-results-related-images-removed-auth-gated.png`
- Authenticated Results interaction still needs a fresh signed-in browser
  session to exercise visually.

## Recent development note (2026-07-06 results grid label removal)

- Removed the Results grid view switcher/status legend row and removed the
  per-sample metric label under each image tile. Tiles now show only the image,
  corner status dot, selection state, and best badge where applicable.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - Playwright CLI screenshot of the unauthenticated route:
    `/tmp/waferwatch-results-view-labels-removed-auth-gated.png`
- Authenticated Results interaction still needs a fresh signed-in browser
  session to exercise visually.

## Recent development note (2026-07-06 results metadata card removal)

- Removed the top recipe/performed-by/fabrication metadata card from the Results
  review board while keeping the selected-image rail title intact.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - Playwright CLI screenshot of the unauthenticated route:
    `/tmp/waferwatch-results-metadata-card-removed-auth-gated.png`
- Authenticated Results interaction still needs a fresh signed-in browser
  session to exercise visually.

## Recent development note (2026-07-06 results image upload/delete)

- Wired the Results selected-image rail to the existing die inspection image
  backend used by the old WaferWatch inspection map: `die_inspections`,
  `/api/storage/signed-upload`, Supabase Storage, signed preview URLs, and the
  existing inspection delete action.
- Result samples now load persisted images by die row/column, support multiple
  images per R/C sample, accept multi-image drag/drop and clipboard image paste,
  allow previous/next image navigation, and can delete the selected persisted
  image.
- Notes remain scoped to the selected persisted inspection id when an uploaded
  image exists, with the placeholder image ordinal used only before upload.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - Playwright CLI screenshot of the unauthenticated route:
    `/tmp/waferwatch-results-image-upload-delete-auth-gated-v3.png`
- Authenticated upload/delete interaction still needs a fresh signed-in browser
  session to exercise against Supabase Storage.

## Recent development note (2026-07-06 results uniformity input)

- Simplified the Results right rail by removing the Key results loss/status
  block and the Source parameters block. The rail now shows only an editable
  Uniformity percentage field below the selected image.
- Uniformity saves through `text_surfaces` using the selected result R/C sample
  scope and field `uniformity_percent`.
- Preserved the current collapsible parameter-context table behavior in the
  Results tab.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - Playwright CLI screenshot of the unauthenticated route:
    `/tmp/waferwatch-results-uniformity-percent-input-auth-gated.png`
- Authenticated editing persistence still needs a fresh signed-in browser
  session to exercise visually.

## Recent development note (2026-07-06 results seeded image removal)

- Removed the synthetic seeded microscopy images and fake per-sample image counts
  from the Results grid and selected-image rail. Empty samples now render as
  upload placeholders until real persisted inspection images exist.
- Persisted result images now render through an `<img>` element with
  `object-contain` inside a stable frame so uploaded images preserve their aspect
  ratio instead of being horizontally distorted by background sizing.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - Playwright CLI screenshot of the unauthenticated route:
    `/tmp/waferwatch-results-seeded-images-removed-auth-gated.png`
- Authenticated upload/preview formatting still needs a fresh signed-in browser
  session to exercise against real persisted images.

## Recent development note (2026-07-06 results status icon removal)

- Removed seeded Best/Good/Review/Fail/No image status modeling from the Results
  grid. Result tiles no longer show colored status dots or a Best badge.
- Renamed the right-rail selected image label from `Best image` to `Image`; the
  visible result signal is now the editable Uniformity percentage.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - Playwright CLI screenshot of the unauthenticated route:
    `/tmp/waferwatch-results-status-icons-removed-auth-gated.png`
- Authenticated visual inspection still needs a fresh signed-in browser session.

## Recent development note (2026-07-06 results arrow navigation and rail fit)

- Added Results keyboard navigation: ArrowLeft/ArrowRight/ArrowUp/ArrowDown
  move the selected R/C sample in the result grid while focus is not inside an
  input, textarea, select, or contenteditable surface.
- Tightened the selected-image rail layout with min-width guards, truncation,
  wrapping image controls, and a constrained right column so buttons and note
  actions fit inside the panel.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3012/api/health`
  - Playwright CLI screenshot of the unauthenticated route:
    `/tmp/waferwatch-results-arrow-nav-rail-fit-auth-gated.png`
- Authenticated keyboard/rail visual acceptance still needs a fresh signed-in
  browser session.
## Recent development note (2026-07-06 fabrication parameters enter navigation)

- Updated the Fabrication parameters matrix so pressing Enter inside an editable
  parameter cell moves focus down one parameter row in the same chip column,
  selecting the next value for immediate editing. The last parameter row advances
  to the first parameter row of the next R section when available.
- Existing Shift+Arrow rectangular selection behavior is unchanged.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3011/api/health`
  - In-app browser route
    `http://localhost:3011/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    had zero console errors.
  - The available browser session rendered the unauthenticated backend empty
    state, so authenticated Enter-key interaction was not browser-exercised.

## Recent development note (2026-07-06 fabrication parameters notes row)

- Added a `Notes` row to the bottom of each Fabrication parameters chip-row
  matrix. Each chip note is an editable text cell stored through the existing
  `description` field in `wafers.metadata.die_poling_parameters`.
- Removed the old nonfunctional row-notes footer/button below each R section so
  notes live directly inside the spreadsheet-style matrix.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3011/api/health`
  - Playwright at
    `http://localhost:3011/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with a `1440x1000` viewport.
  - The route rendered the unauthenticated backend empty state with zero console
    errors, so authenticated Notes-row editing was not browser-exercised.
  - Screenshot: `/tmp/wafer-parameters-notes-row-auth-state.png`

## Recent development note (2026-07-06 parameters tab side card removal)

- Removed the Current step/notes side rail from the wafer die detail Parameters
  tab so the tab shows only the Fabrication parameters matrix.
- Overview and Process history still keep their current-step/timeline/note
  context where applicable.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3011/api/health`
  - Playwright at
    `http://localhost:3011/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with a `1440x1000` viewport.
  - The route rendered the unauthenticated backend empty state with zero console
    errors, so authenticated Parameters-tab visual acceptance still needs an
    existing signed-in browser session.

## Recent development note (2026-07-06 parameters print layout)

- Added print-specific layout support for the wafer die detail Parameters tab:
  app chrome, breadcrumbs, action buttons, and tabs are hidden in print, while
  the die title and Fabrication parameters matrix print on a landscape Letter
  page with visible table borders and exact parameter tint colors.
- Added semantic print hooks to the wireframe shell, die detail view, and
  Parameters matrix so print behavior stays scoped to this surface.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3011/api/health`
  - Playwright route check at
    `http://localhost:3011/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with a `1440x1000` viewport and zero console errors.
  - `npx playwright pdf --paper-format Letter --viewport-size=1400,900`
    generated `/tmp/wafer-parameters-print-check.pdf`, rendered to
    `/tmp/wafer-parameters-print-check.png`.
  - The available browser session rendered the unauthenticated backend empty
    state, so authenticated Parameters-tab print acceptance still needs an
    existing signed-in browser session.

## Recent development note (2026-07-06 parameters one-page print fit)

- Tightened the Parameters-tab print stylesheet so the Fabrication parameters
  matrix is more likely to fit on one landscape Letter page: smaller page
  margins, compact die header, tighter recipe metadata, shorter table rows,
  smaller print typography, and no forced whole-section page break behavior.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3011/api/health`
  - Playwright route check at
    `http://localhost:3011/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with zero console errors.
  - `npx playwright pdf --paper-format Letter --viewport-size=1400,900`
    generated `/tmp/wafer-parameters-print-fit-one-page.pdf`; `pdfinfo`
    reported `Pages: 1`, and the PDF was rendered to
    `/tmp/wafer-parameters-print-fit-one-page.png`.
  - The available browser session rendered the unauthenticated backend empty
    state, so signed-in Parameters-matrix print acceptance still needs an
    existing authenticated browser session.
## Recent development note (2026-07-06 process flow guarded wafer moves)

- Guarded process-flow wafer moves so drag/drop only opens a move confirmation
  when the target step is directly connected by a directed `process_step_transitions`
  edge from the wafer's active source step.
- Added server-side enforcement for the same source/target transition check, so
  reverse movement is rejected unless a reverse transition exists in the graph.
- Added a required process-note dialog before submitting a wafer move; the note is
  stored through the existing move action/process event path.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3013/api/health`
  - Playwright CLI screenshot at
    `http://localhost:3013/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103`
    with a `1440x1000` viewport.
  - The browser session rendered the unauthenticated backend-empty state, so
    authenticated wafer drag/drop persistence was not browser-exercised.
  - Screenshot: `/tmp/waferwatch-process-flow-guarded-move.png`

## Recent development note (2026-07-06 process flow curved arrow routing)

- Fixed return-edge routing in the process-flow canvas so curved arrows choose a
  side lane outside nearby node cards instead of falling back to a known-colliding
  shallow Bezier path.
- Added a focused regression covering the stacked fixture-card geometry where a
  lower completion step returns to an upper active step without crossing the
  middle cards.
- Verified with:
  - `npx --yes tsx --test src/components/process-flow/edges.test.ts`
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3013/api/health`
  - Playwright CLI screenshot at
    `http://localhost:3013/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103`
    with a `1440x1000` viewport.
  - The browser session rendered the unauthenticated backend-empty state, so
    populated graph visual acceptance was covered by the focused geometry test
    rather than authenticated route interaction.
  - Screenshot: `/tmp/waferwatch-process-flow-curved-arrow-routing-final.png`
## Recent development note (2026-07-04 process flow local-first canvas)

- Updated `/wireframe/process-flow` so background Supabase sync no longer reseeds,
  recenters, or auto-organizes the active canvas after normal graph edits.
- Replaced the broad graph-signature reset with first-load seeding plus local graph
  merging that preserves node positions, zoom/pan, labels, roles, and wafer chips.
- Removed routine `router.refresh()` calls after wafer moves, role changes, node
  deletes, and edge deletes; wafer moves now update the local canvas immediately and
  roll back only if persistence fails.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3001/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3001/wireframe/process-flow /tmp/waferwatch-process-flow-local-first.png`
- Authenticated create/connect/wafer-move browser verification was not completed
  because this worktree had no saved Playwright auth state. The route rendered on
  the correct dev server; an existing topbar caret hydration warning remains.

## Recent development note (2026-07-04 process flow multi-select drag)

- Added drag-box marquee selection to `/wireframe/process-flow` so users can drag
  across multiple process boxes and select them together.
- Updated node dragging so moving one selected node moves the selected group while
  preserving relative spacing and saving all changed node positions through the
  existing debounced persistence queue.
- Added Shift-click selection toggling in addition to Cmd/Ctrl-click. Shift-drag
  still creates a transition once the pointer moves beyond the click threshold.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3001/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3001/wireframe/process-flow /tmp/waferwatch-process-flow-multiselect.png`
- Authenticated drag-box/group-move browser verification was not completed from
  Playwright because this worktree has no saved auth state. The route rendered on
  the correct dev server; the existing topbar caret hydration warning remains.

## Recent development note (2026-07-04 process flow undo snapshots)

- Added graph-level undo support to `/wireframe/process-flow` via snapshot-based
  local history (up to 30 steps). Undo restores nodes, edges, selection, viewport,
  and zoom/pan, including deletions with connected edges and multi-step/connection
  edits.
- Added an Undo toolbar button and Cmd/Ctrl+Z keyboard shortcut (`Shift+Z` unaffected).
- Added snapshot capture before local mutations: node create, inline rename, move,
  role change, transition add, delete node(s), delete edge, and organize.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3001/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3001/wireframe/process-flow /tmp/process-flow-undo-implemented.png`
- Browser verification is unauthenticated because no usable Playwright auth state is
  available in this environment; route renders on the correct worktree server.

## Recent development note (2026-07-04 process flow edge dedupe)

- Fixed a process-flow undo/recovery regression where restored local graph state and
  server/async transition updates could leave duplicate transition objects with the
  same persisted id, producing React duplicate-key console errors in
  `ProcessFlowCanvas`.
- Added centralized edge normalization in `ProcessFlowDiagram` and routed snapshot,
  server merge, create, delete, rollback, and transition-id replacement writes
  through it. Edges are deduped by id first and then by from/to/kind, preferring
  persisted edges over local optimistic duplicates.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3001/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3001/wireframe/process-flow /tmp/process-flow-edge-dedupe-fix.png`
- Direct Playwright console-listener verification could not run because this
  worktree has the Playwright CLI but not the `playwright`/`@playwright/test` Node
  module available to scripts.

## Recent development note (2026-07-04 process flow delete undo delete)

- Fixed the `Delete -> Undo -> Delete` process-flow path for locally recovered
  steps whose first delete already succeeded on Supabase.
- The second delete now treats the server's "selected process steps no longer
  exist" response as idempotent success, keeping the local recovered node removed
  instead of rolling it back into the canvas. Real delete errors still roll back.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3001/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3001/wireframe/process-flow /tmp/process-flow-delete-undo-delete-fix.png`

## Recent development note (2026-07-04 process flow undo merge guard)

- Fixed a race where `Delete -> Undo` could restore a step locally, then a delayed
  server graph merge from the original delete removed the recovered step again.
- Undo now tracks node/edge ids that were actually recovered from a snapshot.
  Same-template server merges preserve those recovered ids even when the latest
  Supabase graph no longer contains them, so the active canvas stays UI-authoritative.
- Recovered ids are cleared when the user deletes them again or when the graph is
  reseeded for a different process/template. Recovered transitions also treat
  already-deleted server responses as idempotent local success.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3001/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3001/wireframe/process-flow /tmp/process-flow-undo-server-merge-guard.png`

## Recent development note (2026-07-04 process flow A1-A8 start wafers)

- Fixed process-flow data loading so active wafer/die assignments with no current
  step execution fall back to the first/start process step instead of disappearing
  from the canvas.
- Updated the deterministic wireframe fixture to seed A1-A8 as planned assigned
  die rows with no step executions, plus the existing alpha/beta fixture rows.
  Fixture verification now asserts all A1-A8 rows exist.
- Seeded and verified the fixture in Supabase. A1-A8 all mapped to
  `Fixture intake` (`11111111-1111-4111-8111-111111111201`) through the start-step
  fallback.
- Verified with:
  - `node --check scripts/wireframe-fixture.mjs`
  - `npm run wireframe:fixture:seed`
  - `npm run wireframe:fixture:verify`
  - Direct Supabase mapping assertion for A1-A8 -> fixture start step
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3001/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3001/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103 /tmp/process-flow-a1-a8-start-fixture.png`
- Browser screenshot was unauthenticated and showed the backend-only empty guard;
  no saved auth user was available to attach to the fixture project in this session.

## Recent development note (2026-07-04 calendar step snapshots)

- Linked calendar step selection to the current process-flow database steps while
  preserving historical event labels through a persisted
  `process_step_name_snapshot` column on `process_calendar_events`.
- New/updated calendar events snapshot the selected process step name at schedule
  time. Existing events display the snapshot first, so later process-step renames
  do not rewrite old calendar labels.
- Process-step deletion now nulls the live `process_step_id` reference but keeps
  the snapshot label instead of converting old events to a generic "Removed
  process step" action.
- Applied migration `202607040001_calendar_step_snapshot.sql` to the linked
  Supabase project and reseeded the deterministic wireframe fixture.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `npm run db:push`
  - `npm run wireframe:fixture:seed`
  - `npm run wireframe:fixture:verify`
  - Direct Supabase assertion: current step selector names changed after a
    temporary step rename while the existing event snapshot stayed
    `Fixture poling`; the step name was restored afterward.
  - `curl -s http://localhost:3001/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3001/wireframe/calendar?processId=11111111-1111-4111-8111-111111111103 /tmp/waferwatch-calendar-step-snapshot.png`
- Dev server is running on `http://localhost:3001`. Browser verification is
  unauthenticated and shows the calendar guard because no saved auth user was
  attached to the fixture project in this session.

## Recent development note (2026-07-04 process flow wheel zoom)

- Updated `/wireframe/process-flow` wheel behavior so normal vertical mouse wheel
  input zooms the canvas at the cursor without requiring Ctrl/Cmd.
- Mostly horizontal wheel input still pans sideways for trackpads.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3001/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3001/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103 /tmp/process-flow-wheel-zoom.png`

## Recent development note (2026-07-05 process flow trackpad pan)

- Refined `/wireframe/process-flow` wheel behavior so coarse mouse wheel input
  still zooms at the cursor, while precise pixel-delta trackpad scrolling pans the
  2D canvas vertically/horizontally.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3001/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3001/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103 /tmp/process-flow-trackpad-pan-mouse-zoom.png`

## Recent development note (2026-07-05 process flow expanded wafer chips)

- Removed the `+N` wafer overflow chip from process-flow nodes and render every
  wafer/die chip in a fixed four-column grid.
- Process-flow node height now expands from wafer count on initial graph load,
  server graph merges, wafer drag/drop moves, and organize layout calculations.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3001/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3001/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103 /tmp/process-flow-expanded-wafer-chips.png`
- Browser screenshot was unauthenticated and showed the backend-only empty guard,
  so authenticated seeded graph visual acceptance still needs an existing saved
  auth session.

## Recent development note (2026-07-05 process flow delete-only context menu)

- Simplified the process-flow node right-click menu so it only offers step
  deletion. Removed Beginning step, End step, and Normal step role actions from
  the context menu path.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3001/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3001/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103 /tmp/process-flow-delete-only-context-menu.png`
- Browser screenshot was unauthenticated and showed the backend-only empty guard,
  so authenticated right-click interaction still needs an existing saved auth
  session.

## Recent development note (2026-07-05 process flow edit polish and edge routing)

- Tightened inline step rename editing so the input aligns with the normal title
  text, uses the same title scale, and no longer covers the subtitle/meta area.
- Added explicit blank-canvas/different-node click-away commit for rename edits
  before canvas pointer handling prevents browser blur.
- Updated start-step styling to a distinct green treatment in the wireframe
  process-flow surface while preserving selected-state blue borders.
- Reworked process-flow edge routing so reciprocal edges and direct edges that
  intersect other node boxes try larger curved lanes and sample against node
  bounds before choosing a path.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3001/api/health`
  - `npx playwright screenshot --device="Desktop Chrome" http://localhost:3001/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103 /tmp/process-flow-rename-start-edge-routing.png`
- Browser screenshot was unauthenticated and showed the backend-only empty guard,
  so authenticated rename/right-click/edge visual acceptance still needs an
  existing saved auth session.

## Recent development note (2026-07-07 production wireframe promotion)

- Promoted the backend-backed wireframe shell to production routes:
  `/dashboard`, `/calendar`, `/process-flow`, and `/wafer-status`, while keeping
  `/wireframe/*` as a preview alias.
- Redirected signed-in entry, `/blank`, and legacy `/processes` routes into the
  promoted app. The public auth form is now sign-in only with invite-only copy.
- Removed public debug/auth inspection endpoints and production-gated local
  `/auth/v1/*` mock routes so fake local auth helpers are not reachable in a
  production runtime.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://127.0.0.1:3015/api/health`
  - Browser route `http://127.0.0.1:3015/dashboard`, default 1280x720 viewport:
    unauthenticated session redirected to `/`, the login form showed no sign-up
    or create-account controls, no horizontal overflow, and no console errors.
  - `curl` confirmed `/processes` returns `307` to `/dashboard`, and
    `/api/env`, `/api/auth-check`, and `/api/debug/cookies` return `404`.
  - Screenshot: `/tmp/waferwatch-prod-auth-gate.png`
  - Authenticated production-shell interaction still needs William's signed-in
    browser session or a fresh saved auth state.

## Recent development note (2026-07-07 topbar action cleanup)

- Removed the nonfunctional Sort by and Filters controls from the WaferWatch
  shell topbar.
- Scoped the Add wafer button so it appears only on Process Flow routes
  (`/process-flow` and `/wireframe/process-flow`); Dashboard and other shell
  routes keep only the search field, Me control, and sign-out action.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://127.0.0.1:3015/api/health`
  - Browser routes `http://127.0.0.1:3015/wireframe/dashboard` and
    `http://127.0.0.1:3015/wireframe/process-flow`: Dashboard topbar had no
    Sort by, Filters, or Add wafer text; Process Flow topbar had Add wafer and
    no Sort by or Filters; no horizontal overflow and no console errors.
  - Screenshot: `/tmp/waferwatch-topbar-process-flow-add-wafer.png`

## Recent development note (2026-07-07 current process wafer intake)

- Seeded the active `Saeed` process template to the current eight-step flow:
  Dicing, Sample cleaning / EBL prep, Chrome deposition, EBL lithography, Pad
  fabrication, PL2, Poling, and Inspection.
- Added Process Flow-only wafer creation from the topbar. New wafers are inserted
  at the first process step with queued/pending executions, and completion or
  forward movement from any dicing-like step splits the parent wafer into A1-A8
  child pieces for downstream steps.
- Hid planned assignments with no executions from wafer/die status so empty
  greyed-out placeholder tiles do not render.
- Verified with:
  - `npm run process:seed`
  - `npm run process:verify`
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - In-app browser at
    `http://localhost:3015/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103`:
    Add wafer appeared only on Process Flow, no legacy shell nodes, no console errors.
  - In-app browser at
    `http://localhost:3015/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`:
    Add wafer, Sort by, Filters, and planned grey placeholder text were absent,
    no legacy shell nodes, and no console errors.
- The browser session was not authenticated against Supabase, so live Add wafer
  mutation and dicing split drag behavior still need William's signed-in browser
  session for visual acceptance.

## Recent development note (2026-07-07 process flow wafer toolbar cleanup)

- Moved Add wafer out of the global topbar and into the Process Flow canvas
  toolbar next to Center view and Organize.
- Added visible process-step numbering on flow nodes and selected-wafer chip
  state. Delete/Backspace now deletes the selected wafer/die assignment and
  wafer row through a project-write-gated server action.
- Removed the Process Flow `Backend only` badge and the
  `active wafers loaded from Supabase` status line.
- Added `npm run process:clear-wafers` and used it to clear current backend
  wafer/assignment rows for the active `Saeed` process without changing the
  eight-step process template.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `npm run process:clear-wafers`
  - `npm run process:verify`
  - `curl -s http://localhost:3015/api/health`
  - In-app browser at
    `http://localhost:3015/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103`:
    topbar Add wafer absent, toolbar Add wafer present, no `Backend only`, no
    `loaded from Supabase`, no legacy shell nodes, and no console errors.
  - In-app browser at
    `http://localhost:3015/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`:
    topbar Add wafer absent, Sort by and Filters absent, planned grey text
    absent, no legacy shell nodes, and no console errors.
- The browser session was unauthenticated, so numbered authenticated graph nodes
  and keyboard Delete mutation still need William's signed-in browser session for
  visual acceptance.

## Recent development note (2026-07-07 automatic wafer naming)

- Updated Process Flow Add wafer so it no longer prompts for a wafer name.
  The server action now assigns the next Greek-family wafer code automatically:
  ALPHA, BETA, GAMMA, through OMEGA, then cycles with numeric suffixes.
- The generated name is chosen server-side from existing project wafer codes, so
  client input cannot spoof the sequence and child die codes still reserve their
  parent wafer family.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - In-app browser at
    `http://localhost:3015/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103`:
    toolbar Add wafer present, topbar Add wafer absent, no `Wafer code` prompt
    copy, no `Backend only`, and no console errors.
- The browser session was unauthenticated, so live Add wafer mutation still needs
  William's signed-in browser session for visual acceptance.

## Recent development note (2026-07-07 process flow wafer chip label fit)

- Fixed Process Flow wafer chips so full wafer family labels such as `ALPHA` and
  `EPSILON` no longer collapse to ellipses. Chips are wider, laid out in two
  columns, and SVG text is condensed inside the chip only when needed.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - In-app browser at
    `http://localhost:3015/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103`:
    Process Flow route rendered, toolbar Add wafer present, no `Backend only`,
    and no console errors.
- The browser session was unauthenticated, so live wafer chip visual acceptance
  still needs William's signed-in browser session.

## Recent development note (2026-07-07 prevent child die resplitting)

- Diagnosed the Process Flow bug where dragging A1 from Sample cleaning / EBL
  prep to Chrome deposition created `A1-A1` through `A1-A8` copies at Chrome.
- Root cause: the dicing detector scanned process-step instructions. The
  cleaning step instructions included `diced`, so cleaning was misclassified as
  another dicing step. Already-diced child wafers also lacked a hard server-side
  guard against being split again.
- Fixed `isDicingLikeStep` to inspect only step identity fields
  (`name`, `slug`, `process_area`) and added a split guard for child/die wafers
  with `parent_wafer_id`, `current_die`, or `created_from: dicing_completion`.
- Cleaned Supabase bad state:
  deleted 2 false `wafer_diced` events, deleted 16 nested child wafers, restored
  `ALPHA-A1` and `BETA-A1` metadata/status, and verified `remainingNestedCount: 0`.
- Also kept the compact wafer-chip fit behavior from the interrupted pass:
  chips are compact again and labels shrink/condense before clipping.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - Direct Supabase check: `BETA-A1` and `ALPHA-A1` are in Chrome deposition
    queued/in_progress, no bad nested `*-A1-A*` rows remain.
  - In-app browser at
    `http://localhost:3015/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103`:
    route rendered unauthenticated empty state, toolbar Add wafer present, no
    `Backend only`, and no console errors.
- The browser session was unauthenticated, so exact signed-in drag/drop visual
  acceptance still needs William's signed-in browser session.

## Recent development note (2026-07-07 wafer die detail gate)

- Fixed `/wireframe/wafer-status` tile clicks so newly diced die cards open the
  die dashboard/detail view even when their current process step maps to the
  generic queued status bucket. Undiced wafer cards remain selection-only.
- Root cause: the detail-open guard rejected every `queued` tile, while current
  steps like Chrome deposition and Sample cleaning / EBL prep do not map to the
  older litho/etch/test status buckets.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - Browser route
    `http://localhost:3015/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    at `1440x1000`: unauthenticated guard rendered with zero console errors.
  - Direct TypeScript runtime check confirmed a diced queued tile opens and an
    undiced tile stays closed.

## Recent development note (2026-07-07 step-scoped die notes)

- Linked die detail Process timeline to the selected process template steps and
  each die's step executions instead of the old mock timeline.
- Changed die notes to persist per process step using `text_surfaces` keys scoped
  as wafer/die/step, with a stage selector in the Notes tab that defaults to the
  current step.
- Linked parameter-table `Notes` row edits to the Poling step notes surface so
  poling notes are stage-associated rather than unscoped die notes.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - Browser route
    `http://localhost:3015/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    at `1440x1000`: unauthenticated guard rendered with zero current console
    errors.
- The browser session was unauthenticated, so signed-in stage-note mutation still
  needs William's signed-in browser session for visual acceptance.

## Recent development note (2026-07-07 process creation, all-stage notes, calendar wafer links)

- Added a sidebar `New process` action in the wireframe shell. Any signed-in
  account can create and name a new process template; project-scoped creation
  still respects project write access when a project is supplied.
- Changed die Notes tab from a single stage dropdown to an all-stage view. Every
  process step is visible even when empty, and each stage has its own add-note
  composer persisted to the step-scoped `text_surfaces` key.
- Blanked the default parameter grid seed values so new die parameter tables
  start empty unless values have been saved.
- Added backend calendar wafer linkage with `process_calendar_events.wafer_id`,
  migration `202607070001_calendar_event_wafer_link.sql`, calendar event wafer
  selector, server-side process-wafer validation, hydrated wafer labels, and
  timeline display of linked wafer context.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `npm run db:push`
  - `curl -s http://localhost:3015/api/health`
  - Browser routes
    `http://localhost:3015/wireframe/calendar?processId=11111111-1111-4111-8111-111111111103`
    and
    `http://localhost:3015/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    at `1440x1000`: unauthenticated guard states rendered with zero current
    console errors.
- The browser session was unauthenticated, so signed-in process creation,
  all-stage note mutation, and calendar wafer selection still need William's
  signed-in browser session for visual acceptance.

## Recent development note (2026-07-07 calendar mobile scroll fix)

- Fixed calendar surface vertical scrolling on mobile by changing
  `overscroll-behavior: none` to `overscroll-behavior: auto` on the timeline
  panel and the wireframe timeline wrapper, so touch scroll propagates to the
  page when the calendar reaches its boundary.
- Removed the blanket `touch-action: pan-x pan-y` from all timeline panel
  children, which was overriding natural browser scroll behavior.
- Changed panel `touch-action` from `pan-x pan-y` to `pan-y` so vertical page
  scroll is allowed while still enabling horizontal timeline pan gestures.
- Stopped calling `stopPropagation()` on touch pointer events so the timeline
  library's own touch detection (double-tap for event creation, item selection)
  is not blocked by the capture-phase handler.
- Verified with:
  - `npm run lint`
  - `npm run build`

## Recent development note (2026-07-07 process flow mobile die movement)

- Fixed mobile Process Flow wafer/die selection by stopping wafer-chip pointer
  events from bubbling into the parent step node. This preserves selected-wafer
  state on touch so the explicit move/delete action strip can appear instead of
  immediately clearing selection.
- Compacted the phone Process Flow controls into one horizontally scrollable
  toolbar, enlarged the canvas viewport, made selected-wafer actions sticky and
  horizontally scrollable, and made the move-note dialog fit phone height.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -I http://localhost:3015/process-flow?processId=11111111-1111-4111-8111-111111111103`
    confirmed this automation session is unauthenticated and redirects to `/`.
  - Playwright at
    `http://localhost:3015/wireframe/process-flow?processId=11111111-1111-4111-8111-111111111103`
    with a `390x844` viewport: toolbar computed as `nowrap` with horizontal
    scrolling, canvas height `610px`, no page-level horizontal overflow, and no
    console errors.
- The unauthenticated wireframe route had no wafer chips, so signed-in seeded
  die-move visual acceptance still needs William's signed-in browser session.

## Recent development note (2026-07-07 calendar mobile scroll, double-tap creation, hour headers)

- Fixed calendar vertical scrolling on mobile by changing `.calendar-timeline-panel`
  `touch-action` from `pan-y` to `manipulation`, which allows both horizontal and
  vertical native scroll while still disabling double-tap zoom for our own
  double-tap event creation.
- Removed the shift+drag-based event creation path from
  `handleTimelinePointerDownCapture`. Touch pointer events now return early so
  native scroll and the timeline library's touch handlers work directly.
- Added early return for `event.pointerType === "touch"` in the blank-canvas
  pointer down handler to let native page scroll and timeline library horizontal
  scroll pass through without JS pan interference.
- Added hour/block-level header rendering: when the timeline is zoomed in to a
  sub-day span, the wireframe header now renders a secondary `DateHeader` below
  the primary day/week/month header using the default header scale's
  `secondaryUnit`/`secondaryLabelFormat` and `createCurrentDayHeaderRenderer`.
- Cleaned up unused code: removed `draftDragSelection`, `draftDragSelectionRef`,
  `setActiveDraftDrag`, `finishDraftDrag`, `handleCanvasDoubleClick`, and
  `isShiftPressedRef` (no longer needed without shift-click creation).
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
- Browser verification was not completed because this session is unauthenticated.

## Recent development note (2026-07-07 mobile touch drag freeze rewrite)

- Fixed mobile Process Flow touch drag freeze (wafer chips and step/node cards
  initiating drag previews but the viewport scrolling instead of the element
  following the finger). Replaced React `onTouchStart` with native
  `addEventListener("touchstart", preventScroll, { passive: false })` in both
  FlowNodeCard and WaferChip components, because React 19 may use passive
  `touchstart` listeners that make `preventDefault()` a no-op.
- Added `foreignObject` guard to FlowNodeCard's touchstart listener so the title
  edit input on mobile still receives normal touch input.
- Added `touch-action: none` inline style on all visible SVG child elements
  (path, text, circle, rect) inside FlowNodeCard as belt-and-suspenders.
- WaferChip's effect conditionally registers the listener only when
  `pointerEvents !== "none"` (avoids interference with the drag preview overlay).
- Removed `overflow-hidden` from the Process Flow parent div so mobile child
  scroll containers work.
- Fixed mobile toolbar Organize/Add wafer overlap by changing `.flow-map-actions`
  from `display: inline-flex` to `display: flex` in the mobile media query.
- Verified with:
  - `npm run lint`
  - `npm run build`
- Signed-in drag-and-drop visual acceptance still needs William's logged-in
  browser session to exercise against seeded wafer chips.

## Recent development note (2026-07-07 calendar item touch drag fix)

- Applied the same native `touchstart` pattern from Process Flow (`{ passive: false }`
  + `preventDefault()`) to calendar timeline items so touch drag on events works
  without the browser intercepting the gesture as a scroll/pan.
- Used a ref callback in `CalendarTimelineItemRenderer` to attach the listener
  directly to each item div, preserving the library's original item ref.
- Removed the panel-level capture-phase touchstart handler (replaced by per-item).
- Verified with:
  - `npm run lint`
  - `npm run build`
- Committed as `5287c45`, pushed to `origin/main`, deployed to Vercel production.

## Recent development note (2026-07-07 calendar iPhone history pan and double-tap)

- Updated `/calendar` / `/wireframe/calendar` timeline touch behavior so blank
  timeline drags can use the board's pointer-pan path on iPhone instead of
  handing horizontal history swipes to the page background.
- Added explicit touch double-tap detection on blank timeline space to open the
  same one-hour draft event used by desktop double-click.
- Updated the deterministic wireframe fixture so the basic 30-minute seeded
  intake/completion step durations are one hour, and shifted the Alpha/Beta
  intake execution windows to one-hour blocks.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
- Browser/iPhone interaction verification was blocked in this automation session:
  the in-app browser bridge failed to initialize, and `npx playwright` attempted
  a network install that was rejected outside the sandbox. Signed-in iPhone
  visual acceptance still needs William's existing browser session or an
  explicitly approved Playwright install/run.

## Recent development note (2026-07-07 calendar linked options and mobile density)

- Fixed calendar create/update actions so selecting a process-assigned wafer
  returns the linked wafer object to the client immediately instead of persisting
  `wafer_id` while leaving `event.wafer` null until reload.
- Kept calendar step selection tied to canonical `process_steps` from the active
  process/template, with existing server validation still rejecting steps from a
  different process.
- Tightened the iPhone wireframe calendar density: site rail width, row height,
  event height, event gap, text size, card padding, resize handles, and scroll
  height were reduced so the step/wafer/person options area is reachable and
  more events fit without the previous oversized site rows.
- Verified with:
  - `npm run lint`
  - `npm run build`
- Restarted the requested dev server on `http://localhost:3015`; `lsof` confirmed
  PID `51455` listening on port 3015.
- Browser route verification was still blocked from this automation shell:
  the in-app browser bridge returns `sandboxCwd must be an absolute file URI`,
  and shell `curl` could not connect to the local listener even while `lsof`
  showed Next listening. William's local browser should use
  `http://localhost:3015/calendar` for final iPhone acceptance.

## Recent development note (2026-07-07 calendar Shift-drag regression fix)

- Restored the desktop/MacBook Shift-drag calendar draft creation path that was
  lost during the iPhone touch logic pass.
- Reintroduced the draft selection preview state, Shift key tracking, and
  pointermove/pointerup/Shift-release finalization while keeping the branch
  explicitly excluded for `pointerType === "touch"` so iPhone double-tap and
  touch panning remain separate.
- Verified with:
  - `npm run lint`
  - `npm run build`
- Browser interaction verification remains blocked from this automation shell:
  `lsof` shows the Next dev server listening on `http://localhost:3015`, but
  shell `curl` cannot connect and the in-app browser bridge still fails on
  sandbox cwd metadata. Manual MacBook acceptance should check Shift-drag on
  `http://localhost:3015/calendar`.

## Recent development note (2026-07-07 process-flow edge insertion)

- Diagnosed Process Flow insertion regression: double-click create only appended
  isolated steps and never split the existing transition under the click point,
  so inserting a step into `A -> B` left `A -> B` intact instead of producing
  `A -> New -> B`.
- Added edge hit detection/splitting helpers and wired `createNode` to replace
  the clicked transition with two queued transitions. Persisted transitions are
  deleted through the existing transition delete action; optimistic local
  transitions are removed from the pending queue.
- Removed duplicated visible step info by suppressing node subtitles that
  normalize to the same text as the node title, e.g. `Poling` plus `poling`.
- Added local ticket `docs/tickets/process-flow-edge-insert-regression.md` and
  focused regression tests in `src/components/process-flow/graphEdit.test.ts`.
- Verified with:
  - `npm run lint`
  - `npm run build`
- Browser automation was still unavailable from this shell, so manual acceptance
  should double-click an existing connection in `http://localhost:3015/process-flow`
  or `/wireframe/process-flow` and confirm the connection becomes
  `source -> new step -> target`.

## Recent development note (2026-07-07 process-flow display order)

- Fixed the remaining Process Flow insertion issue where a newly inserted middle
  step kept its appended database order in the node badge, e.g. rendering
  `1 -> 8 -> 2` after the edge was split.
- Added graph-derived display ordering so node badge numbers are recomputed from
  the current transition traversal during graph seed, live optimistic edits, and
  auto-layout. This keeps editor numbering aligned to the visible path without
  rewriting persisted `process_steps.step_order` used by other runtime fallbacks.
- Added focused regression coverage for an inserted `Dicing -> EBL Prep ->
  Chrome deposition` path where `EBL Prep` has persisted order `8` but displays
  as step `2`.
- Verified with:
  - `npm run lint`
  - `npm run build` (rerun with approved escalation after the sandbox blocked
    Turbopack's internal port bind)
  - `curl -s http://localhost:3015/api/health`
  - Playwright at `http://localhost:3015/wireframe/process-flow`, 390x844:
    unauthenticated guard rendered with no console errors.
- `http://localhost:3015/process-flow` redirected to `/` in Playwright because
  the browser session was unauthenticated, so the exact signed-in numbered graph
  still needs William's browser-session acceptance.

## Recent development note (2026-07-07 process-flow node copy removal)

- Removed the visible secondary copy under each Process Flow node title,
  including the process-area subtitle and generic role label such as `Step`.
- Moved wafer chips upward in the node card so cards do not keep the old blank
  copy area.
- Verified with:
  - `npm run lint`
  - `npm run build` (rerun with approved escalation after the sandbox blocked
    Turbopack's internal port bind)
  - `curl -s http://localhost:3015/api/health`
  - Playwright at `http://localhost:3015/wireframe/process-flow`, 390x844:
    route loaded with no console errors.

## Recent development note (2026-07-08 calendar process-step options)

- Fixed calendar event editing so Step / action options are not treated as
  static page-load data. The calendar now refreshes current process-flow step
  options and active wafer options from Supabase through
  `/api/processes/[processId]/calendar/options` on mount, focus, and when opening
  or syncing the event editor.
- Linked historical calendar event labels now prefer the current process step
  name from the live process-flow option map when `process_step_id` is still
  present, falling back to the stored snapshot only for unlinked/deleted steps.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - Playwright at `http://localhost:3015/calendar`, 390x844: opened the New
    event editor, confirmed the Step / action dropdown contained UUID-backed
    current process steps (`Wafer intake and inspection`, `Solvent clean`,
    `Step 3`) plus `New action`, and confirmed no console errors.

## Recent development note (2026-07-08 calendar selected-process routing)

- Fixed the remaining Calendar/Process Flow mismatch where the main Calendar
  navigation dropped `processId`, causing `/calendar` to fall back to the old
  active MQPG template and show unrelated step options after editing a different
  process flow.
- Desktop sidebar and mobile chrome main Calendar links now preserve the current
  process id, matching the existing Process Flow and Wafer / Die Status sub-nav
  behavior.
- When `/calendar` is opened without an explicit `processId`, the backend now
  falls back to the most recently updated process template instead of always
  preferring any active historical template.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright at `http://localhost:3015/process-flow`: Calendar nav links now
    resolve to `/calendar?processId=11111111-1111-4111-8111-111111111103`.
  - Playwright at
    `http://localhost:3015/calendar?processId=11111111-1111-4111-8111-111111111103`,
    390x844: opened New event and confirmed the Step / action dropdown showed
    the selected process flow steps (`Dicing`, `Chrome deposition`,
    `EBL lithography`, `Pad fabrication`, `PL2`, `Poling`, `Inspection`,
    `EBL Prep`) plus `New action`, with no console errors.

## Recent development note (2026-07-08 calendar step occurrence order)

- Updated calendar/viewer step option ordering to follow process-flow transition
  occurrence instead of stale `step_order`/name ordering.
- Added shared `orderProcessStepsByOccurrence` logic that walks non-return
  process step transitions from start/root nodes and falls back to `step_order`
  only for disconnected steps.
- Applied the occurrence order to the wireframe calendar page, the live
  `/api/processes/[processId]/calendar/options` endpoint, and the process
  dashboard calendar tab.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright at
    `http://localhost:3015/calendar?processId=11111111-1111-4111-8111-111111111103`,
    390x844: opened New event and confirmed the Step / action dropdown now
    ordered selected process steps by graph occurrence (`Dicing`, `Testing`,
    `EBL Prep`, `Chrome deposition`, `EBL lithography`, ...), with no console
    errors.

## Recent development note (2026-07-08 flow movement and die labels)

- Fixed wafer movement out of dicing-like steps so child die execution creation
  follows the actual `process_step_transitions` flow path instead of selecting
  every later `step_order` row, which could make moves appear to default to
  `Chrome deposition`.
- `moveWaferToProcessStep` now treats the direct transition edge type as the
  source-of-truth for completing the source step, rather than comparing
  `step_order`.
- Diced child labels are now generated from the wafer family prefix, e.g.
  `B1`-`B8` for Beta and `E1`-`E8` for Epsilon, instead of always using
  `A1`-`A8`.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright at
    `http://localhost:3015/process-flow?processId=11111111-1111-4111-8111-111111111103`:
    route loaded with no console errors.

## Recent development note (2026-07-08 process-flow selected wafer strip)

- Removed the selected wafer/die action strip that appeared above the process
  flow canvas after clicking a wafer, including the `Move to ...` and `Delete`
  buttons shown in that strip.
- Kept direct wafer drag-to-move behavior and keyboard deletion paths intact;
  this change only removes the always-visible selected-wafer action bar.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright at
    `http://localhost:3015/process-flow?processId=11111111-1111-4111-8111-111111111103`:
    route loaded with no console errors and
    `.flow-selected-wafer-actions` count was `0`.

## Recent development note (2026-07-08 wafer chip double-click guard)

- Prevented wafer/die chip double-clicks in Process Flow from bubbling to the
  parent node double-click handler, so selecting or double-clicking a wafer no
  longer opens the step-name editor.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright at
    `http://localhost:3015/process-flow?processId=11111111-1111-4111-8111-111111111103`:
    dispatched click/double-click on `.flow-wafer-chip`; `.flow-node-title-input`
    remained `0` before and after, with no console errors.

## Recent development note (2026-07-08 process-flow background wafer mutations)

- Made Process Flow wafer add, delete, and move paths local-first so the canvas
  updates before the server round trip completes.
- Adding a wafer now inserts an optimistic queued wafer on the start node
  immediately, then replaces it with the persisted assignment/wafer code in the
  background or removes it on failure.
- Moving a wafer now closes the move dialog and shifts the wafer chip to the
  target node immediately, then persists in the background and rolls back on
  failure.
- Deleting a wafer remains optimistic and now schedules a delayed background
  refresh instead of forcing an immediate full refresh after success.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright at
    `http://localhost:3015/process-flow?processId=11111111-1111-4111-8111-111111111103`:
    route loaded with no console errors.

## Recent development note (2026-07-08 wafer-status timeline flow order)

- Updated the wafer/die status timeline loader so process steps are ordered from
  `process_step_transitions` with the shared occurrence-order helper instead of
  stale `process_steps.step_order` sorting.
- The status timeline now picks the strongest execution row per step and derives
  current step from flow occurrence, so inserted/reconnected flow steps render in
  the same order as Process Flow.
- Earlier pending/missing timeline rows are shown as completed once the current
  step has advanced past them, repairing stale first-step displays after movement.
- Fixed first-step movement completion by treating a pending source execution as
  a valid current source when moving along a direct flow transition.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - Playwright screenshot at
    `http://localhost:3015/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`.
    The current browser session rendered the authenticated empty state, so live
    populated timeline acceptance still needs a process with visible wafer data.

## Recent development note (2026-07-08 process-flow move dialog regression)

- Fixed a regression where pressing `Move wafer` could restore the move dialog
  repeatedly after the server action selected an unrelated pending execution row
  instead of the dialog's source step.
- Extracted source-step execution selection into a focused helper and covered the
  pending-row hijack case with `src/features/runs/stepExecutionSelection.test.ts`.
- Ticket: `docs/tickets/process-flow-move-dialog-regression.md`.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `node --test src/features/runs/stepExecutionSelection.test.ts`
  - `curl -s http://localhost:3015/api/health`
  - Playwright screenshot at
    `http://localhost:3015/process-flow?processId=11111111-1111-4111-8111-111111111103`.
    The CLI browser was unauthenticated, so signed-in drag/drop acceptance still
    needs a live authenticated browser session.

## Recent development note (2026-07-08 wafer-status notes attachments)

- Linked process-flow move notes into wafer status by loading
  `step_executions.run_notes` into each status process step and seeding those as
  stage notes in the Notes tab.
- Added note attachments for new wafer-status notes: files upload to the private
  `wafer-process-files` bucket, register in `attachments`, persist as attachment
  references inside the note JSON, and open through a signed-download action.
- Updated flow-move note persistence so completing a source step stores the move
  note on the completed source execution instead of duplicating it onto the
  queued target execution.
- Added and applied migration `202607080001_note_attachment_file_types.sql` so
  `wafer-process-files` accepts images, PDFs, Word, PowerPoint, Excel, CSV, and
  JSON note attachments.
- Ticket: `docs/tickets/wafer-status-notes-attachments.md`.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `npm run db:push:dry`
  - `npm run db:push`
  - `curl -s http://localhost:3015/api/health`
  - Playwright screenshot at
    `http://localhost:3015/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`.
    The CLI browser rendered the auth-gated empty state, so populated signed-in
    note upload acceptance still needs a live authenticated browser session.

## Recent development note (2026-07-08 dicing note transfer)

- Fixed dicing split note transfer: when `splitWaferAfterDicing` creates child
  die wafers, it now copies the parent wafer's general and step-scoped
  `text_surfaces` notes into each child wafer's `waferId:dieLabel` note scope.
- Note values are copied unchanged, preserving note JSON and attachment
  references already stored in the note payload.
- Added `src/features/runs/dicingNoteTransfer.ts` plus a focused regression test
  for cloning parent note scopes to child die scopes.
- Ticket: `docs/tickets/dicing-note-transfer.md`.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `node --test src/features/runs/dicingNoteTransfer.test.ts`
  - `curl -s http://localhost:3015/api/health`
  - Playwright screenshot at
    `http://localhost:3015/process-flow?processId=11111111-1111-4111-8111-111111111103`.
    The CLI browser was unauthenticated, so exact signed-in dicing acceptance
    still needs a live authenticated browser session.

## Recent development note (2026-07-08 dicing note cleanup)

- Corrected dicing note transfer so the parent dicing move note is written into
  each child die wafer's Dicing step note scope, even though child assignments
  start after the dicing step.
- Stopped creating generated child wafer notes like `Diced piece I1 from IOTA.`
  and suppressed that generated legacy-note pattern for existing diced child
  wafers so it no longer appears under whichever stage is current.
- Expanded `src/features/runs/dicingNoteTransfer.test.ts` to cover dicing move
  note insertion and generated diced-piece note detection.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `node --test src/features/runs/dicingNoteTransfer.test.ts`
  - `curl -s http://localhost:3015/api/health`
  - Playwright screenshot at
    `http://localhost:3015/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`.
    The CLI browser rendered the auth-gated empty state, so exact signed-in note
    acceptance still needs a live authenticated browser session.

## Recent development note (2026-07-08 wafer-status notes redesign)

- Refactored only the wafer/die Notes tab UI into a two-column workflow:
  process timeline selector on the left, selected-step notes feed on the right,
  filter pills, sort select, attachment rows, and a bottom composer bound to the
  selected process step.
- Preserved existing note persistence, edit/delete behavior, attachment upload,
  attachment registration, and signed download logic. No backend/schema changes.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - Playwright screenshot at
    `http://localhost:3015/wafer-status?processId=11111111-1111-4111-8111-111111111103`.
    The CLI browser rendered the login screen, so visual acceptance of the
    signed-in Notes tab still needs a live authenticated browser session.

## Recent development note (2026-07-08 notes composer cleanup)

- Removed the redundant "Add note to" composer selector from the wafer/die Notes
  tab and removed the placeholder `@`, `#`, and `!` composer buttons.
- The composer now stays bound to the selected process timeline step and keeps
  file attachment plus add/cancel behavior unchanged.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - Playwright screenshot at
    `http://localhost:3015/wafer-status?processId=11111111-1111-4111-8111-111111111103`.
    The CLI browser rendered the login screen, so visual acceptance of the
    signed-in Notes tab still needs a live authenticated browser session.

## Recent development note (2026-07-08 notes timeline alignment)

- Aligned the wafer/die Notes tab process timeline with the existing Process
  timeline styling: compact 20px step markers, continuous neutral connector,
  family-colored completed connector segment, active-row tint, smaller check
  markers, and tighter row spacing.
- Kept the Notes-specific selected-step behavior and note-count pills.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - Playwright screenshot at
    `http://localhost:3015/wafer-status?processId=11111111-1111-4111-8111-111111111103`.
    The CLI browser rendered the login screen, so visual acceptance of the
    signed-in Notes tab still needs a live authenticated browser session.

## Recent development note (2026-07-08 notes timeline font spacing)

- Tightened the Notes tab timeline to match the existing Process timeline row
  metrics more exactly: fixed the right column to 18px, removed the Notes-only
  note-count pills, removed the selected-row inset shadow/border treatment, and
  matched title/subtitle text classes to `ProcessTimelineCard`.
- Kept timeline rows clickable for selecting the note stage.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - Playwright screenshot at
    `http://localhost:3015/wafer-status?processId=11111111-1111-4111-8111-111111111103`.
    The CLI browser rendered the login screen, so visual acceptance of the
    signed-in Notes tab still needs a live authenticated browser session.

## Recent development note (2026-07-08 admin viewer roles)

- Restored the auth card Sign in / Sign up mode switch.
- Added `npm run auth:seed-demo-users`, which creates/updates confirmed
  `admin@waferwatch.local` and `viewer@waferwatch.local` users, stores generated
  passwords in ignored `.env.demo-users.local`, upserts matching profiles, and
  assigns project memberships.
- Added read-only UI gating for viewer accounts across Calendar, Process Flow,
  and Wafer / Die Status detail editing surfaces. Server write actions still use
  the existing profile/project write-access checks.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `npm run auth:seed-demo-users`
  - Direct Supabase profile check confirmed active `admin` and `viewer` roles.
  - `curl -s http://localhost:3015/api/health`
  - Playwright screenshots at `http://localhost:3015/` and
    `http://localhost:3015/wafer-status?processId=11111111-1111-4111-8111-111111111103`.
    Login/signup was visually verified; authenticated role-specific UI still
    needs a signed-in browser session for visual acceptance.

## Recent development note (2026-07-08 process flow mobile deselect)

- Fixed the mobile process-flow canvas so tapping empty canvas space clears the
  currently selected step. Touch input still skips desktop drag-selection, but
  now runs the same blank-canvas deselect state cleanup used by mouse input.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - Playwright MCP at `http://localhost:3015/process-flow?processId=11111111-1111-4111-8111-111111111103`
    with a `390x844` iPhone-sized viewport: signed in as the seeded admin,
    selected a process step, dispatched a touch blank-canvas pointer on visible
    canvas space, and confirmed `.flow-node--selected` changed from `1` to `0`.

## Recent development note (2026-07-08 wafer status mobile breakpoint)

- Added explicit wafer-status mobile class hooks and breakpoint styling so phone
  layouts use denser metric rows, compact wafer tiles, shorter selected-wafer
  previews, and contained die-detail tabs.
- Fixed the die detail mobile overflow where the detail view expanded past the
  390px viewport and the tab rail pushed the page wider than the screen.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `curl -s http://localhost:3015/api/health`
  - Playwright MCP at `http://localhost:3015/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with a `390x844` viewport: list view had 9 wafer tiles and no document
    horizontal overflow; die detail view kept the document width at 390px while
    the tabs stayed contained as an internal horizontal scroller.

## Recent development note (2026-07-08 wafer status detail actions and tabs)

- Removed the temporary `Export report` and overflow menu controls from the
  wafer/die detail header, leaving only previous/next die navigation.
- Made the detail tab strip responsive for narrow inspection widths: it compresses
  into one row when labels fit, then wraps onto additional rows instead of
  clipping when browser zoom or narrow inspection panes reduce available width.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright MCP at `http://localhost:3015/wafer-status?processId=11111111-1111-4111-8111-111111111103`:
    at `390x844`, no document overflow, no `Export report`, no More actions
    button, and tabs wrapped without clipped labels; at `520x700`, `Process
    history` wrapped to its own row instead of cutting off; at `820x700`, all
    tabs fit on one row without clipped labels.

## Recent development note (2026-07-08 results image responsive sizing)

- Updated the wafer/die Results gallery so visible sample count responds to
  viewport width instead of always forcing five samples.
- Result image wells now record each loaded inspection image's natural dimensions
  and use that aspect ratio for the active image frame, with bounded fallbacks for
  very tall or very wide captures.
- Fixed Results-specific mobile grid sizing by forcing gallery wrappers to use
  `minmax(0, 1fr)` tracks, so phone layouts no longer clip an oversized internal
  gallery column.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright MCP at `http://localhost:3015/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    on the Results tab: `390x844` showed one 348px sample card with no document
    overflow, `820x700` showed three samples, and `1200x900` showed four samples.

## Recent development note (2026-07-08 results phone carousel)

- Fixed the phone Results tab so the gallery keeps multiple result cards in the
  row and uses horizontal snap scrolling instead of rendering a single visible
  card with no next samples to reach.
- Removed the fixed 760px minimum from the row parameter table so its columns fit
  the phone viewport and stay aligned with the current visible sample window.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright MCP at `http://localhost:3015/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    on the Results tab with a `390x844` viewport: document width stayed at
    `390px`, the gallery had `348px` client width and `1032px` scroll width,
    horizontal scrolling reached later cards, and the parameter headers were
    `Parameter`, `C10`, `C11`, `C12`, and `C13`.

## Recent development note (2026-07-08 dashboard zoom layout)

- Reworked the main dashboard overview band to use container-aware layout rules
  so it responds to the remaining content width after the desktop sidebar,
  especially under browser zoom or narrow inspection panes.
- Fixed the broken stat-tile treatment where desktop left borders activated
  while the dashboard grid was still stacked, creating thin vertical strips in
  zoomed views.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright MCP at `http://localhost:3015/dashboard`: at `1000x900`, document
    width stayed `1000px`, main content width stayed `736px`, activity/progress
    sections were full-width, and both stat tiles were equal `325px` columns.
  - Playwright MCP at `860x900`: document width stayed `860px`, main content
    width stayed `596px`, and stat tiles collapsed into full-width readable rows
    with no console errors.

## Recent development note (2026-07-08 notes controls removal)

- Removed the Notes tab filter/sort toolbar controls from the wafer die notes
  dashboard: `All notes`, `Open issues`, `Pinned`, `With attachments`, and the
  sort select no longer render in mobile or desktop layouts.
- Removed the extra notes header overflow action while keeping the selected
  process-step header, note count, save state, note list, composer, and
  attachments behavior.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright MCP at `http://localhost:3015/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with `390x844` and `1200x900` viewports: selected a die, opened Notes, and
    confirmed the removed labels were absent, document width matched viewport
    width, and no console errors were reported.

## Recent development note (2026-07-08 results compact matrix)

- Reworked the wafer die Results tab for phone/tablet widths so the gallery
  renders the full `3 x 15` result-sample matrix in one horizontal scroll
  surface instead of only the selected row window.
- Removed image-window arrow controls in compact mode and changed empty-sample
  taps to select the sample instead of opening the upload picker.
- Added a floating bottom-right selected-parameter summary for compact mode,
  replacing the bottom parameter table on phone/tablet while preserving the
  desktop row-review layout.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright MCP at `http://localhost:3015/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with `390x844`: selected a die, opened Results, confirmed `45` sample
    cards, `3660px` gallery scroll width, no document overflow, no arrow
    buttons, selected empty `R3C15` without opening the file chooser, and saw
    the floating `R3 C15` parameter summary.
  - Playwright MCP at `820x900`: compact matrix still rendered `45` cards,
    scrolled to `R3C15`, had no arrow buttons, and reported no console errors.

## Recent development note (2026-07-08 results popup controls)

- Fixed the compact Results selected-parameter popup so blank database cells
  display deterministic fallback values instead of empty rows.
- Added collapse/expand control and touch/pointer drag movement for the popup,
  with guarded pointer capture for synthetic verification events.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright MCP at `http://localhost:3015/wafer-status?processId=11111111-1111-4111-8111-111111111103`
    with `390x844`: selected a die, opened Results, selected `R1C8`, confirmed
    voltage, pulse width, pulse count, and post-pulse voltage values rendered;
    collapsed and expanded the popup; dragged it from `79,701` to `9,611`; kept
    document width at `390px`; and reported no console errors.

## Recent development note (2026-07-08 profile-backed team users)

- Replaced the shell team list source from seeded `process_people` rows to real
  active `profiles`, scoped through `project_members` when the active process is
  project-owned.
- Added a Supabase migration so project teammates can read each other's active
  profiles, and deactivated the old unlinked seeded people `adam`, `barbara`,
  `calvin`, and `derik` in existing databases.
- Updated demo-user seeding to create/link `william@waferwatch.local` as
  `William Xu`, plus profile-linked calendar person rows for admin, viewer, and
  William.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `npm run db:push`
  - `npm run auth:seed-demo-users`
  - Direct Supabase check confirmed active profiles for admin, viewer, and
    William; confirmed old seeded process people are inactive and profile-linked
    rows exist for the real users.
  - Playwright MCP at `http://localhost:3015/dashboard`, `1200x900`: sidebar
    showed `WaferWatch Admin`, `WaferWatch Viewer`, and `William Xu`; did not
    show `adam`, `barbara`, `calvin`, or `derik`; no console errors.
  - Playwright MCP at `http://localhost:3015/calendar?processId=11111111-1111-4111-8111-111111111103`:
    page text showed DB users and did not show the old seeded names.

## Recent development note (2026-07-08 process flow desktop wheel)

- Fixed process-flow desktop wheel handling so unmodified mouse-wheel and
  trackpad events pan the canvas instead of falling through to zoom.
- Kept Ctrl/Meta wheel and Safari gesture events as the zoom paths.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright MCP at `http://localhost:3015/process-flow?processId=11111111-1111-4111-8111-111111111103`
    with `1200x900`: unmodified `DOM_DELTA_LINE` wheel changed `scrollTop`
    from `0` to `48` with zoom unchanged at `35%`; unmodified pixel wheel
    changed scroll to `128/20` with zoom still `35%`; Ctrl-wheel changed zoom
    to `43%`; no console errors.

## Recent development note (2026-07-08 process flow concurrent wafer delete)

- Fixed process-flow wafer/die deletion so optimistic deletes are no longer
  blocked by a global wafer mutation pending state.
- Delete requests now run independently per assignment id, and a failed request
  restores only the specific failed chip instead of rolling back the whole graph
  snapshot.
- Hardened process-flow pointer capture/release calls so interrupted or scripted
  pointer events do not throw console errors.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Seeded two temporary `CODEX-DELETE-*` wafer assignments on
    `http://localhost:3015/process-flow?processId=11111111-1111-4111-8111-111111111103`,
    selected and deleted `T1` then `T2` back-to-back, and confirmed both chips
    disappeared immediately and stayed gone after server settlement.
  - Direct Supabase check confirmed the temporary wafer and assignment rows were
    deleted after verification; Playwright reported no console errors on the
    final delete run.

## Recent development note (2026-07-08 process flow revert to prior step)

- Added explicit redo/revert movement support for process-flow wafers: dragging
  a wafer/die to an earlier persisted `process_steps.step_order` opens a
  `Revert wafer` note dialog instead of requiring a forward graph edge.
- Server-side movement now distinguishes forward moves from revert moves,
  resets later executions to `pending`, queues the revert target, records
  `wafer_step_reverted`, and blocks diced children from reverting back through
  their dicing source step.
- Wafer-status process timelines now load execution metadata and show redo
  branch badges such as `Redo from here` and `Redo required`.
- Fixed wafer drag completion by tracking the active drag in a ref and routing
  node-level pointer move/up events through wafer drop handling.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright on `http://localhost:3015/process-flow?processId=11111111-1111-4111-8111-111111111103`:
    seeded temporary `R1` at `Testing`, dragged it to earlier `Chrome deposition`,
    saw the `Revert wafer` dialog, submitted a redo note, and confirmed `R1`
    moved to `Chrome deposition` with no console errors.
  - Direct Supabase check confirmed the target execution was queued with
    `revert_target_at` metadata and later executions were reset with
    `reverted_at` metadata.
  - Playwright on `/wafer-status?processId=11111111-1111-4111-8111-111111111103`:
    opened the temporary `R1` detail view and confirmed `Redo from here` and
    `Redo required` appeared in the process timeline.
  - Removed the temporary wafer, assignment, execution, and process-event rows
    after verification.

## Recent development note (2026-07-09 process creation and team filtering)

- Hid seeded `WaferWatch Admin` and `WaferWatch Viewer` accounts from the visible
  shell team list and calendar people source, leaving real profile-backed users
  such as William visible.
- Enabled `New process` in the authenticated app shell and changed process
  creation to seed a database-backed starter flow with `Process start`,
  `Process step`, `Process complete`, and flow transitions.
- Added a `Process type` option to the calendar event step/action dropdown,
  persisted through the existing calendar event manual-action field.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Browser at `http://localhost:3015/calendar?processId=11111111-1111-4111-8111-111111111103`
    signed in as the existing William demo account: sidebar showed `New process`,
    team showed `William Xu`, seeded WaferWatch admin/viewer names were absent,
    and the selected event editor dropdown showed database steps followed by
    `Process type` and `New action`.

## Recent development note (2026-07-09 inline process creation)

- Replaced the blocking `window.prompt("Process name")` process creation flow
  with an inline dashed `+ New process` tile below the existing current process
  card in both desktop sidebar and mobile drawer.
- Clicking the dashed tile opens an in-place `Name new process` input; empty or
  invalid names are discarded, Escape cancels, and Enter/blur creates the process
  only after a valid name is provided.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Browser at `http://localhost:3015/calendar?processId=11111111-1111-4111-8111-111111111103`:
    desktop click on the dashed `New process` tile showed the inline input with
    no prompt dialog.
  - Created a temporary process through the inline UI, confirmed
    `/process-flow?processId=...` rendered `Process start`, `Process step`, and
    `Process complete`, then deleted the temporary process row from Supabase.
  - Mobile viewport `390x844`: opening the drawer and clicking dashed
    `New process` showed the same inline input with no prompt dialog.

## Recent development note (2026-07-09 process drawer ordering)

- Moved the dashed `+ New process` tile into the current-process drawer below
  the process card and above `Process Flow` / `Wafer / Die Status`, matching the
  intended shuttered hierarchy.
- Fixed the drawer toggle so the selected route no longer forces the process
  drawer open; clicking the current process card can now close and reopen it.
- Kept the create tile available when there is no current process.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Browser at `http://localhost:3015/calendar?processId=11111111-1111-4111-8111-111111111103`:
    open state showed `New process` above `Process Flow`; clicking `Saeed`
    collapsed the drawer to height `0` and made the add tile not hit-testable;
    clicking `Saeed` again reopened it with the same ordering.

## Recent development note (2026-07-09 process create sibling)

- Moved the dashed `+ New process` tile back out of the Saeed/current-process
  shutter so it is a sibling action below the process card, not a child subtab
  of that process.
- The process drawer now contains only process-specific links:
  `Process Flow` and `Wafer / Die Status`.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Browser at `http://localhost:3015/calendar?processId=11111111-1111-4111-8111-111111111103`:
    open state had `New process` below the process card and above `Process Flow`;
    closing `Saeed` collapsed the drawer to height `0`, hid `Process Flow`, and
    kept `New process` visible and hit-testable.

## Recent development note (2026-07-09 process sublink indentation)

- Adjusted the open process layout so `Process Flow` and `Wafer / Die Status`
  render as indented child rows under the full-width dashed `New process` tile,
  making the create action read as a sibling and the process links read as
  Saeed/current-process children.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Browser at `http://localhost:3015/dashboard?processId=11111111-1111-4111-8111-111111111103`:
    `New process` remained visible/hit-testable when Saeed was collapsed;
    `Process Flow` and `Wafer / Die Status` were hidden when collapsed and
    reopened indented at `x=40` versus the `New process` tile at `x=16`.
