# Bank Statement Upload Summary

## What Was Added

Manual bank statement upload is now a multi-step workflow for CSV and XLSX files:

1. Upload the original statement file to the private `financial-evidence` bucket.
2. Hash the file and block duplicate uploads for the same workspace and bank account.
3. Parse statement headers and rows server-side.
4. Auto-detect date, description, reference, amount, money-in, money-out, and balance columns.
5. Let users review or correct the column mapping.
6. Preview normalised transaction rows with validation status, duplicate counts, date range, and balances.
7. Import valid non-duplicate rows into `bank_lines`, which backs the `bank_transactions` view.
8. Record statement import history on each bank account.

## Parser Foundation

The parser lives in `src/lib/banking/statement-parser.ts` and exposes:

- `parseCsvStatement()`
- `parseXlsxStatement()`
- `detectBankColumns()`
- `normaliseBankTransactionRow()`
- `normaliseStatementRows()`
- `generateBankTransactionFingerprint()`
- `validateBankTransactionRow()`

The transaction fingerprint includes workspace, bank account, transaction date, signed amount in pence, normalised description, normalised reference, and running balance. This gives stronger duplicate detection than the legacy CSV importer while preserving the old physical `bank_lines` table.

## Workflow Actions

The workflow actions live in `src/lib/banking/import-actions.ts`:

- `uploadBankStatementFile()` stores the original file, records `bank_statement_imports`, and audits the upload.
- `parseBankStatementImport()` downloads the stored file, parses it, detects columns, validates rows, updates import metadata, and returns a preview.
- `saveBankImportMapping()` stores reusable mapping templates.
- `importParsedBankStatement()` re-parses the stored file, imports valid rows with duplicate skipping, updates import status, and runs donation candidate and Gift Aid donor matching hooks for new rows.
- `voidBankStatementImport()` marks a statement import as voided and audits the event.
- `listBankStatementImports()` powers the account Statements visibility panel.

All write actions derive the workspace from `getActiveOrg()` and validate access with the banking permission model. Client-submitted organisation IDs are not trusted.

## UI

The upload wizard is available at:

- `/banking/import` for a central account picker flow.
- `/banking/[bankAccountId]/import` for account-preselected imports.

The wizard supports:

- CSV/XLSX upload.
- Auto mapping and manual mapping correction.
- Mapping template saving.
- Validation summary.
- Preview table.
- Error report download.
- Import result summary.
- Link to `/reconciliation`.

Bank account detail pages now include a Statements panel showing uploaded files, status, row counts, duplicates, errors, and date ranges.

## Audit Events

The workflow records:

- `bank_statement_upload`
- `bank_statement_duplicate_upload_skipped`
- `bank_statement_parse`
- `bank_statement_parse_failed`
- `bank_statement_import`
- `bank_statement_import_failed`
- `bank_statement_duplicate_transactions_skipped`
- `bank_statement_voided`

## Tests

Coverage was added for:

- CSV preamble/header parsing.
- XLSX parsing.
- Auto detection of money-in/money-out columns.
- Row normalisation and validation.
- Fingerprint tenant/account/balance sensitivity.
- Workflow wiring for duplicate file detection, duplicate transaction skipping, audit events, mapping, error reports, and reconciliation links.

## Follow-On Notes

OFX, QIF, PDF, and Open Banking imports are intentionally tracked as file types but not parsed yet. Their import paths should reuse the same `bank_statement_imports` lifecycle and `bank_lines` insertion contract once parsers are added.
