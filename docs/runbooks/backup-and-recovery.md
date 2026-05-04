# Backup and Recovery

## Scope

This runbook covers database backup expectations, restore access, validation, and incident response for ChurchLedger.

The older reference guide remains in `docs/backup-restore.md`; this runbook is the operational version to follow during releases and incidents.

## Backup Expectations

### Supabase Hosted

- Use Supabase-managed backups as the baseline protection layer.
- Enable the highest backup / PITR tier appropriate for the production environment.
- Review backup status in the Supabase dashboard on a scheduled cadence.

### Manual Backup Expectations

Before high-risk changes:

1. confirm the latest automated restore point exists
2. capture an on-demand backup if the release is high impact
3. record the backup timestamp in the release notes

## Storage Considerations

Database backup is not the full recovery story.

Also confirm:

- Supabase Storage buckets holding financial evidence are recoverable
- retention for uploaded attachments is understood
- restore owners know whether storage recovery is separate from DB recovery

## Access Control

Only named platform owners should be able to:

- trigger restores
- view production backup status
- use database admin credentials
- rotate storage/service credentials

Application-level finance users must not have restore permissions.

## Restore Test Procedure

Run at least quarterly:

1. choose the latest viable backup
2. restore it into staging or an isolated recovery environment
3. update environment-specific secrets and URLs
4. run smoke checks:
   - `/api/health`
   - login
   - key reports
   - journal/bill/payroll visibility
5. record:
   - restore date
   - operator
   - backup point used
   - validation result
   - issues found

## Production Restore Procedure

1. Declare incident owner.
2. Freeze deployments and high-risk finance operations if needed.
3. Capture current system state for forensics if feasible.
4. Identify the target restore point.
5. Confirm stakeholder approval before destructive restore.
6. Restore database using Supabase/PITR or approved DBA process.
7. Restore storage data if required separately.
8. Run post-restore validation:
   - `/api/health`
   - login
   - trial balance / balance sheet / key reports
   - latest posted journals, bills, payroll runs
   - attachment access
9. Communicate recovery status and remaining gaps.

## Finance-Focused Validation

After any restore, verify:

- posted ledger still balances
- restricted fund balances look plausible
- bank reconciliation summaries align with expected checkpoint
- latest reporting period totals are internally consistent
- evidence attachments still resolve

## Incident Checklist

- identify impact window
- identify affected organisations
- pause risky write flows if needed
- capture logs/Sentry issues/request IDs
- confirm last known good state
- restore only with named approval
- document incident timeline and corrective actions

## Ownership

Recommended named owners:

- Platform owner: backup policy and restore execution
- Finance product owner: accounting validation after restore
- Engineering lead: incident coordination and postmortem

## Residual Gaps

- restore drills are not yet automated
- storage backup policy must be confirmed in the hosting environment
- no in-repo evidence of scheduled backup audits exists yet
