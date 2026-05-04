# Reconciliation unreconcile and correction — implementation summary

## Schema

- Migration `supabase/migrations/20260502180000_reconciliation_corrections_and_donation_lifecycle.sql`:
  - Table **`reconciliation_corrections`**: append-only history (`workspace_id`, `bank_line_id`, source and journal ids, optional `reversal_journal_id`, `journal_action`, `reason`, `created_by`, …) with RLS aligned to banking (member select, treasurer/admin insert).
  - **`donations.status`** extended with `voided` and **`corrected`**, plus optional `corrected_at`, `corrected_by`, `correction_reason`, `reversal_journal_id`.

## Journal reversal reuse

- **`executePostedJournalReversal`** in `src/lib/journals/execute-posted-reversal.ts**: shared “create + post + link” reversal used by `reverseJournal` and banking.
- **`reverseJournal`** in `src/lib/journals/actions.ts` delegates to that helper after permission checks and audit/cache handling.

## Orchestration

- **`unreconcileBankTransaction`** in `src/lib/banking/unreconcile-bank-transaction.ts`:
  - Permissions: `update` on `reconciliation`, `create` on `journals`.
  - **Excluded** lines: clears exclusion flags, rejects confirmed matches, records correction (no journal).
  - **Gift Aid claim payment**: clears batch receipt fields, resets bank line, rejects matches.
      Other source types: resolves linked journal; **posted** → `executePostedJournalReversal`; **draft** → delete lines + journal (when period rules allow).
  - Source handlers: **manual_transaction** (clear posting/match, `awaiting_bank_match`), **donation** / **gift_aid_donor_donation** (status `corrected`, clear bank link, reset Gift Aid fields, store correction + optional `reversal_journal_id`), **lettings_payment** (void with reason), **journal** (reversal only).
  - **Gift Aid guard**: claim-locked `gift_aid_status` values require treasurer/admin + `giftAidUnreconcileOverride`.
  - **Legacy donation row** on bank line without `matched_source_type` still resolves via `donations.bank_transaction_id`.
  - Audits **`bank_transaction_unreconciled`**, revalidates reconciliation, donations, gift-aid, lettings, banking, journals; invalidates report cache.

## Donor-facing queries

- **`listDonations`**: default excludes `voided` / `corrected`; `includeCorrectedVoided` opt-in.
- **Giving register**: `includeCorrectedVoided` on filters; default excludes both voided and corrected.
- **Gift Aid donor detail / statements**: still **posted**-only substantive gifts.
- **Claim batch builder**: blocks `voided` / `corrected` donations.

## Registers

- **`fetchPostedLines`**: `includeReversalJournals` (default false) omits journals with `reversal_of` set; drill-down **`isReversalJournal`** badge; fallback category skips “Giving” heuristic for reversal lines.

## UI

- **Reconciliation workspace**: “Unreconcile” dialog (reason, reversal date, `UNRECONCILE` confirmation, optional **`giftAidUnreconcileOverride`**).
- **Bank account (transactions tab)** on [`banking/[bankAccountId]/page.tsx`](src/app/(app)/banking/[bankAccountId]/page.tsx): **Corrections** column with dialog listing `reconciliation_corrections` for each bank line (`getReconciliationCorrectionsForBankLines`).

## Tests

- `tests/reconciliationUnreconcile.test.ts` — static checks for migration, modules, filters, and UI wiring.
