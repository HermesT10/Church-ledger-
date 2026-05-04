# Bank Statement Mapping Fix Audit

## Files Found

- `src/app/(app)/banking/[bankAccountId]/import/import-form.tsx` - upload wizard, mapping UI, preview, import results.
- `src/app/(app)/banking/[bankAccountId]/import/page.tsx` - account-specific statement import page.
- `src/app/(app)/banking/import/page.tsx` - central import page with account picker.
- `src/lib/banking/statement-parser.ts` - CSV/XLSX parsing, header detection, column detection, row normalization, validation, fingerprinting.
- `src/lib/banking/import-actions.ts` - upload, parse preview, save mapping, import valid rows, duplicate detection.
- `src/lib/banking/importCsv.ts` - older CSV-only import path with a separate parser/fingerprint flow.
- `src/lib/banking/importUtils.ts` - date, money, text normalization helpers.
- `src/lib/banking/types.ts` - shared banking row and import types.
- `supabase/migrations/00089_banking_schema_foundation.sql` - `bank_statement_imports`, `bank_import_mappings`, `bank_lines` extensions, `bank_transactions` view.
- `tests/bankStatementParser.test.ts` - parser tests.
- `tests/bankStatementImportWorkflow.test.ts` - import workflow wiring tests.

## Current Data Flow

1. The user uploads a CSV/XLSX in `import-form.tsx`.
2. `uploadBankStatementFile` stores the original file privately, hashes it, checks duplicate statement uploads, and creates a `bank_statement_imports` row.
3. `parseBankStatementImport` downloads the stored file, parses it with `parseCsvStatement` or `parseXlsxStatement`, detects columns, normalizes rows, checks existing `bank_lines` fingerprints, and returns preview data.
4. The UI uses `preview.headers` to populate mapping dropdowns.
5. `importParsedBankStatement` reparses the file, normalizes rows with the chosen mapping, and upserts valid rows into `bank_lines`.

## Current Issue

The parser always chooses a row as the header row. If it cannot find a confident header row, `findHeaderRow()` falls back to row `0`. `parseCsvStatement()` and `parseXlsxStatement()` then treat that row's cell values as `headers`.

The UI then renders those strings directly as mapping dropdown options:

```tsx
{headers.map((header) => (
  <option key={header} value={header}>{header}</option>
))}
```

For headerless files, row `0` may be a transaction such as:

- `31Jul2025`
- `18:59`
- `Service Charge`
- `-6.00`
- `13807.70`

Those sample values are therefore incorrectly shown as if they were column names.

## Root Cause

The implementation conflates:

- Internal mapping keys
- Header display names
- Sample row values

A robust import flow needs stable internal column keys (`col_0`, `col_1`) regardless of whether the file has headers. Header names and sample values should only be display metadata.

## Import Tables And Transaction Tables

`bank_statement_imports` stores file-level import metadata, private file path, hash, parse status, row counts, duplicate counts, and date/balance summaries.

`bank_import_mappings` stores reusable mapping templates, currently by column string values such as `date_column`, `description_column`, `money_in_column`, `money_out_column`, `amount_column`, and `balance_column`.

`bank_lines` is the physical imported bank transaction table. The `bank_transactions` view exposes product-facing terminology over `bank_lines`. Imports should create `bank_lines` only. Reconciliation, ledger posting, donations, expenses, and other accounting records happen later.

## Validation And Duplicate Detection

Current validation checks:

- Date parsed
- Description present
- Amount parsed and non-zero
- Both money in/out are not simultaneously positive

Current duplicate detection:

- File-level duplicate by `(workspace_id, bank_account_id, file_hash)`.
- Transaction duplicate by fingerprint over workspace, bank account, date, amount, normalized description/reference, and running balance.
- Insert-time protection through `bank_lines` upsert on `(bank_account_id, fingerprint)`.

## Mapping Template Logic

The code can save a mapping template through `saveBankImportMapping`, but preview parsing does not currently load or apply saved templates. The current schema also lacks explicit `time_column` and `amount_mode` fields.

## Implementation Plan

1. Refactor `statement-parser.ts` so parsed tables expose stable column metadata and row values keyed by `col_N`.
2. Improve header detection so headerless files generate `Column A`, `Column B`, etc. instead of using first-row values as headers.
3. Add optional `time` mapping and `amountMode` (`signed` or `separate`).
4. Update preview/import actions to return column metadata, apply saved templates when compatible, validate duplicates, and import only bank transaction rows.
5. Extend `bank_import_mappings` with `time_column` and `amount_mode`.
6. Redesign the mapping UI to show detected columns, sample values, amount mode, and normalized preview rows.
7. Add parser/workflow tests and implementation documentation.
