# Income & Expense Registers Summary

## Feature Overview

The Income Register and Expense Register recreate the church's spreadsheet-style monthly tracking while keeping the general ledger as the source of truth.

Added routes:

- `/income/register`
- `/expenses/register`
- `/reports/income-expense-summary`

## Schema Changes

Migration `20260429104502_income_expense_registers.sql` adds:

- `register_categories`
- `register_category_mappings`

Both tables use `organisation_id`, RLS policies, and indexes for register type, ordering, and mapping lookups.

## Data Source Rules

Actual values come from:

- `journals.status = 'posted'`
- `journal_lines`
- income accounts use `credit_pence - debit_pence`
- expense accounts use `debit_pence - credit_pence`

Drafts, voided operational records, unreconciled bank imports, and duplicate imports are not counted as actuals unless they have produced a posted journal.

## Register Mapping Logic

Rows are configured by `register_categories`. A row can map to:

- account
- income stream
- supplier
- donor
- lettings hirer
- payroll component
- fund
- composite combinations

If no mapping matches a posted line, the line appears in `Uncategorized`.

## Reconciliation Integration

When banking/reconciliation posts a journal, the register updates automatically because the register reads posted journal lines.

Examples:

- Giving receipt posts to a Giving income account or stream → Income Register Giving row.
- Lettings payment posts to Lettings/Hall Hire → Income Register Lettings row.
- Supplier payment posts with `supplier_id` or expense account → Expense Register supplier/category row.
- Payroll run posts payroll expense lines → Expense Register Payroll group.

## Reporting Integration

The Income & Expense Summary report combines both registers into monthly income, monthly expenses, and net surplus/deficit.

Budget values are pulled from `budget_lines` and aggregated through the same row mapping logic.

CSV export is available through `/api/registers/export` for the selected register, year, comparison year, and fund filter.

## Dashboard Integration

Dashboard to-dos now surface income/expense accounts that need register mapping so finance users can clean up Uncategorized activity.

## Future Improvements

- Full row management UI.
- Excel and PDF export actions using the existing register export data contract.
- AI anomaly explanations.
- Recurring expense prediction.
- Income forecasting.
- Trustee commentary notes.
- Department/ministry register views.
- Automatic row mapping suggestions.
