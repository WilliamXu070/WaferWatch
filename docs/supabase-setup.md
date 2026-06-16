# Supabase Setup

## Auth

Enable email/password auth in Supabase Auth. Add the local and deployed app URLs to the allowed redirect URLs:

- `http://localhost:3000/**`
- `http://127.0.0.1:3000/**`
- `https://your-vercel-domain.vercel.app/**`
- `https://*-your-vercel-team.vercel.app/**` for preview deployments

Set the Supabase Site URL to the deployed production URL when you are ready for production. The app sends new sign-up confirmation emails to `/auth/confirm?next=/`, so old email links created before this route existed may need to be resent.

The migration installs an `auth.users` trigger that creates `public.profiles` rows automatically.

## API keys

Use these app environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Supabase now prefers publishable and secret keys. If your dashboard only exposes legacy keys, use the anon key for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the service role key for `SUPABASE_SERVICE_ROLE_KEY`.

## Database

Apply:

```text
supabase/migrations/202606150001_core_architecture.sql
```

If tables/views exist but the app reports missing authorization RPC functions or storage policies, apply:

```text
supabase/migrations/202606150002_repair_auth_storage.sql
```

Optional seed:

```text
supabase/seed.sql
```

## First admin

Create your first account through Supabase Auth or the future app UI, then run:

```sql
update public.profiles
set role = 'admin'
where email = 'your.email@mcmaster.ca';
```

Admins can manage profiles, project access, tools, recipes, and shared process templates.

## Storage

The migration creates these private buckets:

- `wafer-characterization`
- `wafer-process-files`
- `wafer-maps`

Object paths must begin with a project UUID so storage RLS can check project membership.
