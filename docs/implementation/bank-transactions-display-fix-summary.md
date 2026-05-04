# Bank Transactions Display Fix Summary

## Root Cause

Imported bank transactions had enough parsed data in preview, but the stored/display flow did not preserve or surface all of it. Time was parsed but only kept in raw JSON, row number was not persisted, mapping mistakes were not warned about, and the UI displayed movement and balance too closely together.

That made a bad mapping such as `description = time column` look like a valid import and produced rows where `16:00` appeared as the main transaction text.

## Corrected Mapping Rules

For headerless statement rows like:

- `Column A = 31Jul2025`
- `Column B = 18:59`
- `Column C = Service Charge`
- `Column D = -6.00`
- `Column E = 13807.70`

The intended mapping is:

- Date = `Column A`
- Time = `Column B`
- Description = `Column C`
- Signed Amount = `Column D`
- Running Balance = `Column E`
- Reference = not mapped

Signed amount behaviour:

- Negative values are money out.
- Positive values are money in.
- `amount` is always the movement.
- `running_balance` remains the post-transaction balance.

## Validation Warnings

Import preview now warns when:

- The selected description value looks like a time column.
- The selected amount column is the same as, or appears to equal, the running balance column.

Warnings do not block import by themselves, but they mark rows as needing review before the user imports or reprocesses.

## Storage Changes

`bank_lines` now has:

- `transaction_time`
- `row_number`

The `bank_transactions` view now exposes:

- `transaction_time`
- `row_number`
- `raw_row`

The import action persists transaction time, row number, amount, money in/out, running balance, raw row, and mapping metadata separately.

## Display Rules

Transaction rows now prioritise user-identifying information:

- Description is the primary text.
- Reference is the fallback.
- If both are missing, the row shows `Imported bank transaction`.
- Missing descriptions show a warning badge.
- Amount is labelled as `Money in` or `Money out`.
- Balance is labelled separately as `Balance`.
- Time appears beside the date, not as the main description.
- Suggested match has an explicit column/empty state.

## Reprocess Import Behaviour

Reprocessing is available through the import workflow when reviewing an already uploaded statement.

It is allowed only if every row from that statement import is still safe to replace:

- not allocated
- not reconciled
- not posted
- not excluded
- not matched
- no confirmed reconciliation match

When safe, reprocessing removes the current imported rows for that statement import, reparses the stored original file using the corrected mapping, recreates the bank transactions, and logs audit events.

## Remaining Improvements

- Add a dedicated statement import detail page for reprocessing rather than relying on the import workflow.
- Store richer mapping metadata outside raw JSON if auditors need structured reporting.
- Populate suggested match labels directly into the transaction list by precomputing the top match per row.
- Add a full transaction detail drawer with imported details, suggestions, categorisation, raw row, and audit history.

