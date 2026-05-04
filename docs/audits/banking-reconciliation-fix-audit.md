# Banking/Reconciliation Fix Audit

## Scope

This audit covers the current bank account to Chart of Accounts link, reconciliation transaction queues, and bank statement import deletion model. It is based on the current migrations and source files, especially:

- `supabase/migrations/00006_accounts.sql`
- `supabase/migrations/00036_gl_bank_allocation.sql`
- `supabase/migrations/00089_banking_schema_foundation.sql`
- `src/lib/banking/bankAccounts.ts`
- `src/lib/banking/actions.ts`
- `src/lib/banking/import-actions.ts`
- `src/lib/banking/reconciliation-workspace-actions.ts`
- `src/lib/reconciliation/actions.ts`
- `src/lib/transactions/posting.ts`
- `src/app/(app)/banking/[bankAccountId]/page.tsx`
- `src/app/(app)/reconciliation/reconciliation-workspace-client.tsx`

## Current Schema Findings

### Bank Accounts

`bank_accounts` was introduced in `00008_phase3_banking_foundation.sql` and extended by later banking migrations. It uses both `organisation_id` and `workspace_id`, kept aligned by triggers added in `00089_banking_schema_foundation.sql`.

The canonical ledger link field is:

- `bank_accounts.linked_account_id`

It was added in `00036_gl_bank_allocation.sql` as a nullable FK to `accounts(id)` with `ON DELETE SET NULL`.

No competing bank ledger link field is used by the codebase. Searches did not identify an active `chart_account_id`, `linked_ledger_account_id`, or `ledger_account_id` convention for `bank_accounts`.

### Chart Of Accounts

`accounts` is the Chart of Accounts table. It uses `organisation_id` as its tenant key. It originally includes:

- `code`
- `name`
- `type`
- `is_active`

Later migrations add:

- `subtype`
- `normal_balance`
- `allow_direct_posting`
- `available_in_reconciliation`
- `is_archived`
- `archived_at`

The valid broad type for a bank ledger account is `asset`. Compatible subtypes are represented as text and should include bank/cash/current/savings/clearing-style values where populated.

### Bank Statement Imports

`bank_statement_imports` stores upload/import batch metadata:

- `workspace_id`
- `bank_account_id`
- `file_name`
- `file_path`
- `file_type`
- `file_hash`
- import status and row counters
- opening/closing balance metadata
- warning metadata

Files are uploaded to `FINANCIAL_EVIDENCE_BUCKET` with a path under:

`{orgId}/bank-imports/{timestamp}-{hash}-{safeName}`

### Bank Transactions

The physical imported transaction table is `bank_lines`.

`bank_transactions` is a compatibility view over `bank_lines`.

`bank_lines.statement_import_id` links imported rows to `bank_statement_imports`. The FK uses `ON DELETE SET NULL`, so deleting an import row before child rows would orphan imported transactions from their statement batch.

Current `bank_lines.status` values are:

- `unmatched`
- `suggested_match`
- `matched`
- `reconciled`
- `excluded`
- `duplicate`
- `needs_review`

The schema does not currently define `posted`, `voided`, `imported`, or `partially_matched` as `bank_lines.status` values.

## Root Cause: Broken Chart Of Accounts Link

The link is required by posting/reconciliation code, but new bank accounts are created without it.

`src/lib/banking/bankAccounts.ts` inserts active bank accounts without setting `linked_account_id`. The UI form in `src/app/(app)/banking/bank-account-form.tsx` has no ledger account picker and no repair step.

`src/lib/banking/actions.ts` exposes `updateBankAccount` with optional `linked_account_id`, but it does not validate that the account is a same-organisation active asset account, and no current UI call site wires this as a user-facing repair flow.

## Exact Error Source

`src/lib/reconciliation/actions.ts` throws the user-facing issue in `reconcileBankLineAsDonation`:

`This bank account is not linked to a chart-of-accounts bank account.`

The function loads `bank_accounts(linked_account_id, name)` and fails when `linked_account_id` is null.

Other related errors:

- `src/lib/transactions/posting.ts`: `The selected bank account is not linked to a GL account.`
- `src/lib/reconciliation/actions.ts`: `Bank account has no linked GL account.`
- `src/lib/cash/actions.ts`: `Bank account has no linked GL account. Configure it in Banking settings.`

## Field Naming Consistency

The correct canonical field is `linked_account_id`.

Creating `chart_account_id`, `linked_ledger_account_id`, or another alias would duplicate meaning and increase migration risk. New code should use `linked_account_id` consistently.

## Reconciliation Queue Findings

The main smart reconciliation workspace is driven by `src/lib/banking/reconciliation-workspace-actions.ts`.

Its default query already excludes:

- `reconciled = true`
- `allocated = true`
- `status in ('excluded', 'duplicate')`

That means the main `/reconciliation` workspace is close to the desired default queue.

The remaining issue is inconsistency across reconciliation paths:

- `src/lib/reconciliation/actions.ts` legacy helpers derive unreconciled rows by checking match rows rather than status.
- `getClearableLines` for statement reconciliation only checks `reconciliation_id`; it does not exclude already reconciled, allocated, posted, excluded, duplicate, or matched rows unless they are explicitly filtered elsewhere.
- Some older flows set `reconciled = true` without also setting `status = 'reconciled'`, which makes status-based screens inconsistent.

## Statement Import Deletion Findings

There is no true delete action for a statement import.

Existing actions:

- `voidBankStatementImport` only sets `bank_statement_imports.status = 'voided'`.
- `reprocessBankStatementImport` safely deletes child `bank_lines` only if none are matched, reconciled, posted, allocated, excluded, or confirmed matched.

The Statements tab currently lists imports and offers upload/certificate actions, but no delete action.

Safe deletion must delete child rows before the import row because `bank_lines.statement_import_id` is `ON DELETE SET NULL`.

## Duplicate Fingerprint Logic

Duplicate prevention exists at two levels:

- File duplicate: `bank_statement_imports` unique by `(workspace_id, bank_account_id, file_hash)`.
- Row duplicate: `bank_lines` unique by `(bank_account_id, fingerprint)`.

Statement delete should not delete unrelated duplicate fingerprints. It should delete only child rows for the selected import and allow future re-upload only through the existing fingerprint rules.

## Audit Logging

Banking imports already log upload, duplicate upload, preview, mapping, import, reprocess, and void actions.

Missing logs for this fix:

- bank ledger link auto-created
- bank ledger link repaired
- bank ledger link changed
- statement import delete blocked
- statement import deleted
- statement storage file deletion failed

## Balance Model

`src/lib/banking/actions.ts` computes:

- statement/bank balance from latest remaining bank line balance, running balance, or latest import closing balance
- book balance from posted `journal_lines` against `bank_accounts.linked_account_id`

Deleting unreconciled imported rows should change the statement/import-derived balance and queue counts. It should not change ledger/book balance because unreconciled imports should not have posted journals. If no import rows remain, the UI should fall back to opening/book balance instead of stale deleted statement metadata.

## Safe Implementation Plan

1. Keep `linked_account_id` as the only canonical bank-to-ledger field.
2. Add a repair migration that links active bank accounts to valid asset accounts or creates a new asset bank account where none exists.
3. Add shared server helpers for validating, creating, repairing, and linking bank ledger accounts.
4. Update bank account creation to auto-create or reuse a valid asset ledger account.
5. Add Banking detail UI repair controls for missing/broken accounting links.
6. Add reconciliation guard and repair card instead of a dead-end error.
7. Add queue filters and counts: Needs reconciliation, Reconciled, Excluded, All.
8. Fix statement/legacy reconciliation queries to exclude finalised rows by default.
9. Add safe statement import deletion with typed confirmation, reason, child-row deletion, optional storage deletion, audit logging, and revalidation.
10. Add regression tests and implementation docs.

## Migration Risks

- Duplicate asset accounts if matching by name is too loose.
- `accounts.code` uniqueness collisions during generated ledger account creation.
- Existing `linked_account_id` values may point to inactive, archived, wrong-type, or cross-organisation accounts.
- Parent-first statement deletion would orphan `bank_lines`.
- Older reconciliation flows can leave `reconciled` and `status` out of sync.
