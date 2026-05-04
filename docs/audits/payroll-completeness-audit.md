# Payroll Completeness Audit

## Files Found

### Payroll Pages

- `src/app/(app)/payroll/page.tsx`
- `src/app/(app)/payroll/new/page.tsx`
- `src/app/(app)/payroll/new/new-payroll-client.tsx`
- `src/app/(app)/payroll/[id]/page.tsx`
- `src/app/(app)/payroll/[id]/payroll-detail-client.tsx`

The payroll UI currently supports listing runs, creating a run, approving, posting, evidence attachment, journal preview, and a basic liability warning.

### Employees

- `src/app/(app)/employees/page.tsx`
- `src/app/(app)/employees/employees-client.tsx`
- `src/app/(app)/employees/[id]/*`
- `src/lib/employees/actions.ts`
- `src/lib/employees/types.ts`
- `src/lib/employees/monitoring.ts`

Current employee records are basic. Existing schema includes `full_name`, `ni_number`, `tax_code`, `role`, and `is_active`. It does not yet capture department/ministry, start/end dates, payroll status, default fund/account allocation, pension scheme participation, or payroll reference.

### Payroll Schema And RLS

- `supabase/migrations/00022_payroll_runs.sql`
- `supabase/migrations/00039_bills_payments_payroll_upgrade.sql`
- `supabase/migrations/00050_phase2_controls.sql`
- `supabase/migrations/00053_post_payroll_run_atomic.sql`

Existing payroll data includes `payroll_runs`, `payroll_lines`, and `payroll_run_splits`. Payroll run status is primarily `draft`, `approved`, and `posted`. Splits have stronger draft-only controls than payroll lines.

### Payroll Actions, Types, Validation

- `src/lib/payroll/actions.ts`
- `src/lib/payroll/types.ts`
- `src/lib/payroll/validation.ts`

`createPayrollRun` validates input totals and optional employee lines. `approvePayrollRun` checks locked periods and permissions. `postPayrollRun` calls `post_payroll_run_atomic`. `buildPayrollJournalLines` produces the client-side journal preview.

## Payroll Journal Logic

Current intended accounting model:

- Debit salaries expense.
- Debit employer NIC expense.
- Debit employer pension expense.
- Credit PAYE/NIC liability.
- Credit pension payable.
- Credit net pay liability.

Important gap: `buildPayrollJournalLines` credits PAYE/NIC liability with `PAYE + employer NIC`, while `post_payroll_run_atomic` credits only `total_paye_pence`. That can make database posting disagree with the UI preview and can fail journal balancing when employer NIC is non-zero.

## Pension Fields

Current payroll records have one pension total, but they do not clearly separate:

- employee pension contribution
- employer pension contribution
- pension payable
- pension provider payment status
- pension provider payment reconciliation

## PAYE/NIC Fields

Current payroll runs include PAYE and employer NIC totals. They do not yet separate employee NIC from employer NIC, and reporting does not yet provide a full PAYE/NIC liability report.

## Report Integration

Current integrations are lightweight:

- Dashboard/report surfaces include basic payroll summary data.
- Trustee packs can reference payroll summary and commentary.
- Annual accounts use payroll run count for a payroll note.
- Year-end filing pack currently includes a payroll run count rather than a full payroll schedule.

Missing:

- payroll summary report
- employer cost report
- payroll by fund/ministry
- pension contribution report
- PAYE/NIC liability report
- payroll vs budget
- annual payroll summary with year-scoped amounts for accounts notes

## Banking And Reconciliation

Current banking integration is generic. Reconciliation source types and bank rules can refer to payroll payments, but there is no first-class link between bank transactions and:

- net wages payment
- PAYE/NIC payment
- pension provider payment
- payroll liability settlement

## Missing Controls

- No review state before approval.
- No paid or reconciled state.
- No payroll import preview/commit workflow.
- No posted-run reversal/correction workflow.
- Payroll lines need stronger immutable-state controls.
- Employer NIC and pension fund allocation need to match the preview logic.
- Create/import/pay/reconcile/reverse lifecycle actions need consistent audit logging.
- Payroll liabilities need settlement tracking.
- Payroll reports need professional export/document support.

## Implementation Sequence

1. Extend payroll and employee schema safely.
2. Add import batches, import rows, liability payments, reversals, and settings.
3. Align database posting with TypeScript journal preview.
4. Add services for review, approve, post, paid, reconciled, reverse, imports, totals, reports, and reconciliation.
5. Add payroll reporting and document-production adapters.
6. Build the 9-tab payroll control centre UI.
7. Add tests and implementation documentation.
