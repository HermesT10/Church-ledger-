# ChurchLedger — Supabase Setup

## 1. Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New Project**, choose an organisation, set a project name, database password, and region.
3. Wait for the project to finish provisioning (~1 minute).

## 2. Get your API keys

1. In the Supabase dashboard navigate to **Settings → API**.
2. Copy the following values:

| Dashboard field | Env variable |
|---|---|
| **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` |
| **anon / public** key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **service_role / secret** key | `SUPABASE_SERVICE_ROLE_KEY` |

> **Important:** The `service_role` key bypasses Row Level Security. Never expose it to the browser.

## 3. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local` with the values from step 2.

## 4. Verify connectivity

Start the dev server and hit the health endpoint:

```bash
npm run dev
curl http://localhost:3000/api/health
```

You should see:

```json
{ "status": "ok", "timestamp": "2026-02-12T..." }
```

If you see `{ "status": "error", ... }`, double-check your env values and that the Supabase project is active.
