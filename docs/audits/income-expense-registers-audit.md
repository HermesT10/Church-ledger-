# Income & Expense Registers Audit

## Existing Files Found

- `src/components/app-sidebar.tsx` defines current Income, Expenses, Banking, and Planning navigation.
- `src/app/(app)/donations`, `src/app/(app)/lettings`, `src/app/(app)/gift-aid`, `src/app/(app)/giving-platforms`, and `src/app/(app)/giving-imports` are the existing Income routes.
- `src/app/(app)/suppliers`, `src/app/(app)/bills`, `src/app/(app)/payment-runs`, `src/app/(app)/employees`, and `src/app/(app)/payroll` are the existing Expenses routes.
- `supabase/migrations/00007_journals.sql` defines `journals` and `journal_lines`, the posted general-ledger source of truth.
- `supabase/migrations/00006_accounts.sql` defines account types including `income` and `expense`.
- `supabase/migrations/00004_funds.sql` defines charity fund types: restricted, unrestricted, designated.
- `supabase/migrations/00071_funds_control_centre.sql` adds `income_streams` and `journal_lines.income_stream_id`.
- `supabase/migrations/00035_supplier_integration.sql` adds `journal_lines.supplier_id`.
- `supabase/migrations/00075_transactions_feature.sql` defines manual transactions and exactly-once posting links.
- `src/lib/transactions/posting.ts` posts manual transactions into balanced journals.
- `src/lib/reports/actuals.ts` already aggregates posted journal lines by month/account/fund.
- `src/lib/reports/actions.ts` includes budget-vs-actual, income/expenditure, and drill-down helpers.
- `src/lib/reports/dashboard.ts` powers dashboard income, expense, and action prompts.
- `src/lib/budgets/actions.ts` and `supabase/migrations/00044_budget_upgrade.sql` provide monthly account/fund budgets.
- `src/lib/org.ts` provides active organisation scoping.
- `src/lib/audit.ts` writes immutable audit events.

## Integration Points

- Registers use only posted `journals` and `journal_lines` for actual totals.
- Register rows are configured through `register_categories` and `register_category_mappings`.
- Funds filter through `journal_lines.fund_id`.
- Income streams map through `journal_lines.income_stream_id`.
- Suppliers map through `journal_lines.supplier_id`.
- Donations, Lettings, Gift Aid, Payroll, Bills, and manual transactions enrich drill-down through `journals.source_type/source_id` and linked module tables where available.
- Budget values aggregate from `budget_lines` by account/fund/month.
- Add-from-register creates real `manual_transactions`; it does not edit totals.

## Schema Gaps

Before this work there were no register row configuration tables and no `/income/register`, `/expenses/register`, or `/reports/income-expense-summary` routes.

The product wording says `workspace_id`, but this codebase consistently uses `organisation_id`; the new schema follows `organisation_id`.

## Recommended Implementation Sequence

1. Add `register_categories` and `register_category_mappings` with RLS, indexes, and default row seeds.
2. Build a shared register aggregation engine over posted GL lines.
3. Add Income and Expense register pages with spreadsheet-style monthly tables and drill-down.
4. Add a combined Income & Expense Summary report.
5. Add dashboard prompts for register cleanup.
6. Add tests for totals, signs, mapping, and schema safeguards.

## Risks And Mitigations

- Duplicate counting: mitigated by using posted GL lines as the single source for actual totals.
- Sign errors: mitigated by explicit income/expense net rules.
- Mapping ambiguity: mitigated by deterministic highest-specificity mapping selection.
- Unmapped data loss: mitigated by an Uncategorized row and dashboard cleanup prompt.
- Budget mismatch: mitigated by aggregating budget lines through the same row mapping logic.
- Cross-tenant leakage: mitigated by `organisation_id` and RLS policies.
- Manual spreadsheet drift: mitigated by preventing direct total edits; add-from-register creates proper transactions.
