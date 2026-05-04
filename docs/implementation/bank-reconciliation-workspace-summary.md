# Bank Reconciliation Workspace Summary

## Purpose

The reconciliation workspace lets finance users work through imported bank transactions and either match them to existing records or create the missing accounting record from the bank line. The goal is to keep bank transactions, source records, and ledger postings linked without double matching or double posting.

## Matching Engine

The matching service lives in `src/lib/banking/reconciliation-matching.ts`.

It exposes `suggestMatchesForBankTransaction(bankTransactionId)` and returns:

- `source_type`
- `source_id`
- `confidence_score`
- `confidence_label`
- `match_reason`

Implemented adapters:

- Posted journals
- Manual transactions
- Existing donations/giving records
- Gift Aid claim payment/HMRC receipt candidates
- Bank rules

The source type union also includes hooks for invoice payments, supplier payments, payroll payments, cash deposits, fund transfers, adjustments, and Gift Aid donor donation flow records. These are intentionally kept as stable source identifiers so unfinished modules can add candidates without changing the UI/action contract.

Scoring uses exact amount, date proximity, reference match, text similarity, expected bank account, transaction direction/type, bank rules, and Gift Aid/HMRC-specific scoring where available.

## Workspace UI

The split-screen UI is implemented in:

- `src/app/(app)/reconciliation/page.tsx`
- `src/app/(app)/reconciliation/reconciliation-workspace-client.tsx`

Left panel:

- Imported bank transactions needing matching
- Date, description/reference, money in/out, balance, status
- Bank account selector

Right panel:

- Selected bank transaction details
- Suggested matches with confidence
- Confirm Match
- Create & Reconcile
- Split
- Exclude
- Skip
- Add Rule link

## Reconciliation Actions

Server actions live in `src/lib/banking/reconciliation-workspace-actions.ts`.

Key actions:

- `getReconciliationWorkspaceData`
- `getSuggestionsForBankTransaction`
- `confirmBankTransactionMatch`
- `createAndReconcileBankTransaction`
- `splitBankTransaction`
- `excludeBankTransaction`
- `skipBankTransaction`

Confirming a match writes `bank_reconciliation_matches`, marks the bank line reconciled, sets matched source metadata, updates source records where implemented, invalidates report cache, and writes audit logs.

Create & Reconcile uses the existing manual transaction posting path for income, expense, transfer, and adjustment records. This reuses `postManualTransactionToLedger`, so ledger posting remains idempotent and reports/funds/accounts update through existing posted journal logic.

Donation creation delegates to the existing `reconcileBankLineAsDonation` flow so Gift Aid assessment hooks are preserved.

Split transactions create a multi-line manual transaction and validate that split totals equal the absolute bank amount before posting.

Excluded lines are marked `status = 'excluded'`, store the exclusion metadata on the bank line raw payload, create a reconciliation match with source type `excluded`, and do not post to the ledger.

## Double Match Protection

The action layer checks:

- The bank transaction is not already allocated, reconciled, excluded, or matched.
- A confirmed `bank_reconciliation_matches` row does not already exist.
- A confirmed `transaction_matches` row does not already exist.
- One-to-one source records are not already used in a confirmed match.
- Manual transactions are not already matched or posted.

Existing database constraints also help protect:

- `bank_reconciliation_matches` unique bank line
- `transaction_matches` unique confirmed bank line/manual transaction
- `manual_transactions.posted_journal_id` uniqueness
- `journals` unique manual transaction source

## Tests

Focused tests are in `tests/bankReconciliationWorkspace.test.ts`.

They cover:

- Suggested match scoring
- Bank rule match generation
- Split total validation
- Confirm-match safeguards
- Ledger-once posting path presence
- Create, split, exclude, Gift Aid donation, and HMRC hooks
- Split-screen workspace UI actions
