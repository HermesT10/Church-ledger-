# Bank Statement Mapping Fix Summary

## Problem Fixed

The previous statement parser used a detected header row as both display labels and mapping keys. When a file had no headers, the first transaction row could be treated as headers, causing values such as `31Jul2025`, `18:59`, `Service Charge`, and `-6.00` to appear as mapping dropdown options.

The import flow now separates stable internal keys from user-facing labels:

- Rows are always keyed as `col_0`, `col_1`, `col_2`, etc.
- Header text is stored only as `displayName`.
- Headerless files use generated labels such as `Column A`, `Column B`, and `Column C`.
- Sample values are shown only as helper previews.

## New Detect, Confirm, Preview, Import Flow

1. Upload stores the original CSV/XLSX privately and checks duplicate file hashes.
2. Parsing detects whether the file has headers. If not, it generates column labels.
3. The parser returns column metadata with `columnKey`, `displayName`, `sampleValues`, `detectedType`, and `confidence`.
4. Auto detection proposes date, time, description, reference, amount, money in/out, and balance mappings using stable column keys.
5. The wizard shows a detected columns table and lets the user confirm or correct the mapping.
6. Preview normalizes rows and marks them as `valid`, `warning`, or `error`.
7. Import inserts only valid non-duplicate rows into `bank_lines`. It does not post to the ledger, create donations, create expenses, or reconcile transactions.

## Amount Mode Rules

Signed amount mode:

- Requires date, description, and one signed amount column.
- Positive values become money in.
- Negative values become money out.

Separate money in/out mode:

- Requires date, description, money in, and money out mappings.
- At least one of money in or money out must be populated per row.
- Rows with both populated are invalid.

## Supported Formats

Dates:

- `31Jul2025`
- `31 Jul 2025`
- `31/07/2025`
- `2025-07-31`

Times:

- `18:59`
- `09:30:12`

Amounts:

- `-6.00`
- `100.00`
- `£1,250.50`
- `(6.00)`

## Duplicate Behaviour

- Duplicate statement files are blocked by file hash for the same workspace and bank account.
- Duplicate transaction rows are detected by fingerprint.
- Existing duplicate transactions are shown as warnings and skipped during import.
- Duplicate rows inside the same file are marked as errors so only one copy can be imported.

## Schema Update

`bank_import_mappings` now supports:

- `time_column`
- `amount_mode` with allowed values `signed` and `separate`

Saved templates store stable column keys and can be reapplied when the uploaded file has compatible columns.

## Remaining Improvements

- Add bank-specific template matching beyond bank name and file type.
- Persist a richer template schema if future imports need display labels, source bank profile metadata, or per-column date formats.
- Add a dedicated persisted transaction time column if reconciliation workflows need time-level ordering outside the raw audit payload.
