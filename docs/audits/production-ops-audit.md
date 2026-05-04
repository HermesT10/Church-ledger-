# Production Ops Audit

## Summary

Phase 4 starts from a codebase that is functionally broad and increasingly well-controlled in accounting terms, but still early in operational maturity.

Before this phase:

- `Vitest` and `Playwright` existed, but operational scripts and CI were incomplete.
- The test suite leaned heavily toward pure logic and documentation-style tests rather than end-to-end finance workflows.
- There was no GitHub Actions pipeline.
- Environment handling was lightweight and not centrally validated.
- Health checks existed, but only validated Supabase connectivity.
- Logging was mostly `console.warn` / `console.error`.
- There was no error monitoring integration.
- Report caching was process-local and had no hit/miss telemetry.
- Backup guidance existed, but release/deploy/rollback runbooks were missing.

This phase adds the minimum production-operable foundation while leaving some larger follow-up work for later, especially around full database-backed integration tests and distributed cache infrastructure.

## Current Repo Inventory

| Area | Current State | Evidence | Gap / Risk |
|---|---|---|---|
| Unit tests | Present and useful for finance logic | `tests/billPosting.test.ts`, `tests/paymentRunPosting.test.ts`, `tests/reconciliationMatching.test.ts`, reporting tests | Coverage is stronger for calculations than for runtime flows |
| E2E | One smoke spec present | `tests/e2e/smoke.spec.ts` | Only one smoke path; no matrix by role/module |
| CI/CD | Added in Phase 4 | `.github/workflows/ci.yml` | Still depends on secrets for smoke runs |
| Env validation | Added in Phase 4 | `src/lib/env.ts`, `src/lib/env.server.ts` | More env-backed modules can still be migrated onto shared helpers |
| Healthcheck | Expanded in Phase 4 | `src/app/api/health/route.ts` | Still not a deep dependency graph or queue/storage readiness check |
| Logging | Structured logging added | `src/lib/logger.ts`, `src/lib/monitoring.ts` | Not every server action is instrumented yet |
| Error monitoring | Sentry added | `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` | Needs DSN and release envs configured in deployment |
| Request tracing | Request IDs added | `src/proxy.ts`, `src/lib/request-context.ts` | Cross-service tracing is not yet implemented |
| Performance visibility | Cache stats and slow-query logs added | `src/lib/cache.ts`, `src/lib/perf.ts` | No distributed metrics backend yet |
| Cache strategy | In-memory TTL cache with telemetry | `src/lib/cache.ts` | Not suitable for horizontally scaled production |
| Migrations | Sequential SQL migrations present | `supabase/migrations/*.sql` | Lifecycle/review rules were not previously documented |
| Seed strategy | Local seed exists | `supabase/seed.ts` | No sanitized staging-refresh workflow in code |
| Release runbooks | Added in Phase 4 | `docs/runbooks/*.md` | Still requires operational discipline from maintainers |

## Test Framework Status

### Existing

- `Vitest` for unit/integration-style tests.
- `Playwright` for smoke/browser checks.
- Existing coverage emphasizes:
  - posting math
  - permissions
  - reconciliation matching
  - reporting helpers
  - environment/documentation assertions

### Added in Phase 4

- `tests/envValidation.test.ts`
- `tests/healthRoute.test.ts`
- stronger operational assertions in `tests/performance.test.ts`
- smoke test now checks `/api/health` before login flow

### Still Missing

- true DB-backed integration tests for:
  - journal posting
  - bill approval/posting
  - payroll posting
  - bank import
  - attachment upload permissions
- role-matrix browser tests
- organisation switching tests once the multi-org switcher exists

## CI/CD Status

### Added

GitHub Actions workflow at `.github/workflows/ci.yml` now runs:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test:run`
5. `npm run build`

An optional `e2e-smoke` job runs when required secrets are configured.

### Remaining Risks

- No deployment automation is configured in-repo.
- No migration/apply gate exists yet for staging/prod.
- No preview deployment status integration exists yet.

## Environment Variable Handling

### Added

- Public env parsing in `src/lib/env.ts`
- Server env parsing in `src/lib/env.server.ts`
- shared site URL / release / log-level helpers

### Remaining Gaps

- Some scripts still read `process.env` directly.
- No secrets manager automation is defined in-repo.
- No automatic environment parity enforcement between staging and production.

## Migration Workflow Status

### Current State

- Migrations are under `supabase/migrations`.
- Files are already sequentially named and reflect iterative schema evolution.
- Phase 2 proved that the team needs strict single-purpose migration discipline for Supabase CLI reliability.

### Risks

- Forward-only expectations were not documented before this phase.
- Generated type refresh process is not yet automated.
- There is no migration CI smoke check yet.

## Logging / Monitoring Status

### Added

- `pino` structured server logger
- request IDs propagated from `src/proxy.ts`
- Sentry initialization for browser/server/edge
- critical failure logging added for:
  - bills / payment runs
  - journals / reversals
  - payroll approvals / posting
  - reconciliation matching
  - audit write failures
- health endpoint now reports env/db/cache status

### Remaining Gaps

- No log shipping destination configured in repo
- No alert routing configuration
- No dashboard or uptime monitoring config

## Backup and Recovery Gaps

Before this phase there was only `docs/backup-restore.md`.

Phase 4 adds a runbook-focused replacement at `docs/runbooks/backup-and-recovery.md`, but operational follow-through is still required:

- schedule restore tests
- define named restore owners
- ensure storage backup policy exists alongside database policy

## Staging vs Production Parity Gaps

Current main risks:

- no enforced staging refresh cadence
- no documented sanitized data process
- e2e secrets may differ from production auth/users
- cache behavior in single-process environments will not match multi-instance production

## Recommended Next Priorities

1. Build DB-backed integration harnesses for posting/import workflows.
2. Implement distributed cache or platform-native cache invalidation.
3. Add deploy-time migration verification and rollback drills.
4. Add role-based browser smoke coverage.
5. Complete multi-org switcher so org-context tests become meaningful.
