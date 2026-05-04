# Banking Reconciliation Core Summary

## New Import Flow

The bank statement flow is now designed around:

Upload -> Confirm detected format -> Preview -> Import transactions -> Reconcile

Upload creates bank transaction rows only. It does not create income, expenses, donations, Gift Aid records, invoices, or ledger postings.

## Field Naming Changes

- `Signed amount` is no longer used in the user interface.
- The user-facing label is `Transaction Amount`.
- `Running Balance` remains separate and means the bank account balance after the transaction.
- `Reference` is described as a payment ID, invoice number, donor reference, standing order reference, cheque number, card reference, or bank reference.

## Mapping Rules

The parser detects:

- Date columns including `31Jul2025`, `31 Jul 2025`, `31/07/2025`, and `2025-07-31`.
- Time columns such as `18:59` and `09:30:12`.
- Primary description and optional additional description/detail columns.
- Transaction amount columns that contain money movement values.
- Running balance columns that behave like post-transaction account balances.
- Empty columns as unknown.

For statement formats with a primary narrative column and a detail column, the import builds `display_description` from both fields.

## Duplicate Detection

Duplicate prevention remains two-layered:

- File hash duplicate detection on `bank_statement_imports`.
- Row fingerprint duplicate detection on `bank_lines`.

The row fingerprint includes workspace, bank account, transaction date, transaction amount, normalised description/reference, and running balance when available.

Duplicate rows are skipped, not imported again.

## Storage

Imported bank lines now support:

- transaction date
- transaction time
- description
- additional description
- display description
- reference
- signed transaction amount
- money in
- money out
- direction
- running balance
- raw row JSON
- row number
- fingerprint
- status
- matched source
- posted journal
- reconciled metadata

The physical table remains `bank_lines`; `bank_transactions` remains a compatibility view.

## Reconciliation Process

The reconciliation workspace is the controlled place where a bank movement receives accounting meaning.

Supported actions include:

- matching to an existing manual transaction or posted journal
- matching to donation, Gift Aid, lettings, payroll, or other source records
- creating income/expense transactions
- splitting a transaction
- excluding a transaction
- applying bank rules as suggestions

Reconciliation blocks a transaction if it is already posted, matched, reconciled, allocated, excluded, or has a confirmed match.

## Posting Rules

Ledger posting happens once through reconciliation-controlled flows.

- Income debits bank and credits income.
- Expense debits expense and credits bank.
- Donations debit bank and credit giving income.
- Lettings payments link to lettings records and post the payment journal.
- Gift Aid HMRC receipts link claim batches and mark payment reconciliation.
- Excluded rows do not post to the ledger.

The legacy allocation action now blocks imported statement lines so imported bank transactions cannot bypass reconciliation.

## Downstream Updates

After reconciliation or posting, report caches are invalidated and downstream data is refreshed through existing ledger/report queries:

- Funds
- Accounts
- Income and expense registers
- Donations and Gift Aid
- Lettings
- Payroll/payment matching
- Dashboard
- Reports
- Annual accounts and year-end readiness checks

Final reports should rely on posted/reconciled activity, not raw uploaded rows alone.

## Remaining Future Improvements

- Add controlled unreconcile/reversal workflow for confirmed matches.
- Add OFX/QIF parser support.
- Add PDF statement extraction only after CSV/XLSX reliability is stable.
- Add bank feed/Open Banking import path that writes the same normalised transaction model.
- Add richer balance continuity checks across every imported statement row.
