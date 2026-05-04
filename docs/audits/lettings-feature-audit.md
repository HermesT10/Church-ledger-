# Lettings / Hall Hire Feature Audit

## Existing Files Found

- `src/components/app-sidebar.tsx` defines the Income navigation group. Before this feature, Income contained Donations, Gift Aid, Giving Platforms, and Giving Imports.
- `src/lib/accounts/templates/starter.ts` already seeds `INC-004 Lettings/Hall Hire` as an income account.
- `src/lib/banking/income-stream-hints.ts` already recognises bank text such as `hall`, `lett`, `rent`, and `hall hire` as `LETTINGS`.
- `src/lib/income-streams/actions.ts` and `src/app/(app)/funds/income-streams/page.tsx` provide an existing income-stream dimension suitable for Lettings reporting.
- `src/lib/banking/reconciliation-matching.ts` contains the bank matching engine.
- `src/lib/banking/reconciliation-workspace-actions.ts` confirms bank matches, prevents duplicate matches, marks bank lines reconciled, and posts matched activity to the ledger.
- `src/lib/transactions/posting.ts` shows the existing double-entry posting pattern.
- `src/lib/reports/actions.ts` and `src/lib/reports/dashboard.ts` derive reports and dashboard totals from posted `journals` and `journal_lines`.
- `src/lib/evidence/config.ts` defines the shared `financial-evidence` storage bucket used by transaction attachments.
- `src/lib/audit.ts` provides the immutable audit-log helper.

## Integration Points

- Navigation: add Lettings under Income.
- Operational data: add Lettings hirers, monthly charges, payments, and documents.
- Accounting: post Lettings payments only when a bank receipt is reconciled.
- Banking: suggest Lettings matches from imported money-in bank lines.
- Reports: add a Lettings Income Report using operational Lettings tables.
- Dashboard: surface overdue and unpaid Lettings as action items.
- Audit: record hirer creation, charge creation, and payment reconciliation.

## Schema Gaps

The repo had no Lettings-specific tables. The app uses `organisation_id` for tenancy even when product specs say `workspace_id`, so the Lettings schema must follow `organisation_id`.

Money is stored in integer pence across the accounting system. Lettings therefore uses:

- `expected_amount_pence`
- `paid_amount_pence`
- `outstanding_amount_pence`
- `amount_pence`

## Implementation Sequence

1. Add Lettings schema with RLS, indexes, updated-at triggers, and duplicate-posting guards.
2. Add Lettings types, status helpers, server actions, yearly register aggregation, and a dedicated bank reconciliation posting routine.
3. Add `/lettings` with summary cards, year selector, spreadsheet-style monthly register, Add Hirer, and Add Monthly Charge forms.
4. Add Lettings bank matching suggestions and confirmed match handling.
5. Add Lettings report and dashboard action items.
6. Add focused tests and implementation documentation.

## Risks And Mitigations

- Duplicate income: mitigated by unique payment-per-bank-line and unique payment-per-posted-journal indexes, plus confirmed bank match checks.
- Tenant leakage: mitigated by `organisation_id`, RLS policies using `is_org_member` / `is_org_treasurer_or_admin`, and server actions deriving tenant context from `getActiveOrg()`.
- Money precision bugs: mitigated by using pence integers rather than `numeric`.
- Status drift: mitigated by calculating payment totals from `lettings_payments` via trigger and preserving only explicit admin states such as waived/cancelled.
- Report double-counting: mitigated by keeping operational expected charges separate from posted GL journals. Core accounting reports continue to use posted journals only.
