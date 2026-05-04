# Reconciliation correction and unreconcile — pre-change audit snapshot

This note captures behaviour **before** the unreconcile orchestration work so future changes can be traced.

## Models

- **Statement reconciliation** (`undoReconciliation` in `src/lib/reconciliation/actions.ts`) operates on `reconciliations` / `reconciliation_id`. It unlinks bank lines from a statement batch but **does not** reverse journals or update donations.
- **Workspace reconciliation** (`src/lib/banking/reconciliation-workspace-actions.ts`) matches `bank_lines` to sources (`matched_source_type` / `matched_source_id`), stores `posted_journal_id`, and writes `bank_reconciliation_matches` / `transaction_matches`.

## Journal reversal

- `reverseJournal` in `src/lib/journals/actions.ts` creates a **posted** reversal, links `reversal_of` / `reversed_by`, and audits the action. It did **not** reset `bank_lines`, donations, or match rows—leading to split state if users reversed only from the journal screen.

## Donations

- Donor-facing queries often filtered on `status = 'posted'`. The database check on `donations.status` historically allowed only `draft` and `posted`, while some client code referenced `voided`, creating inconsistency until the lifecycle migration extends allowed values.

## Income / expense register

- `fetchPostedLines` in `src/lib/registers/actions.ts` included **all** posted journals in range. Reversal journals (same accounts, opposite sign) appeared like normal income lines with no “reversal” semantics.

## Risk

- Unreconciling only on the bank side without reversing GL would desynchronise reporting; reversing only on the journal side would leave bank and donation rows incorrectly “matched.” The new `unreconcileBankTransaction` path is intended to run **journal + source + bank + matches + audit** in one coordinated flow.
