# Vercel environment variables (Church Ledger)

Set these in **Vercel → Project → Settings → Environment Variables** for **Production**, **Preview**, and **Development** as needed. Values are **never** committed to git.

## Required

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase **Project URL** (`https://<ref>.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **anon** **legacy** JWT from **Project Settings → API**, **or** leave empty if you only use publishable below. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Optional if anon JWT is set. New **`sb_publishable_…`** key from the same API page. The app uses anon JWT first, then falls back to this for browser/server session clients. |
| `SUPABASE_SERVICE_ROLE_KEY` | **service_role** secret (JWT) for server-only bootstrap (onboarding, data management RPCs, etc.). **Must** be from the **same** Supabase project as the URL. |

## Service role alias (optional)

| Variable | Notes |
|----------|--------|
| `SUPABASE_SECRET_KEY` | If your dashboard only shows the new **`sb_secret_…`** service secret, set this **instead of** `SUPABASE_SERVICE_ROLE_KEY`. The app reads `SUPABASE_SERVICE_ROLE_KEY` first, then `SUPABASE_SECRET_KEY`. |

## Recommended

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL, e.g. `https://your-app.vercel.app` or your custom domain. |
| `NEXT_PUBLIC_APP_ENV` | `production` / `staging` / `development` (controls banners and behaviour). |

## After changing variables

Redeploy (or trigger a new deployment) so serverless functions and edge pick up updates.

## Onboarding “Invalid API key”

That almost always means **`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`** is missing, wrong, from another project, or stale after rotation. Re-copy from **Supabase → Project Settings → API**, paste into Vercel, redeploy.
