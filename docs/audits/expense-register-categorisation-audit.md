# Expense Register Categorisation Audit

## Scope

This audit covers the current Expense Register, category/mapping data model, suppliers,
chart of accounts, reconciliation, transactions, reports, budgets, dashboard metrics,
workspace scoping, and audit logging patterns.

## Existing Files Found

- `src/app/(app)/expenses/register/page.tsx` renders the Expense Register by passing
  `registerType="expense"` to the shared register page.
- `src/components/registers/register-page.tsx` renders both Income and Expense
  Registers, including year/fund/mode controls, monthly table, inline drill-down,
  add-from-register form, and a disabled Configure Rows card.
- `src/lib/registers/actions.ts` calculates register data from posted
  `journals` and `journal_lines`, resolves mappings, loads budgets, serves drill-down
  data, and creates manual transactions from the register.
- `src/lib/registers/defaults.ts` contains runtime fallback register rows.
- `src/lib/registers/types.ts` defines register rows, cells, mappings, and drill-down
  payloads.
- `src/app/api/registers/export/route.ts` exports CSV register data.
- `supabase/migrations/20260429104502_income_expense_registers.sql` creates
  `register_categories` and `register_category_mappings`.
- `src/lib/banking/reconciliation-workspace-actions.ts`,
  `src/lib/banking/bank-rules-actions.ts`, and `src/lib/banking/bank-rules-engine.ts`
  handle reconciliation and rule-based categorisation.
- `src/lib/reports/dashboard.ts` builds account-based dashboard expense summaries and
  register mapping todo items.
- `src/app/(app)/reports/income-expense-summary/page.tsx` consumes `getRegisterData`
  for the combined summary report.

## Current Data Model

The register is a calculated view, not an editable spreadsheet. Totals come from
posted `journals` and `journal_lines`. The register engine filters journal lines to
accounts whose `accounts.type` matches the register type, then resolves a category
using `register_category_mappings` and fallback heuristics.

`register_categories` currently stores:

- `organisation_id`
- `register_type`
- `name`
- `group_name`
- `display_order`
- `status`
- basic created/updated metadata

`register_category_mappings` currently stores:

- `organisation_id`
- `register_category_id`
- optional `account_id`, `income_stream_id`, `supplier_id`, `donor_id`,
  `lettings_hirer_id`, `payroll_component`, `fund_id`
- `mapping_type`
- `created_at`

The existing schema already supports the supplier/account distinction, but the seeded
expense rows do not use it cleanly.

## Current Category Issues

- Expense defaults mix suppliers and expense purposes: `Valda`, `CF Corporate`,
  `Veolia`, `Amazon`, `Castle Water`, `Google Cloud`, `Metro Loan`, and similar
  supplier/payee names are presented as rows.
- The UI says rows are powered by `register_categories` and mappings, but category
  management is not implemented.
- There is no review metadata on mappings, so uncertain supplier/category matches
  cannot be tracked as a workflow.
- The dashboard only detects unmapped accounts through account mappings; supplier-only
  mappings do not clear the warning.
- Budget comparison rolls up by account/fund only. Supplier-specific category mapping
  can make actuals and budgets diverge unless account/fund mappings are used as the
  primary budget path.
- Drill-down exists, but it is an inline card rather than the requested drawer-like
  review surface.
- `unreconciledCount` exists in register cell types but is not populated.

## Current RLS And Scoping

Register tables use `organisation_id`, consistent with most core finance tables.
RLS allows members to read and treasurer/admin roles to mutate. Some newer banking
tables use `workspace_id`, but reconciliation actions still bridge to
`organisation_id` for user-facing access.

## Audit Logging Pattern

The standard pattern is `logAuditEvent` from `src/lib/audit.ts`, using the admin
client. Register manual transaction creation already logs `register_add_income` or
`register_add_expense`. Category and mapping edits need equivalent audit events.

## Implementation Plan

1. Add category/mapping metadata without replacing existing tables:
   `default_account_id`, `default_fund_id`, `notes`, `bank_rule_id`,
   `mapping_confidence`, `needs_review`, `reviewed_at`, and `reviewed_by`.
2. Insert the new church-friendly expense taxonomy:
   Staff & Payroll Costs, Premises & Building Costs, Office, Admin & Software,
   Ministry, Worship & Church Activities, Mission, Giving & External Support,
   Finance, Bank Charges & Loan Repayments, and Other / Needs Review.
3. Migrate old default mappings onto new categories where confidence is high.
   Route uncertain suppliers to `Needs Review` or a best-fit category with
   `needs_review = true`.
4. Keep register totals calculated from posted journals. Do not persist monthly totals.
5. Extend the register engine to support grouping by category, supplier, account, or
   fund while keeping category as the default.
6. Add a review action that creates or updates mappings and logs an audit event.
7. Improve the Expense Register UI with summary cards, grouping controls, review
   workflow, and richer drill-down.
8. Keep budget comparison safest for category/account/fund views. Supplier views can
   show actuals and drill-down while budget variance remains account/fund driven.

## Migration Risks

- Renaming or archiving existing rows can hide old supplier-named categories. Mitigation:
  archive only known default manual-ledger rows and migrate their mappings first.
- Supplier mappings can override account mappings. Mitigation: keep specificity-based
  matching and mark ambiguous supplier mappings as `needs_review`.
- Loan payments may include liability principal and expense interest. Mitigation:
  route loan suppliers to review-aware finance categories and surface a loan split
  insight.
- Budget comparisons can be misleading when actuals are supplier-mapped but budgets
  are account-mapped. Mitigation: prefer account/fund mappings for budget roll-up and
  document that supplier grouping is primarily actuals/drill-down.
