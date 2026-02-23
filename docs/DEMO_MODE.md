# Demo Mode

A dev-only, read-only bypass of Supabase authentication that lets external
reviewers browse the app without credentials.

## How It Works

Demo mode is **triple-gated** — all three conditions must be true:

| Gate | Description |
|------|-------------|
| Env `DEMO_MODE` | Must be `"true"` |
| Query param `demo` | Must be `1` |
| Query param `key` | Must match env `DEMO_MODE_KEY` |

When all three conditions are met, the middleware sets an internal header
(`x-demo-mode: true`) that downstream auth helpers read. The user sees the
app as a **Treasurer** of the configured organisation, but **all write
operations are blocked**.

## Setup

### 1. Add environment variables

In `.env.local` (or your deployment env):

```env
DEMO_MODE=true
DEMO_MODE_KEY=my-secret-review-key
DEMO_ORG_ID=<uuid-of-the-org-to-expose>
```

- `DEMO_MODE` — master switch. Set to `"true"` to enable.
- `DEMO_MODE_KEY` — a secret string that must appear in the URL. Choose
  something unguessable.
- `DEMO_ORG_ID` — the UUID of an existing organisation in your database.
  The demo user will see this org's data.

### 2. Restart the dev server

```bash
npm run dev
```

### 3. Access the demo URL

```
http://localhost:3000/dashboard?demo=1&key=my-secret-review-key
```

Replace `localhost:3000` with your ngrok or deployment URL as needed.

## URL Format

```
https://<host>/<any-app-route>?demo=1&key=<DEMO_MODE_KEY>
```

The `demo=1` and `key=...` params must be present on every page navigation.
The red **DEMO MODE (read-only)** banner is displayed whenever `?demo=1` is
in the URL.

## What Happens in Demo Mode

| Area | Behaviour |
|------|-----------|
| Authentication | Supabase auth is bypassed; a fake user is injected |
| Organisation | Uses `DEMO_ORG_ID` with role `treasurer` |
| Read operations | Work normally (queries go through Supabase) |
| Write operations | Blocked — all mutations throw `DemoModeError` |
| Onboarding | Skipped entirely |
| UI banner | Red "DEMO MODE (read-only)" banner shown at top |
| Sidebar | Shows "Demo User" / "Demo Organisation" |

## Safety

- **No writes possible.** Every server action that mutates data calls
  `assertWriteAllowed()` as its first line, which throws if demo mode is
  active.
- **Normal auth unaffected.** When `DEMO_MODE` is not `"true"`, the
  middleware and auth helpers behave exactly as before.
- **No real user session.** Demo mode uses a fake user ID
  (`00000000-0000-0000-0000-000000000000`). No real Supabase session is
  created or modified.
- **RLS still applies.** Read queries go through the standard Supabase
  client — the service-role admin client is not used for demo reads.

## Disabling Demo Mode

Set `DEMO_MODE=false` (or remove it entirely) and restart the server.
Visiting `?demo=1&key=...` will have no effect — the middleware will
redirect unauthenticated users to `/login` as normal.

## Files Involved

| File | Role |
|------|------|
| `src/lib/demo.ts` | `isDemoMode()`, `assertWriteAllowed()`, `getDemoOrgConfig()` |
| `src/middleware.ts` | Detects demo query params, sets `x-demo-mode` header |
| `src/lib/auth.ts` | Returns fake user in demo mode |
| `src/lib/org.ts` | Returns demo org config in demo mode |
| `src/app/(app)/layout.tsx` | Skips onboarding/membership checks in demo mode |
| `src/components/demo-banner.tsx` | Red "DEMO MODE" banner |
| `src/components/collapsible-layout.tsx` | Renders the demo banner |
| All server action files (~20) | `await assertWriteAllowed()` guard on mutations |
