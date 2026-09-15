# Supabase Setup

## Auth

Enable email/password auth in Supabase Auth. Add the local and deployed app URLs to the allowed redirect URLs:

- `http://localhost:3000/**`
- `http://127.0.0.1:3000/**`
- `https://your-vercel-domain.vercel.app/**`
- `https://*-your-vercel-team.vercel.app/**` for preview deployments

Set the Supabase Site URL to the deployed production URL. The built-in `.ConfirmationURL` email templates work with the app's implicit email flow: `/auth/confirm` forwards browser-only fragments to `/auth/finish`, which validates the tokens with Supabase and creates server session cookies. This works when email opens in a different browser or on another device.

For projects with custom SMTP, direct token-hash links are also supported. In **Authentication → Email templates**, these can be configured as:

Confirmation:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard">Confirm email address</a>
```

Password recovery:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Reset password</a>
```

Do not change email requests back to PKCE while using `.ConfirmationURL`: its code exchange requires a cookie from the browser that started signup. Existing PKCE links remain supported in the originating browser; otherwise users can sign in or request a new confirmation email. Keep `NEXT_PUBLIC_APP_URL` and Supabase Site URL aligned to the canonical production origin.

Keep email confirmation enabled. The built-in Supabase mail service currently allows only organization-authorized recipients and has a low sending limit; configure a verified custom SMTP sender before opening registration to general users. Never disable confirmation to work around delivery restrictions.

If `/api/health` reports a network/DNS failure, check whether the Supabase project is paused before changing credentials or callback code. Resume the existing project and verify `ACTIVE_HEALTHY` plus HTTP 200 from the production health endpoint.

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
