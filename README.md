# WaferWatch

WaferWatch tracks fabrication processes, die movement, checkpoints, parameters, notes, inspections, and schedules for the McMaster Quantum Photonic Group.

## Stack

- Next.js App Router, React, and TypeScript
- Supabase Auth, Postgres, Realtime, and Storage
- Server Actions for workflow mutations
- Row Level Security for project-scoped access

## Product routes

- `/dashboard`
- `/calendar`
- `/process-flow`
- `/wafer-status`

All product routes require an authenticated account. `/api/health` is the deployment health surface.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required environment values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

Link the existing Supabase project before migration or type commands:

```bash
npm run db:link
npm run migration:list
```

Never edit an applied migration. Add a new file under `supabase/migrations` and use `npm run db:push:dry` before pushing it.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Workflow changes may also require:

```bash
npm run checkpoint:verify
npm run archive:verify
npm run collaboration:verify
```

## Architecture

- `src/app/(app)` — authenticated routes
- `src/components/process-flow` — Process Flow interaction logic
- `src/components/process-dashboard/calendar` — Calendar interaction logic
- `src/features` — domain queries, mutations, schemas, and projections
- `src/ui/waferwatch-wireframe` — active product UI under a historical namespace
- `src/types/database.ts` — runtime database contract
- `supabase/migrations` — append-only database history
- `scripts` — deterministic workflow verification

See `agents.md` for invariants and the required release loop. See `docs/refactor-plan.md` for the current simplification sequence.
