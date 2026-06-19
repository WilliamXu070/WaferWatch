# Vercel Deployment

The app deploys as a standard Next.js project.

Use:

```bash
npx vercel login
```

or install the Vercel CLI and run `vercel` directly.

## Sign in

Run:

```bash
npx vercel login
```

This opens Vercel's browser/device login flow.

## Link the project

From the repo root:

```bash
npx vercel link
```

Choose or create the Vercel project for `WaferWatch`.

## Add environment variables

Add these to Vercel for Production, Preview, and Development unless you intentionally want different values:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
NEXT_PUBLIC_APP_URL
```

You can add them in the Vercel dashboard or with:

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL
npx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npx vercel env add SUPABASE_SERVICE_ROLE_KEY
npx vercel env add NEXT_PUBLIC_APP_URL
```

## Deploy

Preview:

```bash
npm run deploy:preview
```

Production:

```bash
npm run deploy:prod
```

## Supabase Auth URLs

After Vercel gives you a URL, set the Supabase Site URL to production and add redirect URL allow-list entries for production, previews, and local development:

```text
https://your-vercel-domain.vercel.app/**
https://*-your-vercel-team.vercel.app/**
http://localhost:3000/**
http://127.0.0.1:3000/**
```

Set `NEXT_PUBLIC_APP_URL` in Vercel to the production URL without a trailing slash, for example `https://your-vercel-domain.vercel.app`.
