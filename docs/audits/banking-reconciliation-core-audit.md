# Banking Reconciliation Core Audit

## Current Files Found

### Upload And Import UI

- `src/app/(app)/banking/[bankAccountId]/import/page.tsx`
- `src/app/(app)/banking/import/page.tsx`
- `src/app/(app)/banking/[bankAccountId]/import/import-form.tsx`
- `src/lib/banking/import-actions.ts`

### Parsing And Mapping

- `src/lib/banking/statement-parser.ts`
- `src/lib/banking/importUtils.ts`
- `src/lib/banking/importCsv.ts` is a legacy CSV helper. Current import UI uses `statement-parser.ts` through `import-actions.ts`.

### Banking Schema

- `supabase/migrations/00008_phase3_banking_foundation.sql`
- `supabase/migrations/00089_banking_schema_foundation.sql`
- `supabase/migrations/00092_bank_transaction_display_fields.sql`
- `supabase/migrations/00093_banking_downstream_integration.sql`

### Display, Reconciliation, Matching, And Posting

- `src/app/(app)/banking/page.tsx`
- `src/app/(app)/banking/banking-hub-client.tsx`
- `src/app/(app)/banking/[bankAccountId]/page.tsx`
- `src/app/(app)/banking/[bankAccountId]/bank-line-actions.tsx`
- `src/app/(app)/reconciliation/reconciliation-workspace-client.tsx`
- `src/lib/banking/reconciliation-workspace-actions.ts`
- `src/lib/banking/reconciliation-matching.ts`
- `src/lib/reconciliation/matching.ts`
- `src/lib/banking/actions.ts`
- `src/lib/transactions/posting.ts`

### Downstream Integration

- `src/lib/reports/dashboard.ts`
- `src/lib/reports/summaryReports.ts`
- `src/lib/reports/engine/validation.ts`
- `src/lib/registers/actions.ts`
- `src/lib/annual-accounts/data.ts`
- `src/lib/year-end-close/filing-pack.ts`
- `src/lib/charity-accounts-assistant/logic.ts`

## Current Data Flow

The current upload flow is:

1. User uploads CSV/XLSX in `ImportForm`.
2. `uploadBankStatementFile` stores the file in private evidence storage and creates a `bank_statement_imports` row.
3. `parseBankStatementImport` downloads the stored file, parses it, detects columns, normalises rows, previews duplicates and validation errors, and updates import status.
4. `importParsedBankStatement` inserts valid non-duplicate rows into `bank_lines`.
5. Reconciliation and allocation happen later through either the reconciliation workspace or the older allocation flow.

The upload stage currently does not directly create income, expense, donation, Gift Aid, invoice, or journal records. That product principle is already broadly correct.

## Current Schema Shape

`bank_statement_imports` stores file metadata, file hash, parsing status, row counters, date range, opening/closing balance, parse errors, and statement warnings.

`bank_lines` is the physical bank transaction table. It stores transaction date, optional transaction time, description, reference, signed amount, money in/out, running balance, raw row JSON, row number, fingerprint, status, matched source, posted journal, reconciliation metadata, and allocation flags.

`bank_transactions` is a compatibility view over `bank_lines`, not a physical table.

## Current Strengths

- File duplicate detection exists through `(workspace_id, bank_account_id, file_hash)`.
- Row duplicate detection exists through fingerprints and `bank_account_id,fingerprint` uniqueness from the original banking foundation.
- Fingerprints include workspace, bank account, date, amount, normalised description/reference, and running balance.
- Raw row JSON and original row number are stored.
- Import reprocessing is blocked once any row is matched, allocated, reconciled, posted, or excluded.
- Reconciliation workspace blocks open transactions that are already allocated, reconciled, or excluded.
- Confirmed reconciliation matches have uniqueness indexes in `00093_banking_downstream_integration.sql`.
- Report cache invalidation is already called after reconciliation actions.
- RLS exists for bank imports, mappings, rules, and banking tables using workspace/organisation membership functions.

## Root Problems

### Mapping Problems

- The user-facing UI still says `Signed amount`; this should be `Transaction Amount`.
- `detectTypeForColumn` marks any mostly monetary headerless numeric column as `signed_amount`, which can incorrectly classify a running balance as the transaction amount.
- Running balance detection is mostly header-dependent and does not compare balance-like behaviour against transaction-sized movement behaviour.
- Only one description column is supported. Bank files with primary narrative plus additional detail cannot combine both into a useful display description.
- Empty columns are shown in the technical mapping table by default and are not visually de-emphasised.
- The UI immediately shows technical parser details instead of a simple detected statement summary.

### Display Problems

- Imported rows only have `description`; there is no separate `additional_description` or `display_description`.
- The compatibility view does not expose a display description.
- Some banking screens use `description` directly and need to prefer a combined display value.
- Preview still labels the signed amount as `Signed amount`.

### Reconciliation Problems

- Reconciliation workspace is the right strategic path, but there is still a parallel `allocateBankLine` path in `src/lib/banking/actions.ts`.
- That allocation path posts through `post_bank_allocation_atomic` and can bypass the richer reconciliation match model.
- State is spread across `allocated`, `reconciled`, `status`, `matched_source_type`, `matched_source_id`, `posted_journal_id`, `bank_reconciliation_matches`, and `transaction_matches`.
- Exactly-once posting needs a single enforced state machine.

### Posting Risks

- `confirmBankTransactionMatch` checks existing matches and open line status, but it should also explicitly block if `posted_journal_id` already exists.
- `allocateBankLine` already blocks allocated/reconciled/confirmed transaction matches, but it remains a separate ledger posting entry point.
- Excluded rows correctly avoid ledger posting, but exclusion should require a reason and remain auditable.

### Duplicate Risks

- Duplicate file and row detection exist, but the preview UX does not make duplicate counts and skipped rows prominent enough for non-accountants.
- Duplicate warnings should be part of the clean preview summary, not buried in technical details.

### Downstream Risks

- Final reports and annual accounts depend on posted journals and bank reconciliation summaries.
- If a bank line is allocated outside the reconciliation workspace, reports may update but the canonical reconciliation trail can be weaker.
- Dashboard/report cache invalidation exists, but it should be consistently called after every reconciliation/post/exclude path.

## Phased Implementation Plan

1. Improve parser and mapping detection so date, time, description, additional description, transaction amount, running balance, and unknown columns are classified correctly.
2. Add `additional_description` and `display_description` to `bank_lines` and update `bank_transactions`.
3. Replace the default mapping UI with a clean detected statement summary and move the technical mapping table behind advanced controls.
4. Update preview and import storage to preserve additional details, display descriptions, raw rows, duplicate counts, and clear validation warnings.
5. Make reconciliation workspace the controlled source of accounting meaning and posting.
6. Guard legacy allocation so imported bank lines cannot bypass the reconciliation workspace.
7. Improve display across banking and reconciliation screens.
8. Add focused tests for detection, duplicate prevention, display, posting once, exclusion, downstream integration, and RLS/workspace scoping.
