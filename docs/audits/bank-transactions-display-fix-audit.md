# Bank Transactions Display Fix Audit

## Root Cause

The bank statement import flow now parses stable column keys and can identify date, time, description, amount, and balance columns. However, the downstream storage and display flow still loses or underuses important transaction context:

- `transaction_time` is parsed in `statement-parser.ts`, but it is only stored inside `raw.__transaction_time`; there is no first-class `bank_lines.transaction_time` column.
- `row_number` exists in preview rows but is not persisted, making raw-row traceability weak after import.
- The `bank_transactions` compatibility view does not expose `transaction_time`, `row_number`, or `raw_row`.
- Import preview does not warn when the selected description column contains time-like values, or when the selected amount column behaves like a running balance.
- The banking transactions table shows description, amount, and balance, but not time or suggested match context.
- The reconciliation workspace stacks transaction amount and balance without labels, which makes the balance look like a duplicated amount.
- Reprocessing a statement import with corrected mapping is not implemented.

The most likely source of the bad UI example is a wrong mapping where `description` was mapped to the time column and the signed amount/balance columns were confused. The code currently has no warning system to catch those mapping mistakes before import.

## Files Affected

- `src/lib/banking/statement-parser.ts`
- `src/lib/banking/import-actions.ts`
- `src/lib/banking/types.ts`
- `src/lib/banking/actions.ts`
- `src/app/(app)/banking/[bankAccountId]/import/import-form.tsx`
- `src/app/(app)/banking/[bankAccountId]/page.tsx`
- `src/app/(app)/reconciliation/reconciliation-workspace-client.tsx`
- `src/lib/banking/reconciliation-workspace-actions.ts`
- `src/lib/banking/reconciliation-matching.ts`
- `supabase/migrations/00089_banking_schema_foundation.sql`
- `supabase/migrations/00091_bank_import_mapping_amount_mode.sql`

## Current Parser And Mapping Flow

`statement-parser.ts` parses CSV/XLSX files into stable column keys such as `col_0`, `col_1`, and `col_2`. It also builds column metadata with display names, sample values, detected type, and confidence.

For a headerless statement row:

- `col_0` = `31Jul2025`
- `col_1` = `18:59`
- `col_2` = `Service Charge`
- `col_3` = `-6.00`
- `col_4` = `13807.70`

The intended mapping is:

- Date = `col_0`
- Time = `col_1`
- Description = `col_2`
- Signed Amount = `col_3`
- Running Balance = `col_4`
- Reference = not mapped

This model is correct, but warnings are still needed when a user or saved template maps a time column as description or maps a balance column as amount.

## Current Import Flow

`import-actions.ts` stores rows in `bank_lines` with:

- `txn_date`
- `transaction_date`
- `description`
- `reference`
- `amount`
- `amount_pence`
- `direction`
- `money_in`
- `money_out`
- `running_balance`
- `balance_pence`
- `fingerprint`
- `raw`
- `status`

Gaps:

- `transaction_time` is not persisted.
- `row_number` is not persisted.
- Mapping metadata is not stored in a structured way with the raw row.
- Reprocess import is not available.

## Current Schema

`00008_phase3_banking_foundation.sql` created the original `bank_lines` table with `txn_date`, `description`, `reference`, `amount_pence`, `balance_pence`, `raw`, and `fingerprint`.

`00089_banking_schema_foundation.sql` extended `bank_lines` with product-facing fields including `transaction_date`, `amount`, `direction`, `money_in`, `money_out`, `running_balance`, `status`, `matched_source_type`, and `matched_source_id`. It also created the `bank_transactions` view.

Schema gaps against the required model:

- Missing `transaction_time`.
- Missing `row_number`.
- Missing `raw_row` name in the `bank_transactions` view. The physical table uses `raw`; the view should expose `raw as raw_row`.

## Current Transaction List UI

`src/app/(app)/banking/[bankAccountId]/page.tsx` renders the account Transactions tab as a table. It shows date, description, reference, money in, money out, balance, status, and matched record, but it does not show:

- transaction time
- signed amount/direction as labelled movement
- suggested match confidence/reason
- missing-description warning
- a richer row layout that helps users identify transactions quickly

## Current Reconciliation Workspace

`src/app/(app)/reconciliation/reconciliation-workspace-client.tsx` renders imported bank lines in a split workspace. The left transaction list shows:

- date
- description or “No description”
- reference/status
- signed amount
- balance beneath amount

Because the balance is not labelled, it can look like a duplicated amount. The workspace data type also omits `transaction_time`, `money_in`, `money_out`, `running_balance`, and `raw`.

## Implementation Plan

1. Add a safe migration to extend `bank_lines` with nullable `transaction_time` and `row_number`, and update the `bank_transactions` view to expose `transaction_time`, `row_number`, and `raw as raw_row`.
2. Update banking TypeScript types and data loaders to include time, row number, raw row, money in/out, running balance, and suggested match display fields.
3. Add parser/import validation warnings:
   - Description column looks like a time column.
   - Amount column looks like running balance.
4. Persist `transaction_time`, `row_number`, and raw mapping metadata during import.
5. Improve import preview to show warnings clearly.
6. Redesign account transaction rows/table so description is primary, amount is labelled as money in/out, and balance is separate.
7. Improve reconciliation workspace rows and selected transaction panel with labelled movement, balance, time, fallback description, and suggested match empty state.
8. Add a guarded reprocess action:
   - Allow only when all rows from the import are unmatched/unallocated/unreconciled/unposted.
   - Delete current imported rows for that import.
   - Reparse the original file with corrected mapping.
   - Recreate imported bank lines.
   - Write audit log.
9. Add focused tests for storage, warnings, display source, and reprocess guard behaviour.

