# Transactions feature — implementation summary

## What was built

Added a manual Transactions workflow that records user-described income, expense, transfer, and adjustment activity before it becomes final accounting. The feature is designed so manual transactions are explanatory internal records until they either match bank proof or, for adjustments, are approved for direct posting.

New route:

- `src/app/(app)/transactions/page.tsx` — list, summary cards, tabs, filters, and actions.
- `src/app/(app)/transactions/new/page.tsx` — guided transaction form.
- `src/app/(app)/transactions/[id]/page.tsx` — overview, lines, attachments, bank match, journal, and audit sections.

Navigation:

- `src/components/app-sidebar.tsx` adds Transactions in the Banking group.

## Schema changes

Migration: `supabase/migrations/00075_transactions_feature.sql`.

New tables use **`organisation_id`**. Product `workspace_id` maps to `organisation_id` in this codebase.

| Table | Purpose |
|-------|---------|
| `manual_transactions` | Transaction header and lifecycle status. |
| `manual_transaction_lines` | Split fund/account/income-stream coding lines. |
| `transaction_attachments` | Receipt/document metadata for files stored in `financial-evidence`. |
| `transaction_matches` | Manual transaction to `bank_lines` matching candidates/confirmations. |

Safeguards:

- RLS enabled on every new table.
- Read policies use `is_org_member(organisation_id)`.
- Write policies use `is_org_treasurer_or_admin(organisation_id)`.
- Partial unique indexes prevent more than one confirmed transaction match per bank line or manual transaction.
- Partial unique index on journals prevents duplicate `source_type = 'manual_transaction'` journals per source transaction.

RLS smoke doc: `docs/sql/transactions_rls_smoke.sql`.

## Transaction lifecycle

Implemented lifecycle helpers in `src/lib/transactions/lifecycle.ts`.

MVP flow:

- `draft -> submitted -> approved -> awaiting_bank_match -> matched -> posted`
- adjustments or transactions that do not require bank matching can move from approval to posting without a bank line.
- posted and voided transactions are terminal.

Actions derive tenant context server-side via `getActiveOrg()` and never trust a client-supplied org/workspace id.

## Duplicate prevention model

Manual duplicate scoring lives in `src/lib/transactions/duplicates.ts` and compares:

- amount
- same or nearby date
- payee/payer
- reference
- description words
- type

Exact/strong candidates return warning data from `createManualTransaction`; users must provide an override reason to continue when warnings are present.

## Reconciliation integration

`src/app/(app)/reconciliation/reconciliation-client.tsx` now asks for both:

- existing posted journal suggestions from `src/lib/reconciliation/actions.ts`
- manual transaction suggestions from `src/lib/transactions/actions.ts`

Confirmed manual matches write to `transaction_matches` and update the manual transaction to `matched`.

Double-counting safeguards:

- `confirmTransactionMatch` refuses already allocated/reconciled bank lines.
- `allocateBankLine` refuses bank lines with confirmed transaction matches.
- `createMatch` in reconciliation refuses already allocated/reconciled bank lines.

## Posting rules

Posting is centralized in `src/lib/transactions/posting.ts`.

When posted:

- A single journal is created with `source_type = 'manual_transaction'`.
- `source_id` is the manual transaction id.
- `manual_transactions.posted_journal_id` is set.
- Report caches are invalidated.

Ledger rules:

- Income: debit linked bank GL account, credit income split lines.
- Expense: debit expense split lines, credit linked bank GL account.
- Transfer/adjustment: line direction `in` creates debit, `out` creates credit; lines must balance.

Reports remain ledger-driven: draft/submitted manual transactions do not affect Income & Expenditure, Balance Sheet, Fund Movements, Account Activity, Budget vs Actual, or Trustee reporting until a posted journal exists.

## Attachments

Receipts/documents use the existing private evidence model:

- Bucket: `financial-evidence`
- Metadata table: `transaction_attachments`
- Server actions: upload/remove/list via transaction detail.
- File SHA-256 hash is stored for future duplicate checks.

## Future hooks

The structure leaves clear extension points for:

- AI categorisation against account/fund patterns.
- OCR receipt reading using attachment hashes/paths.
- Mobile receipt capture.
- Recurring transactions.
- Approval thresholds and policy checks.
- Bank feed auto-matching.
- Reimbursement workflows.
- Trustee review queue.
