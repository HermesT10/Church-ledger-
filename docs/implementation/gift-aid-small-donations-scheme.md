# Gift Aid Small Donations Scheme (GASDS)

## Scope

Church Ledger models **cash and contactless small-donation batches** separately from named-donor Gift Aid. Batches can be linked to a **bank deposit line** and **evidence**, included in **Gift Aid claim batches** as `claim_item_type = gasds`, and exported on a **second worksheet** (`GASDS — small donations`) in the schedule workbook. The standard HMRC donor schedule sheet still lists only **standard_gift_aid** lines (with declarations).

## Database

Migration: `supabase/migrations/00085_gift_aid_gasds.sql`.

- **`organisation_settings`**: `gasds_require_bank_deposit_evidence`, `gasds_annual_cap_pence` (default £8,000 eligible/year in pence).
- **`gift_aid_small_donation_batches`**: workspace batches with amounts in pence, `collection_method` (`cash`|`contactless`), optional bank/evidence linkage, statuses `draft` → `ready` → `included_in_claim` → `claimed` (when the parent claim batch is submitted through the legacy submit flow), plus `rejected` / `voided`.
- **`gift_aid_claim_lines`**: nullable `donation_id`/`donor_id`; `claim_item_type` (`standard_gift_aid`|`gasds`); partial unique index on `gasds_batch_id` when set; integrity check enforcing either standard donations or GASDS rows.

## Application behaviour

- **Validation**: Schedule export runs declaration checks only on **standard** rows. **GASDS** rows contribute to totals and render on the dedicated worksheet; HMRC donor columns use placeholder snapshots in the database for consistency with NOT NULL fields.
- **Annual cap**: When building a claim, we sum eligible GASDS already tied to batches in `exported|submitted|paid` status with anchor date (`submitted_at` or `claim_end`) within the UK tax year (6 April boundary, consistent with elsewhere in Gift Aid UI). Going over the configurable cap emits a warning in batch `validation_summary`, not a hard block.
- **Evidence**: If `gasds_require_bank_deposit_evidence` is true, a batch cannot be marked into a claim without `linked_bank_transaction_id` **or** `evidence_storage_path`.
- **Claim builder**: Treasurer can multi-select **ready** batches (no outstanding `gift_aid_claim_batch_id`).
- **Remove line**: Removing a GASDS claim line resets the small-donation batch to `ready` and clears `gift_aid_claim_batch_id`; totals on the claim batch are recalculated.
- **Submitted claims**: When `markClaimSubmitted` fires for a batch ID, linked `gift_aid_small_donation_batches` rows move to status `claimed`.

## UI entry points

- **Gift Aid control centre**: tab **Small donations** — cap headline, batches table, link to record a batch.
- **Record batch**: `/gift-aid/small-donations/new`.
- **Claim builder**: checklist of ready GASDS batches passed into `createGiftAidClaimBatchFromBuilder({ gasdsBatchIds })`.

## Tests

- `tests/giftAidScheduleExport.test.ts` — GASDS workbook tab and validation exclusions.
- `tests/giftAidControlCentre.test.ts` — passes `gasds` summary into control centre builder.

Apply the migration locally with Supabase CLI (`supabase db push` or equivalent) before using features in a live database.
