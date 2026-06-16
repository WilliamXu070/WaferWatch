# Supabase CLI Workflow

The Supabase CLI is installed locally in this repo as a dev dependency. Use `npx.cmd supabase ...` on Windows, or the npm scripts below.

Official notes from Supabase: the npm workflow is `npx supabase` or local dev dependency installation. Global `npm install -g supabase` is not supported.

## One-time login

Create a Supabase access token:

1. Open Supabase Dashboard.
2. Go to account access tokens.
3. Create a personal access token.
4. Run:

```powershell
npx.cmd supabase login
```

If browser login is awkward, use:

```powershell
$env:SUPABASE_ACCESS_TOKEN="your-personal-access-token"
```

Do not commit that token.

## Link this repo to your hosted Supabase project

The project ref is the subdomain in:

```text
https://PROJECT_REF.supabase.co
```

Run:

```powershell
npx.cmd supabase link --project-ref PROJECT_REF
```

This may ask for the database password from Supabase Dashboard.

## Push migrations

After login and link, check the migration history first:

```powershell
npm.cmd run migration:list
```

This project already has the first migration's tables in the hosted database. If `202606150001` appears under `LOCAL` but not under `REMOTE`, mark it as already applied so the CLI does not try to recreate existing tables/types:

```powershell
npm.cmd run migration:repair -- 202606150001 --status applied
```

Then run a dry run:

```powershell
npm.cmd run db:push:dry
```

The dry run should show only the pending repair migration:

```text
202606150002_repair_auth_storage.sql
```

If the dry run looks correct, push:

```powershell
npm.cmd run db:push
```

For the current repair, this pushes:

```text
supabase/migrations/202606150002_repair_auth_storage.sql
```

## Generate database types

After migrations are applied:

```powershell
npm.cmd run db:types
```

This writes generated Supabase types to:

```text
src/types/database.generated.ts
```

## Sandbox note

In this Codex sandbox, the CLI cannot write to `C:\Users\William\.supabase`. If I run CLI commands here, I use:

```powershell
$env:USERPROFILE=(Get-Location).Path
$env:HOME=(Get-Location).Path
```

You usually do not need this in a normal local terminal.
