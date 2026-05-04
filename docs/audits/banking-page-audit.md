# Banking page audit

## Scope

This audit covers the current Banking, statement import, transaction, reconciliation, ledger, storage, RLS and navigation code before the banking schema foundation upgrade.

## Files found

Banking routes/components:

- `src/app/(app)/banking/page.tsx`
- `src/app/(app)/banking/[bankAccountId]/page.tsx`
- `src/app/(app)/banking/[bankAccountId]/import/page.tsx`
- `src/app/(app)/banking/[bankAccountId]/import/import-form.tsx`
- `src/app/(app)/banking/[bankAccountId]/bank-line-actions.tsx`
- `src/app/(app)/banking/bank-account-form.tsx`
- `src/app/(app)/banking/seed-bank-accounts-button.tsx`

Banking library:

- `src/lib/banking/actions.ts`
- `src/lib/banking/bankAccounts.ts`
- `src/lib/banking/importCsv.ts`
- `src/lib/banking/importUtils.ts`
- `src/lib/banking/income-stream-hints.ts`
- `src/lib/banking/smartFeatures.ts`
- `src/lib/banking/types.ts`

Reconciliation:

- `src/app/(app)/reconciliation/page.tsx`
- `src/app/(app)/reconciliation/reconciliation-client.tsx`
- `src/app/(app)/reconciliation/statement/statement-reconciliation-client.tsx`
- `src/lib/reconciliation/actions.ts`
- `src/components/finance/reconciliation-card.tsx`

Manual transactions:

- `src/app/(app)/transactions/page.tsx`
- `src/app/(app)/transactions/new/page.tsx`
- `src/app/(app)/transactions/[id]/page.tsx`
- `src/lib/transactions/actions.ts`
- `src/lib/transactions/posting.ts`
- `src/lib/transactions/matching.ts`
- `src/lib/transactions/types.ts`

Core migrations found:

- `supabase/migrations/00008_phase3_banking_foundation.sql`
- `supabase/migrations/00021_bank_reconciliation.sql`
- `supabase/migrations/00032_banking_allocations.sql`
- `supabase/migrations/00033_reconciliations.sql`
- `supabase/migrations/00036_gl_bank_allocation.sql`
- `supabase/migrations/00068_post_bank_allocation_atomic.sql`
- `supabase/migrations/00075_transactions_feature.sql`
- `supabase/migrations/00086_gift_aid_claim_payment_reconciliation.sql`

Navigation:

- `src/components/app-sidebar.tsx`

## Schema found

`bank_accounts` exists from `00008_phase3_banking_foundation.sql` with `organisation_id`, `name`, `account_number_last4`, `sort_code`, `currency`, `is_active`, and `created_at`. `00036_gl_bank_allocation.sql` adds `linked_account_id`.

`bank_statements` exists as a basic imported statement header with `statement_start`, `statement_end`, opening/closing balance pence, source and import hash.

`bank_lines` is the current physical imported bank transaction table. It stores `txn_date`, `description`, `reference`, `amount_pence`, `balance_pence`, `raw`, `fingerprint`, and later `allocated`, `reconciled`, `reconciled_at`, `reconciliation_id`. Duplicate detection is enforced by `unique (bank_account_id, fingerprint)`.

`allocations` stores one allocation per bank line with `account_id`, `fund_id`, optional `supplier_id`, and `amount_pence`.

`bank_reconciliation_matches` currently links `bank_line_id` to `journal_id` with `match_type`, `provider`, and `matched_by`. It is journal-centric rather than the newer `matched_source_type` / `matched_source_id` design.

`reconciliations` stores statement reconciliation sessions with closing balance, opening balance, cleared balance, line counts, lock state and reconciler.

`manual_transactions`, `manual_transaction_lines`, `transaction_matches`, and `transaction_attachments` exist from `00075_transactions_feature.sql`. Manual transactions can be matched to `bank_lines` and posted once to journals.

## Current flows

Manual CSV import exists in `src/lib/banking/importCsv.ts`. The client parses a preview with PapaParse and passes the file plus column mapping to a server action. The server parses the file again, creates a SHA-256 fingerprint with `makeFingerprint`, inserts into `bank_lines`, skips duplicates through `upsert(..., ignoreDuplicates: true)`, then triggers donation candidate ingestion and Gift Aid donor matching.

Bank line allocation exists in `src/lib/banking/actions.ts` via the `post_bank_allocation_atomic` RPC. It validates the selected bank line, account and fund, inserts an allocation, posts a two-sided journal when the bank account has a linked GL account, marks the line allocated, and writes `audit_log`.

Bank reconciliation exists in two surfaces:

- `/reconciliation` matches bank lines to posted journals, manual transactions, and donation quick-create flows.
- `/reconciliation/statement` clears bank lines into a reconciliation session and locks the session when calculated cleared balance equals the statement closing balance.

The ledger engine is journal-based:

- `journals` and `journal_lines` enforce double entry.
- `post_bank_allocation_atomic`, `post_bill_atomic`, `post_payroll_run_atomic`, `postManualTransactionToLedger`, and `createPostedGiftAidReclaimJournal` are existing posting paths.

Storage pattern:

- Private bucket `financial-evidence`.
- Paths begin with the organisation id.
- `src/app/api/evidence/route.ts` verifies active org and module permission before issuing a signed URL.
- `src/lib/evidence/config.ts` already maps `bank-imports` to the `banking` permission module.

Tenant/RLS pattern:

- Older tables use `organisation_id`.
- Newer Gift Aid tables sometimes use `workspace_id`.
- `00075_transactions_feature.sql` explicitly documents that product `workspace_id` maps to codebase `organisation_id`.
- RLS generally uses `public.is_org_member(...)` for reads and `public.is_org_treasurer_or_admin(...)` for writes.

Sidebar:

- `src/components/app-sidebar.tsx` has a Banking group containing `Banking`, `Transactions`, `Cash`, and `Reconciliation`.

## Gaps

- No production `bank_statement_imports` table existed for file-level upload/import state.
- No reusable `bank_import_mappings` table existed.
- No `bank_rules` table existed.
- The product term `bank_transactions` was represented by the physical `bank_lines` table.
- `bank_accounts` lacked account type, bank name, masked number, opening balance/date, `status`, `archived_at`, `created_by`, and `updated_at`.
- Some code used `status = 'active'` while older schema used `is_active`.
- CSV import accepted `orgId` in `FormData`; it needed server-derived tenant validation.
- Uploaded bank statement files were not persisted before import.
- Reconciliation matches were journal-specific and not generalized.
- Open Banking/API feed architecture was not present and should remain future-only for now.

## Risks

- Renaming `bank_lines` to `bank_transactions` would break donations, Gift Aid, cash deposits, manual transactions, reconciliation, reports and allocation code.
- Introducing physical `workspace_id` without compatibility triggers would risk tenant drift from `organisation_id`.
- Bank rules with `auto_apply` can create accounting errors if they post/reconcile before auditability and rollback flows are mature.
- File hash uniqueness must be scoped by workspace/account, otherwise duplicate uploads can either leak across tenants or block legitimate same-file usage in another workspace.
- Existing `bank_reconciliation_matches` unique constraints and `journal_id` dependency need careful migration before fully generalized source matching.

## Implementation sequence

1. Add a compatibility migration: expand `bank_accounts`, add `bank_statement_imports`, `bank_import_mappings`, `bank_rules`, and add `workspace_id` compatibility to existing banking tables.
2. Keep `bank_lines` as the physical table and expose `bank_transactions` as a compatibility view, avoiding a disruptive rename.
3. Update manual import to store the original uploaded file, create statement import metadata, use server-derived `orgId`, and update import status/counters.
4. Extend bank account creation/UI with account type, bank name, masked number and opening balance metadata.
5. Add RLS smoke verification and migration tests for workspace scoping.
6. Leave Open Banking feeds for a future integration boundary; the current foundation is manual-upload-first.
