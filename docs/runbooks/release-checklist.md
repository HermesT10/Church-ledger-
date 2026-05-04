# Release Checklist

## Branch / Review Gates

- PR approved by required reviewers
- CI green:
  - lint
  - typecheck
  - unit/integration tests
  - build
  - e2e smoke if configured
- database migrations reviewed if present
- release owner assigned

## Pre-Release Validation

- staging environment healthy
- `/api/health` returns `ok`
- required secrets present
- Sentry DSN configured for target environment
- recent backup / restore point confirmed

## Finance Smoke Checklist

- login succeeds
- dashboard loads
- reports load
- one journal detail page opens
- one bill detail page opens
- one payroll run page opens
- reconciliation page loads
- attachment links resolve for a known record

## Migration Checklist

- pending migrations identified
- migration ordering reviewed
- forward-fix plan understood if migration fails
- staging migration already tested

## Deployment Approval

- change window agreed if release is finance-impacting
- rollback owner identified
- incident comms path identified

## Post-Deploy Checks

- `/api/health`
- Sentry has no major spike
- smoke test account can log in
- key reports still load
- no obvious request-id correlated errors in logs

## Branch Protection Guidance

Recommended repository settings:

1. require PR reviews on protected branches
2. require status checks from CI workflow
3. block force-pushes to protected branches
4. block direct commits to production branches
5. require resolved conversations before merge

## Preview Deploy Guidance

If preview environments are available:

- require build success before merge
- optionally require `/api/health` on preview
- run Playwright smoke tests against preview for auth/reporting routes
