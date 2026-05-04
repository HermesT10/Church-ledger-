# Register Category Mapping Audit

## Scope

This audit covers the current Income Register and Expense Register categorisation flow, with particular focus on why transactions appear under "Other / Needs Review" or "Uncategorized", how mappings are saved, and where the UI currently uses ambiguous category wording.

## Current Register Pages And Components

- `src/app/(app)/income/register/page.tsx` renders the shared register page with `registerType="income"`.
- `src/app/(app)/expenses/register/page.tsx` renders the shared register page with `registerType="expense"`.
- `src/components/registers/register-page.tsx` contains the shared register UI, filter controls, register table, drill-down table, manual transaction form, category configuration card, and current "Review Uncategorized" workflow.
- The current review UI is embedded directly in `RegisterPage`; there is no separate reusable review component or category dropdown component.
- The current review UI is expense-only, even though the calculation engine supports income and expense register categories.

## Current Data Model

The register category model already exists.

### `register_categories`

Defined in `supabase/migrations/20260429104502_income_expense_registers.sql` and extended by `supabase/migrations/20260429133100_expense_register_categorisation.sql`.

Current fields include:

- `id`
- `organisation_id`
- `register_type`
- `name`
- `group_name`
- `display_order`
- `status`
- `default_account_id`
- `default_fund_id`
- `notes`
- `created_by`
- `created_at`
- `updated_at`

Later onboarding work also added archive-oriented fields such as `is_archived`, `archived_at`, and `archived_by`, but the register queries currently use `status = 'active'`.

### `register_category_mappings`

Defined in `supabase/migrations/20260429104502_income_expense_registers.sql` and extended by `supabase/migrations/20260429133100_expense_register_categorisation.sql`.

Current fields include:

- `id`
- `organisation_id`
- `register_category_id`
- `account_id`
- `income_stream_id`
- `supplier_id`
- `donor_id`
- `lettings_hirer_id`
- `payroll_component`
- `fund_id`
- `bank_rule_id`
- `mapping_type`
- `mapping_confidence`
- `needs_review`
- `reviewed_at`
- `reviewed_by`
- `notes`
- `created_at`

Current gaps for the requested workflow:

- No `register_type` field on mappings.
- No `description_pattern` field for matching repeated descriptions like "Service Charge".
- No `priority` field.
- No `created_from_transaction_id` field.
- No `created_by` or `updated_at` fields.

The existing unique index deduplicates by category plus mapped dimensions using `coalesce(...)`, but it includes `register_category_id`. That means two mappings with the same account/supplier/dimensions can point at different categories unless application code chooses one first.

## Where "Category" Is Used

Important UI usages:

- `src/components/registers/register-page.tsx` uses "Track monthly spending by category..." in the Expense Register subtitle.
- The expense action button says "Configure Categories".
- The register table group selector includes `Category`.
- The review dropdown says "Choose category".
- The review table columns say `Current` and `Move to`.
- The save button says `Save`.
- The category configuration panel says "Categories are purpose-based rows."
- The new-row placeholder says "New category row".

Important code usages:

- `RegisterGroupBy` includes `'category'` in `src/lib/registers/types.ts`.
- `categoryId` is the row key used for register-category drill-downs.
- `getRegisterData` and `getRegisterDrillDown` use register categories to group posted journal lines into visible rows.
- `categorisation_suggestions` and `bank_transaction_mappings` use `category_id` to refer to `register_categories`, but this is separate from the register mapping table.

## Account Vs Register Category

In the current codebase:

- An **Account** is the Chart of Accounts classification in `accounts`. It controls accounting and accounting reports. It has fields such as `code`, `name`, `type`, and `reporting_category`.
- A **Fund** is the pot or purpose of money in `funds`. Reports and filters use `fund_id` from journal lines.
- A **Register Category** is a visible row/group in the Income Register or Expense Register, configured in `register_categories`.

This distinction is technically present, but not clear enough in the UI. In particular, "Choose category" suggests changing the accounting category/account, while the action actually saves a mapping into a visible register row.

## Why Transactions Become Uncategorized

Registers are calculated from posted `journals` and `journal_lines` in `src/lib/registers/actions.ts`.

The flow is:

1. `fetchPostedLines` loads posted journals in the selected year and their journal lines.
2. It keeps only journal lines whose account type matches the register type.
3. `loadRegisterCategories` loads active register rows for the current organisation and register type.
4. `loadMappings` loads `register_category_mappings` for the organisation.
5. `chooseCategoryId` finds the most specific mapping that matches the enriched journal line.
6. If no mapping matches, `fallbackCategoryId` tries account/source heuristics.
7. If no row can be found, the virtual id `uncategorized` is used.

A transaction can appear under Uncategorized when:

- There is no mapping for its account, supplier, income stream, fund, donor, hirer, payroll component, or bank rule.
- The matching register category is archived or missing.
- Fallback heuristics do not find a configured row name.
- The line is mapped to a review-style category such as "Needs Review".
- For supplier fallback, the current code normalises `line.supplier_id` rather than supplier name, so category-name matching by supplier does not work there.

## How Mappings Are Saved Today

The current save action is `reviewExpenseRegisterMappingAction` in `src/lib/registers/actions.ts`.

Current behaviour:

- Expense-only.
- Permission checked with `assertRegisterWrite`, which currently enforces expense register edit permission.
- Reads hidden form fields for account, supplier, fund, and bank rule context.
- Inserts or updates `register_category_mappings`.
- Sets `mapping_confidence = 'high'`, `needs_review = false`, `reviewed_at`, and `reviewed_by`.
- Revalidates `/expenses/register`.
- Invalidates the organisation report cache.
- Redirects back to the Expense Register.

Current gaps:

- No Income Register mapping UI.
- No description-pattern matching.
- No selected-category validation by register type in the action.
- No generic revalidation for `/income/register`.
- The success copy is implicit via redirect; there is no success message.
- The action saves register-row mapping only; it does not and should not change the original account or fund by default.

## Bank Reconciliation And Supplier Mapping Logic

Bank categorisation suggestions use separate tables:

- `categorisation_suggestions`
- `bank_transaction_mappings`

The code is in `src/lib/banking/categorisation-suggestions.ts`.

It can infer category text from bank-line description/reference and remember a `category_id`, but that category id also points to `register_categories`. This is a bank-import suggestion flow, not the same as register row mapping persistence.

Supplier match rules are separate again:

- `supplier_match_rules`
- `src/lib/suppliers/actions.ts`

Supplier matching can suggest or create suppliers, while register mapping decides where posted journal lines appear in the register.

## Income Register Queries

The Income Register calls `getRegisterData({ registerType: 'income' })`.

The engine:

- Selects income accounts from `accounts`.
- Uses income journal-line net amount as `credit_pence - debit_pence`.
- Uses income register categories and mappings where present.
- Has fallback heuristics for Lettings, Gift Aid, Giving, Offering, Grants/Funding, Events, Cafe, and Other.

The Income Register does not currently render the Review Uncategorized mapping UI.

## Expense Register Queries

The Expense Register calls `getRegisterData({ registerType: 'expense' })`.

The engine:

- Selects expense accounts from `accounts`.
- Uses expense journal-line net amount as `debit_pence - credit_pence`.
- Uses expense register categories and mappings where present.
- Has fallback heuristics for payroll, insurance, service charges/bank charges, software, supplier/category name, and Other.

The Expense Register currently renders Review Uncategorized and can save mappings.

## Reports Affected

Direct consumers of register-category grouping:

- `src/app/(app)/reports/income-expense-summary/page.tsx`
- `src/app/api/registers/export/route.ts`
- `src/lib/portal/registers.ts`

These use `getRegisterData`, so register mapping changes affect register row names, top income/expense category lists, CSV exports, and portal register views.

Core statutory/accounting reports generally use `accounts`, `funds`, `journals`, and `journal_lines` directly. Register category mapping should therefore not change accounting history or fund reporting unless the user explicitly chooses to update the transaction account in a separate advanced flow.

## RLS And Workspace Scoping

This codebase generally uses `organisation_id` for accounting tenant scoping. Product wording may say `workspace_id`, but in this codebase that maps to `organisation_id` for register/accounting tables.

Current RLS:

- `register_categories`: members can select; treasurer/admin can insert/update/delete.
- `register_category_mappings`: members can select; treasurer/admin can insert/update/delete.

Application-layer permission currently allows `admin`, `treasurer`, and `finance_user`, then checks portal edit permission. This may be stricter at RLS level if a non-treasurer finance user uses a normal Supabase client. Server actions should either align with RLS or use an admin client after explicit server permission checks.

Server-side validation needed:

- Derive active `organisation_id` from session context.
- Validate selected register category belongs to that organisation and register type.
- Validate account/supplier/fund/source ids belong to the same organisation.
- Prevent cross-organisation mappings.
- Prevent non-permitted users from saving mappings.

## Implementation Plan

1. Replace ambiguous register UI wording:
   - "Choose category" -> "Choose register category"
   - "Current" -> "Current category"
   - "Move to" -> "Move to register category"
   - "Save" -> "Save mapping"
2. Add a clear Uncategorized info box when review items exist:
   - "Uncategorized means the transaction has been recorded, but the register does not yet know which row to place it under."
   - Example: "Service Charge may belong under Bank Charges."
3. Make the review workflow available for both Income and Expense Registers.
4. Generalise `reviewExpenseRegisterMappingAction` into a register-type-aware action.
5. Add schema support for description-pattern mappings and mapping priority.
6. Update mapping matching so description patterns can classify future similar transactions.
7. Add simple suggestions based on account name, description text, supplier mapping, and existing mappings.
8. Keep register category mapping separate from Chart of Accounts account changes.
9. Add a later advanced checkbox for "Also update the transaction account" only after default linked account validation and permission handling are designed.
10. Expand category management beyond create-only to rename, reorder, archive, and default linked account.
11. Add tests for wording, income/expense mapping support, suggestion logic, future transaction matching, report updates, and cross-workspace security.
