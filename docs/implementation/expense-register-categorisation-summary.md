# Expense Register Categorisation Summary

## New Category Structure

The Expense Register now follows a church-friendly taxonomy:

- Staff & Payroll Costs
- Premises & Building Costs
- Office, Admin & Software
- Ministry, Worship & Church Activities
- Mission, Giving & External Support
- Finance, Bank Charges & Loan Repayments
- Other / Needs Review

Rows are purpose-based categories, not supplier names. Examples:

- `Zoom` is a supplier; `Video Conferencing` is the category.
- `Amazon` is a supplier; `Office Supplies` is the category.
- `Castle Water` is a supplier; `Water` is the category.

## Mapping Rules

Mappings can be made by account, supplier, payroll component, fund, bank rule, or a
composite combination. More specific mappings win when multiple mappings match.

High-confidence examples:

- Salary accounts -> Salaries
- Pension accounts -> Pension Contributions
- Castle Water / Affinity Water suppliers -> Water
- Google Cloud -> Software Subscriptions
- Dropbox -> Cloud Storage
- Zoom -> Video Conferencing
- GoCardless -> Payment Processing Fees
- TV Licence -> Licences

Uncertain examples are retained for review:

- Valda
- Advantis Credit
- Viking
- CF Corporate
- Focus Group
- generic Service Charge
- loan repayments that may need interest/principal split

## Uncertain Item Handling

Uncertain mappings are marked with `needs_review = true` and surfaced in the Expense
Register review workflow. Admins and finance users can choose the correct category,
which creates or updates a mapping for future transactions and records an audit event.

## Reconciliation Integration

Bank reconciliation continues to post real accounting entries. The Expense Register
classifies those posted entries through mappings. Bank rules can be linked to register
mappings so future bank categorisation can infer the correct register category.

If a reconciled money-out transaction cannot be inferred, it appears under
Other / Needs Review or Uncategorized until reviewed.

## Budget Integration

Budget comparison remains safest at account/fund/category level because budgets are
stored by account, fund, and month. Supplier grouping is useful for actual spending and
drill-down, while budget variance is resolved through the mapped account/fund path.

## Future Improvements

- Full drag-and-drop category ordering.
- Separate `register_groups` table if group management needs permissions/history.
- PDF and Excel exports in addition to current CSV.
- Automatic bank rule update from category review decisions.
- Deeper receipt/attachment status once all expense evidence sources are normalised.
