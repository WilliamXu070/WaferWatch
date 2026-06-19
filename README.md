# WaferWatch

WaferWatch is a backend-first Next.js/Supabase scaffold for wafer fabrication tracking, cycle-time analysis, and process metric generation for the McMaster Quantum Photonic Group.

## What is included

- Next.js App Router project with TypeScript.
- Supabase SSR, browser, and admin clients.
- Cookie-aware auth proxy.
- Account/session guards and role checks.
- Supabase SQL migration for the core wafer fabrication domain.
- Row Level Security policies for project-scoped access.
- Supabase Storage buckets and storage policies.
- Server Actions for accounts, projects, wafers, process flows, step runs, reservations, measurements, issues, and attachments.
- API routes for health, metrics, calendar events, wafer timelines, signed uploads, and wafer imports.
- Metric views for cycle time, step duration, WIP by stage, and tool utilization.

## Local setup

1. Install Node.js `>=20.9.0`.
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env.local` and fill in the Supabase values.
4. Apply `supabase/migrations/202606150001_core_architecture.sql` to your Supabase project.
5. If your project already has the tables but RPC helpers or storage policies are missing, apply `supabase/migrations/202606150002_repair_auth_storage.sql`.
6. Optionally run `supabase/seed.sql` to load a baseline MQPG process flow and example tools.
7. Start the dev server:

```bash
npm run dev
```

## Required Supabase values

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (alias `NEXT_PUBLIC_SUPABASE_ANON_KEY` also accepted)
- `SUPABASE_SERVICE_ROLE_KEY` (alias `SUPABASE_SECRET_KEY` also accepted)

Copy `.env.example` to `.env.local` and fill these values.

## First account setup

Supabase Auth creates a `profiles` row automatically when a user signs up. New users default to the `researcher` role.

After creating your first account, promote it to admin from the Supabase SQL editor:

```sql
update public.profiles
set role = 'admin'
where email = 'your.email@mcmaster.ca';
```

## Storage path convention

All uploaded objects must start with the project UUID:

```text
{project_id}/characterization/{wafer_code}/file.csv
{project_id}/process-files/{wafer_code}/run-sheet.pdf
{project_id}/wafer-maps/{wafer_code}/map.png
```

The RLS storage policies depend on that first path segment.

## Verification

The scaffold currently passes:

```bash
npm run typecheck
npm run lint
npm run build
```

## Deploy

See `docs/vercel-deploy.md` for the Vercel sign-in, env var, and deploy steps.
