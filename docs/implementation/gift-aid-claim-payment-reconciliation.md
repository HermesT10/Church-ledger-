# Gift Aid claim payment reconciliation

## Data model (`00086`)

- `gift_aid_claim_batches`: `expected_payment_*`, `payment_bank_account_id`, `received_payment_total_pence`, `received_bank_transaction_id`, `gift_aid_payment_status`, `payment_reconciled_at`, `payment_journal_id`.
- `gift_aid_claim_payment_allocations`: `(workspace_id, claim_batch_id, bank_line_id)`, `allocated_amount_pence`, `journal_id`; unique `(claim_batch_id, bank_line_id)`. One HMRC credit may split across batches (same `bank_line_id` rows for different batches; sum of allocations across the workspace must fit the bank line).

## Behaviour

- **Posting**: Uses `post-gift-aid-reclaim-journal.ts` (`createPostedGiftAidReclaimJournal`), shared with legacy `recordGiftAidPayment`.
- **Server actions**: `confirmGiftAidClaimBatchPayment`, `suggestGiftAidBankReceiptMatchesForBatch`, `syncGiftAidBatchExpectedPaymentDefaults`, `markGiftAidClaimBatchPaymentReconciled`, `listGiftAidPaymentReconciliationCandidates` in `actions.ts`.
- **UI**: Gift Aid workspace → **Bank payment** (`/gift-aid/reconciliation`), and the claim detail batch payment card when a matching `gift_aid_claim_batches` row exists.

Apply migration with `supabase db push` (use `--include-all` if histories diverge).
