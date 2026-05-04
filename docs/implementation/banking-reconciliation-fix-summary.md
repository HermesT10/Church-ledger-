# Banking/Reconciliation Fix Summary

## Root Cause

Bank accounts already had a Chart of Accounts link field, `bank_accounts.linked_account_id`, but new account creation did not populate it. Reconciliation and posting later required that link, so users hit dead-end errors when trying to reconcile or post bank activity.

## Canonical Link Field

The canonical field remains `linked_account_id`. No duplicate `chart_account_id`, `ledger_account_id`, or `linked_ledger_account_id` field was added.

Valid links must point to a same-organisation active, non-archived `accounts` row with `type = 'asset'` and a bank/cash-compatible subtype where one is present.

## Backfill And Repair

`20260502162000_repair_bank_account_ledger_links.sql` repairs active bank accounts by:

- clearing invalid links
- linking to an existing matching active asset account when possible
- creating a new asset/bank ledger account otherwise
- documenting `linked_account_id` as the canonical accounting link

Server helpers in `src/lib/banking/ledger-link.ts` now validate, create, repair, and link ledger accounts consistently.

## Creation And UI Repair

`createBankAccount` now creates a linked ledger account before inserting an active bank account. The bank account detail page shows an Accounting Link card with linked, missing, or broken-link states and repair actions.

## Reconciliation Guard

Reconciliation/posting paths validate the selected bank account ledger link server-side before posting. Missing or invalid links return structured errors:

- `BANK_ACCOUNT_LEDGER_LINK_MISSING`
- `BANK_ACCOUNT_LEDGER_LINK_INVALID`

The reconciliation workspace shows a repair card instead of leaving the user at the old dead-end error.

## Queue Filtering

The reconciliation workspace now supports filters:

- Needs reconciliation
- Reconciled
- Excluded
- All

Needs reconciliation is the default and excludes reconciled, posted, allocated, excluded, and duplicate rows. The legacy statement reconciliation helper was tightened so finalised rows do not reappear through that path.

## Statement Deletion

`deleteBankStatementImport` safely deletes an import only when none of its imported rows are reconciled, posted, allocated, excluded, or confirmed matched.

When deletion is allowed, it removes:

- categorisation suggestions for the imported rows
- child `bank_lines`
- the `bank_statement_imports` row
- the uploaded file from storage when requested

If deletion would break accounting records, it is blocked and audited.

## Balance Rules

Statement balance remains import-derived from remaining bank lines/imports. Book balance remains ledger-derived from posted journal lines against `linked_account_id`.

Deleting unreconciled imports refreshes statement balances and queue counts but does not change ledger/book balance.

## Permissions

The implementation uses existing permission boundaries:

- banking create/update/delete for bank account and import management
- accounts create for auto-repairing ledger accounts
- reconciliation create/update for matching and excluding

All workspace/organisation scope is derived server-side.

## Tests

`tests/bankingReconciliationFix.test.ts` covers:

- canonical `linked_account_id` usage
- repair migration
- shared link helper
- bank account creation auto-link
- reconciliation repair card and queue filters
- statement deletion safety checks, confirmation UI, audit logging, storage removal, and revalidation
