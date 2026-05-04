# Environment Strategy

## Goals

ChurchLedger must run predictably across `local`, `development`, `staging`, and `production` without sharing secrets, mixing data, or masking environment-specific failures.

## Environments

| Environment | Purpose | Data Expectations | Secrets |
|---|---|---|---|
| Local | Feature development and manual debugging | Disposable/dev data only | `.env.local` on developer machine |
| Development | Shared internal integration environment | Non-sensitive test data | Deployment-managed secrets |
| Staging | Pre-release validation | Sanitized or controlled finance-like data | Production-like secrets, isolated project |
| Production | Live customer usage | Real data | Strictly limited access |

## Required Variables

Core runtime variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_SITE_URL`

Operational variables:

- `NEXT_PUBLIC_SENTRY_DSN`
- `LOG_LEVEL`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

Optional local/demo/e2e variables:

- `DEMO_MODE`
- `DEMO_MODE_KEY`
- `DEMO_ORG_ID`
- `BASE_URL`
- `E2E_EMAIL`
- `E2E_PASSWORD`

Template source: `.env.example`

## Validation

Environment validation now lives in:

- `src/lib/env.ts` for public/browser-safe vars
- `src/lib/env.server.ts` for server-only vars

Rules:

1. Any server code needing the service role key must use `getServerEnv()`.
2. Any browser Supabase client must use `getSupabaseBrowserEnv()`.
3. New env-backed modules should not read raw `process.env` directly unless they are standalone scripts.

## Secret Handling Rules

- `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- Never expose service role values in client bundles, logs, screenshots, or docs examples.
- Use platform secret stores for hosted environments.
- Limit who can view or rotate production secrets.
- Rotate credentials after any suspected exposure.

## Site URL Rules

Use `NEXT_PUBLIC_SITE_URL` wherever redirect/callback URLs must be deterministic.

Fallback behavior:

1. `NEXT_PUBLIC_SITE_URL`
2. `NEXT_PUBLIC_VERCEL_URL` / `VERCEL_URL`
3. `http://localhost:3000`

This fallback is implemented in `src/lib/env.server.ts`.

## Seed Strategy

### Local

- Use `supabase/seed.ts` for first-run bootstrap.
- Use demo/dev-only data only.

### Development

- Prefer deterministic test organisations and repeatable importable fixtures.
- Keep at least one smoke-test user/org pair stable for E2E.

### Staging

- Prefer sanitized or synthetic accounting data.
- If refreshed from production, scrub secrets and personal data before general access.

### Production

- No seeding except controlled onboarding/bootstrap flows.
- Never run local/dev seed scripts directly against production.

## Test Data Strategy

- Unit tests should remain deterministic and isolated.
- Integration tests should rely on clearly scoped seeded fixtures.
- E2E smoke credentials should belong to a dedicated smoke-test organisation.
- Avoid tests that depend on mutable human-owned accounts.

## Staging Parity Expectations

Staging should match production for:

- Node version
- Next.js version
- Supabase project shape and migration state
- enabled background services
- Sentry DSN wiring
- auth provider configuration required for smoke flows

Staging may differ from production for:

- traffic volume
- data volume
- external integrations intentionally stubbed or sandboxed

## Deployment Rules

1. Set `NEXT_PUBLIC_APP_ENV` explicitly per environment.
2. Apply database migrations before or alongside app rollout according to the deploy runbook.
3. Verify `/api/health` after each deploy.
4. Run smoke checks against staging before promoting production changes.

## Residual Gaps

- Some scripts still access raw env variables directly.
- No secrets-manager IaC is defined in the repo.
- Multi-org staging smoke coverage depends on future org-switch support.
