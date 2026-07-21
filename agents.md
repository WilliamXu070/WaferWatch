# WaferWatch agent guide

## Product surface

WaferWatch is a Next.js and Supabase fabrication workflow app. The only authenticated product routes are:

- `/dashboard` — process summary
- `/calendar` — weekly scheduling
- `/process-flow` — graph, wafer movement, checkpoints, parameters, and archive
- `/wafer-status` — die overview and process history

Do not recreate the deleted `/wireframe/*`, CRM prototype, wafer visualizer, icon resolver, or local auth proxy routes. The `waferwatch-wireframe` source namespace is an active historical name, not a second application.

## Source map

- Routes and server composition: `src/app/(app)`
- Process Flow UI: `src/components/ProcessFlowDiagram.tsx` and `src/components/process-flow`
- Calendar UI: `src/components/process-dashboard/ProcessCalendarBoard.tsx` and `calendar/`
- Wafer status UI: `src/ui/waferwatch-wireframe/components/wafer-die-detail`
- Workflow mutations: `src/features/process-flows/actions.ts` and `src/features/runs/actions.ts`
- Status projection: `src/features/wafers/queries.ts`
- Database contract: `src/types/database.ts`
- Database history: `supabase/migrations`
- Deterministic workflow checks: `scripts/verify-*.mjs`

Prefer small domain modules over adding more state or handlers to the two large client components. Search for an existing helper, schema, action, RPC, and test before introducing another pathway.

## Invariants

- Process Flow graph edges are visual; server actions remain the authority for movement eligibility.
- Phone taps select. Only a previously selected die can move; two-finger pinch owns zoom.
- The Process Flow selection inspector does not expose Move to or Submit review actions; movement and review submission stay on the canvas gesture path.
- Checkpoint history is append-only. Corrections and undo supersede evidence; they do not rewrite it.
- Wafer / Die Status has exactly two tabs: Overview and Process History.
- Poling and inspection workspaces may show shared die data; do not attribute it to a historical visit.
- Calendar reads and caches bounded weeks, not the entire event table.
- Preserve realtime revision/idempotency protections when changing mutations.

## Database safety

- Never delete compatibility tables or metadata keys until a backfill and shadow comparison prove parity on production-shaped data.
- Additive migrations must be reversible in effect and safe to rerun where practical.
- Researchers are lab-wide readers of active projects. Viewers remain group/member scoped, and writes still require `can_edit_project`.
- Use the user-scoped Supabase client by default. The admin client is limited to trusted server reads/writes that RLS cannot perform.
- Do not edit an applied migration. Add a new migration.
- `src/types/database.ts` is the current runtime type source. `npm run db:types` is inspection output until the generated contract is intentionally adopted.

## Required verification

Run all four for every code change:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

For workflow/database changes also run the relevant verifier:

```bash
npm run checkpoint:verify
npm run batch-lifecycle:verify
npm run archive:verify
npm run collaboration:verify
npm run researcher:verify
```

Use a signed-in desktop and 390x844 browser replay for interaction changes when available. State exactly what was not replayed. Never mutate real wafer data merely to prove UI behavior.

## Release loop

The primary checkout releases every completed edit:

1. Update this guide only when a stable invariant or handoff changes.
2. Verify the intended diff and keep unrelated user files untouched.
3. Commit only intended files to `main`.
4. Push `main`.
5. Deploy that verified commit with `npm run deploy:prod`.
6. Confirm the production `/api/health` endpoint before reporting completion.

Delegated branches must be integrated before production deployment.

## Refactor handoff — 2026-07-17

- Removed prototype routes, duplicate route trees, orphaned components/modules, unused server APIs/schemas, and the unused `interactjs` dependency.
- Added a single full test command; typecheck, lint, build, and 138 focused tests are the baseline gate.
- Canonical routes now own their implementations directly. Cache invalidation and navigation no longer branch on `/wireframe`.
- Process Flow exposes one typed server-action boundary, and Calendar has one production presentation/persistence path.
- Migration `202607170005` adds generated, indexed wafer/die identity columns while keeping metadata as the compatibility write source; production parity is verified.
- Production persistence still uses the compatibility assignment/execution/attempt/event model. Normalize it only through expand → backfill → shadow compare → cutover → later drop.
- Next refactor targets are extracting the hook-heavy Process Flow and Calendar controllers, followed by the status query waterfall and manual database contract.
