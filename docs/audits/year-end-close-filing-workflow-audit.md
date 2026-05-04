# Year-End Close Filing Workflow Audit

## Files Found

### Period Locks

- `src/lib/periods/actions.ts`
- `src/lib/periods/types.ts`
- `src/app/(app)/settings/periods/page.tsx`
- `src/app/(app)/settings/periods/periods-client.tsx`
- `supabase/migrations/00038_financial_periods.sql`
- `supabase/migrations/00050_phase2_controls.sql`

### Month-End Close

- `src/app/(app)/month-end/page.tsx`
- `src/app/(app)/month-end/month-end-client.tsx`
- `src/lib/insights/actions.ts`
- `src/lib/insights/monthEnd.ts`
- `supabase/migrations/00058_month_end_reviews.sql`
- `supabase/migrations/00059_month_end_reviews_rls.sql`

### Annual Accounts, Reporting, And Filing Foundations

- `src/lib/annual-accounts/*`
- `src/app/(app)/reports/annual/accounts-builder/*`
- `src/lib/reports/engine/*`
- `src/lib/reports/trustee-packs/*`
- `src/lib/reports/actions.ts`
- `src/lib/reports/glReports.ts`
- `src/lib/reports/summaryReports.ts`
- `src/lib/exports/actions.ts`
- `src/lib/audit.ts`
- `src/lib/evidence/*`

### Current Posting And Lock Enforcement Paths

- `src/lib/journals/actions.ts`
- `src/lib/transactions/posting.ts`
- `src/lib/bills/actions.ts`
- `src/lib/payroll/actions.ts`
- `src/lib/donations/actions.ts`
- `src/lib/giving/actions.ts`
- `src/lib/cash/actions.ts`
- `src/lib/banking/actions.ts`
- `src/lib/banking/reconciliation-workspace-actions.ts`
- `src/lib/reconciliation/actions.ts`
- `src/lib/lettings/actions.ts`
- `src/lib/giftaid/actions.ts`
- `src/lib/giftaid/post-gift-aid-reclaim-journal.ts`

## Current Period Locking

`financial_periods` supports `open`, `closed`, and `locked` statuses. App-level helpers can close, lock, reopen, and test dates against locked periods. The lock check only blocks `status = 'locked'`; a `closed` period is informational and does not prevent writes.

The app already calls `isDateInLockedPeriod()` in several write paths, including journals, manual transaction posting, donations, payroll approval, bill approval, payment run approval, cash/banking integrations, Gift Aid payment journal call sites, and lettings bank reconciliation.

There is also a database helper, `public.is_locked_financial_date`, used by several posting RPCs. Generic journal posting still relies heavily on app-level guards.

## Current Month-End Close

`month_end_reviews` is a lightweight monthly operational checklist. It stores:

- `review_month`
- `completed_step_keys`
- `completed_by`
- `completed_at`
- `notes`

This is not enough for year-end close because it does not support per-step assignment, due dates, evidence, documents, blockers, waivers, or completion metadata.

## Current Annual Accounts And Report Generation

The annual accounts builder already composes annual accounts, SOFA, balance sheet, notes, evidence index, validation, approval, and export foundations. Its validation includes a `year_end_close` check, but that source is currently a placeholder rather than a persisted year-end close run.

The professional reporting engine already has:

- `report_versions`
- `report_exports`
- `report_approval_events`
- `report_review_comments`
- draft/review/approved/exported/archived lifecycle support.

## Gaps

- No persisted `year_end_close_runs`.
- No persisted `year_end_close_steps`.
- No `filing_packs` table.
- No filing/workflow `report_approvals` summary table.
- No 23-step year-end workflow.
- No per-step assignment, due dates, evidence/documents, blockers, waivers, notes, completion user, or completion date.
- No Annual Return Assistant.
- No final submitted filing state.
- No dedicated examiner/audit checklist workflow.
- Annual accounts do not yet use a real year-end close completion source.
- Period locks exist, but enforcement is split between app code and selected RPCs.
- No dedicated admin override flow with reason and audit log for locked-year corrections.
- Filing pack exports are foundations, not a complete year-end submission pack.

## Implementation Sequence

1. Add year-end close database tables with workspace-scoped RLS.
2. Add year-end close types and the default 23-step catalog.
3. Add server actions for run creation, step updates, validation, approvals, locking, filing pack generation, and submission marking.
4. Add validation/blocker service using existing reporting, bank reconciliation, annual accounts, Gift Aid, payroll, registers, and audit sources.
5. Strengthen period lock helpers and document reversal/adjustment behaviour.
6. Add filing pack composer.
7. Add Annual Return Assistant.
8. Add guided UI routes under `/year-end-close`.
9. Add navigation entry points.
10. Add tests, implementation docs, and verification.
