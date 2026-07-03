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
