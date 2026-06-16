# Vercel Deployment

The app deploys as a standard Next.js project. Use `npx.cmd vercel` instead of installing Vercel CLI into the repo.

## Sign in

Run:

```powershell
npx.cmd vercel login
```

This opens Vercel's browser/device login flow.

## Link the project

From the repo root:

```powershell
npx.cmd vercel link
```

Choose or create the Vercel project for `WaferWatch`.

## Add environment variables

Add these to Vercel for Production, Preview, and Development unless you intentionally want different values:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
NEXT_PUBLIC_APP_URL
```

You can add them in the Vercel dashboard or with:

```powershell
npx.cmd vercel env add NEXT_PUBLIC_SUPABASE_URL
npx.cmd vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npx.cmd vercel env add SUPABASE_SECRET_KEY
npx.cmd vercel env add NEXT_PUBLIC_APP_URL
```

## Deploy

Preview:

```powershell
npm.cmd run deploy:preview
```

Production:

```powershell
npm.cmd run deploy:prod
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
