# Lettings / Hall Hire Feature Summary

## Feature Overview

The Lettings module tracks hall hire income by hirer and month. It preserves the familiar spreadsheet model where hirers are rows and months are columns, while connecting paid receipts to bank reconciliation and the general ledger.

The main page is available at `/lettings` and sits under the Income section.

## Schema Changes

Migration `00095_lettings_feature.sql` adds:

- `lettings_hirers`
- `lettings_charges`
- `lettings_payments`
- `lettings_documents`

All tables use `organisation_id`, have RLS enabled, and follow existing app membership policies.

Money is stored in pence. Lettings payments are guarded by:

- unique active `bank_transaction_id`
- unique `posted_journal_id`
- reconciliation checks against existing bank matches

## Reconciliation Flow

The bank matching engine now suggests `lettings_charge` candidates for money-in bank lines using:

- hirer name and room/description text
- amount equal to outstanding or expected amount
- transaction month near the charge month
- due date proximity

When a user confirms a Lettings match:

1. A `lettings_payment` is created.
2. A posted journal is created once with `source_type = 'lettings_payment'`.
3. The bank line is marked reconciled and linked to the Lettings payment.
4. Charge totals/status are refreshed from payments.
5. Audit log and report cache invalidation run.

## Accounting Posting Rules

For a reconciled Lettings receipt:

- Debit: linked bank asset account.
- Credit: Lettings income account, preferably `INC-004 Lettings/Hall Hire`.
- Fund: charge override, hirer default, or first active unrestricted fund.
- Income stream: `LETTINGS` when present.

Expected monthly charges do not affect the ledger. Only reconciled payments create posted accounting activity.

## Reports Affected

Added:

- `/reports/lettings`
- Reports landing card for Lettings Income

Updated:

- Dashboard to-do items now flag overdue Lettings and outstanding Lettings amounts.

Core GL reports continue to derive totals from posted journals, so expected/unpaid Lettings are not counted as income until payment reconciliation.

## Future Improvements

- CSV/XLSX import for the historical spreadsheet.
- Hirer detail drawer with documents, bank matches, and audit history.
- Room booking calendar.
- Recurring hire agreements.
- Automated invoice generation.
- Email reminders for unpaid lettings.
- Online payment links.
- Deposit and insurance/safeguarding document tracking.
