# Dashboard Financial Overview Audit

## Files Found

- `src/app/(app)/dashboard/page.tsx` is the authenticated `/dashboard` route.
- `src/app/(app)/dashboard/dashboard-client.tsx` renders the dashboard cards, chart, todo list, customizable widgets, and role guidance.
- `src/lib/reports/dashboard.ts` builds the `DashboardOverview` server payload using Supabase queries and cached report scope tags.
- `src/lib/reports/types.ts` defines `DashboardOverview`, current KPI/widget types, and dashboard todo item types.
- `src/lib/dashboard/widgetRegistry.ts` defines configurable dashboard widget ids and default visibility.
- `src/app/(app)/dashboard/widgets/*` contains optional dashboard widgets such as cash position, fund balances, Gift Aid, recent transactions, supplier spend, and payroll summary.
- `src/lib/banking/*` and `src/app/(app)/banking/*` implement bank accounts, bank line imports, matching, and reconciliation workflows.
- `src/lib/funds/actions.ts`, `src/app/(app)/funds/*`, and `supabase/migrations/00004_funds.sql` define active funds and fund detail screens.
- `src/lib/accounts/*`, `src/app/(app)/accounts/*`, and `supabase/migrations/00006_accounts.sql` define the chart of accounts.
- `src/lib/registers/actions.ts`, `src/components/registers/register-page.tsx`, `src/app/(app)/income/register/page.tsx`, and `src/app/(app)/expenses/register/page.tsx` implement income and expense register views from posted journals.
- `src/lib/reports/actions.ts`, `src/lib/reports/actuals.ts`, and `src/lib/reports/balanceSheet.ts` contain reusable reporting and actuals logic.
- `src/lib/org.ts` derives the active organisation and role.
- `src/lib/permissions.ts` centralises role/module checks.
- Existing empty/loading patterns appear in `DashboardClient`, optional widget cards, `PageHeader`, `StatCard`, and register/report pages.

## Data Sources Available

- `journals` and `journal_lines` are the authoritative posted ledger source. Existing dashboard logic filters `journals.status = 'posted'` and calculates income as `credit_pence - debit_pence` and expenses as `debit_pence - credit_pence`.
- `accounts` provides chart-of-account type classification: `income`, `expense`, `asset`, `liability`, and `equity`.
- `funds` provides active restricted, unrestricted, and designated funds.
- `bank_accounts` provides active bank/cash/loan account metadata, account type, status, opening balance, and timestamps.
- `bank_lines` provides imported bank transactions, allocation status, transaction date, optional running balance, and duplicate protection via fingerprint.
- `cash_collections` and `cash_spends` provide posted cash workflow records and missing receipt alerts.
- `register_categories` and `register_category_mappings` support income/expense register categorisation and uncategorised review.
- `gift_aid` tables and donations provide existing Gift Aid opportunity signals.
- `payroll_runs`, `payment_runs`, `bills`, and `lettings_charges` already feed dashboard todos and can remain operational alerts rather than duplicate dashboard totals.

## Schema Gaps

- There is no dedicated loan subledger. Loans should be inferred from `accounts.type = 'liability'`, liability account naming, and `bank_accounts.account_type = 'loan'` where present.
- There is no guaranteed one-to-one link between `bank_accounts` and asset accounts, so cash position should prefer imported bank running balances when available and fall back to posted ledger asset/cash account balances.
- There is no explicit “restricted savings” flag on bank accounts. The safest dashboard classification is by `bank_accounts.account_type` plus conservative name matching for restricted/reserve accounts.
- Current dashboard `cash-position` widget maps bank accounts to system asset accounts by array index, which is not reliable for a trustee-grade overview.
- Current dashboard todos are short labels only. The requested alerts need severity, message, recommended action, and link.
- Existing dashboard period selector supports `this_month`, `last_month`, and `ytd`; the new monthly year view needs a separate selected calendar year.

## Implementation Sequence

1. Extend `DashboardOverview` types with a production-grade financial overview payload.
2. Add server-side aggregation in `src/lib/reports/dashboard.ts` for selected year monthly actuals, previous-year comparison, cash position rows, restricted fund tracker, liability/loan totals, and plain-language alerts.
3. Update `src/app/(app)/dashboard/page.tsx` to parse `year` and `comparePreviousYear` search params and pass them to the loader/client.
4. Upgrade `DashboardClient` with KPI cards, a year selector, a compare toggle, responsive cards/tables, drill-down links, and empty states.
5. Preserve existing dashboard widgets and role guidance so user layouts keep working.
6. Add implementation documentation and focused tests for calculations, alerts, links, RLS text coverage, and empty-state copy.

## Risks

- Mixing bank-import balances and ledger balances can double count if combined incorrectly. The dashboard should show source labels and use a conservative total.
- Loan balances are inferred from liability accounts and loan bank accounts until a loan subledger exists.
- Restricted fund “remaining” must not be labelled as a liability. It should be presented as restricted funds and commitments.
- Dashboard queries must stay bounded and aggregate server-side to avoid loading full transaction lists.
- Only posted journals should drive income, expense, fund tracker, and liability totals. Draft/voided records should remain excluded.
- Cross-workspace leakage is controlled by filtering every query with `organisation_id` or `workspace_id` derived server-side from the active org.
