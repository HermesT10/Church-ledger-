# Register Category Mapping Summary

## What Register Categories Mean

Register categories are the visible rows in the Income Register and Expense Register. They are presentation/reporting groupings for register review, not the underlying accounting classification.

Examples:

- Income: Giving, Gift Aid, Lettings, Cafe, Events
- Expense: Utilities, Cleaning, Office Supplies, Bank Charges, Payroll

## Accounts, Funds, And Register Categories

- **Account**: Chart of Accounts classification used for accounting and reports.
- **Fund**: The pot or purpose of money.
- **Register Category**: The visible row/group in the Income or Expense Register.

Mapping a transaction to a register category does not change the original account or fund. The account and fund remain the source of truth for accounting reports unless a separate account update is explicitly performed.

## Uncategorized

Uncategorized means the transaction has been recorded, but the register does not yet know which row to place it under.

The Review Uncategorized panel now explains that these transactions already have accounts and can be mapped once so future similar transactions are placed under the same register category.

## Mapping Rules

Register mappings are stored in `register_category_mappings`.

The mapping model now supports:

- `register_type` for income vs expense scoping.
- `description_pattern` for repeated descriptions such as service charges.
- `priority` for future rule ordering.
- `created_from_transaction_id` for audit/provenance.
- `created_by` and `updated_at`.

The save action validates the selected register category, account, supplier, and fund against the active workspace before inserting or updating the mapping.

## Auto Suggestions

The register review table now shows simple suggestions based on transaction signals:

- Bank charge or service charge wording suggests Bank Charges.
- HMRC or Gift Aid wording suggests Gift Aid.
- Giving, donation, offering, and tithe wording suggests Giving.
- Lettings, hall hire, or rent wording suggests Lettings.
- Known expense suppliers and descriptions suggest rows such as Water, Utilities, Office Supplies, Software Subscriptions, Video Conferencing, Cleaning, and Insurance.

Users can click **Use suggestion** or select a different register category manually.

## Pages Updated

- `src/components/registers/register-page.tsx`
- `src/lib/registers/actions.ts`
- `src/lib/registers/types.ts`
- `supabase/migrations/20260503215000_register_category_mapping_improvements.sql`

The shared register page is used by:

- `src/app/(app)/income/register/page.tsx`
- `src/app/(app)/expenses/register/page.tsx`

The register-category grouping also feeds the income/expense report, CSV export, and portal register views through `getRegisterData`.
