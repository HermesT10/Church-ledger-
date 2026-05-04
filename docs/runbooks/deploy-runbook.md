# Deploy Runbook

## Purpose

This runbook describes the safe sequence for shipping ChurchLedger changes to staging and production.

## Standard Deploy Flow

### 1. Prepare

- confirm release owner
- confirm target environment
- review PR scope
- check for migrations
- confirm recent backup / restore point

### 2. Validate CI

Required checks:

- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- `npm run build`
- `npm run test:e2e:smoke` when configured

### 3. Staging Rollout

1. apply migrations
2. deploy app
3. verify `/api/health`
4. run smoke test checklist
5. review Sentry/logs for regressions

### 4. Production Rollout

1. confirm staging passed
2. announce deployment window if finance-impacting
3. apply production migrations
4. deploy app
5. verify `/api/health`
6. run focused smoke checks
7. monitor logs/Sentry for 15-30 minutes

## Rollback Guidance

Preferred order of thought:

1. Can the app be rolled back safely without DB rollback?
2. Can the issue be corrected with a follow-up migration or config change?
3. Only use DB restore/rollback if the incident is severe and approved.

Rules:

- never edit production data ad hoc without recording it
- prefer corrective forward migrations
- if restoring, follow `docs/runbooks/backup-and-recovery.md`

## Critical Finance Incident Notes

Treat these as high-severity:

- posting failures across journals/bills/payroll
- reports showing inconsistent totals
- cross-org data exposure
- attachment access failures for evidence records
- auth failures blocking finance users

Immediate response:

1. capture request IDs and Sentry issues
2. pause further deploys
3. determine if write flows should be paused
4. assign owner and incident timeline

## Release Metadata

Operational metadata should include:

- commit SHA / release identifier
- deployment time
- operator
- migration identifiers applied
- smoke result

## Residual Gaps

- deploy automation is not yet defined in-repo
- no automated rollback orchestration exists
- distributed cache invalidation is still future work
