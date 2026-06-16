# Backend Architecture

## Runtime

- Browser/mobile clients use the Vercel-hosted Next.js app.
- Server Components and Server Actions use the cookie-aware Supabase SSR client.
- Route Handlers expose focused backend endpoints for frontend code and future instrument integrations.
- Supabase owns persistence, auth, RLS enforcement, and file storage.

## Domain model

- `profiles`: Supabase-authenticated users with lab roles.
- `projects` and `project_members`: project ownership and access.
- `process_templates` and `process_steps`: reusable process plans.
- `wafer_lots` and `wafers`: fabrication inventory.
- `wafer_process_assignments`: applied process flow per wafer.
- `step_executions`: ordered run state for each wafer process step.
- `tool_reservations`: calendar/scheduling base for equipment.
- `measurements`: extracted characterization metrics and source metadata.
- `process_issues`: holds, failures, rework, and investigation state.
- `process_events`: user-facing wafer timeline.
- `audit_events`: admin-facing change history.
- `attachments`: Supabase Storage metadata.

## Frontend-facing modules

- `src/features/accounts/actions.ts`
- `src/features/projects/actions.ts`
- `src/features/wafers/actions.ts`
- `src/features/process-flows/actions.ts`
- `src/features/runs/actions.ts`
- `src/features/measurements/actions.ts`
- `src/features/calendar/queries.ts`
- `src/features/metrics/queries.ts`

The calendar UI should start from `getCalendarEvents(projectId, fromIso, toIso)`.
The wafer tracking UI should start from `getWaferTimeline(waferId)`.
Dashboard metrics should start from `getProjectMetricSummary(projectId)`.

## API routes

- `GET /api/health`
- `GET /api/projects/:projectId/metrics`
- `GET /api/projects/:projectId/calendar?from={iso}&to={iso}`
- `GET /api/wafers/:waferId/timeline`
- `POST /api/storage/signed-upload`
- `POST /api/imports/wafers`

Server Actions are preferred for in-app mutations. Route Handlers are reserved for API-style consumers, uploads, imports, and future instrument ingestion.
