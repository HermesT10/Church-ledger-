-- 00061_gift_aid_donor_matching.sql
-- Extend Gift Aid donor matching to support multiple attempts,
-- manual review states, and imported giving metadata.

alter table public.donors
  add column if not exists reference_code text;

create unique index if not exists uq_donors_workspace_reference_code
  on public.donors (workspace_id, lower(reference_code))
  where reference_code is not null;

alter table public.donations
  add column if not exists giving_import_row_id uuid references public.giving_import_rows(id) on delete set null;

alter table public.bank_transaction_donor_matches
  alter column bank_transaction_id drop not null;

alter table public.bank_transaction_donor_matches
  add column if not exists review_status text,
  add column if not exists match_metadata jsonb not null default '{}'::jsonb;

update public.bank_transaction_donor_matches
set review_status = case
  when donation_id is not null then 'confirmed'
  else 'suggested'
end
where review_status is null;

alter table public.bank_transaction_donor_matches
  alter column review_status set not null;

alter table public.bank_transaction_donor_matches
  drop constraint if exists bank_transaction_donor_matches_match_method_check;

alter table public.bank_transaction_donor_matches
  add constraint bank_transaction_donor_matches_match_method_check
  check (
    match_method in (
      'exact_reference_code',
      'exact_normalized_full_name',
      'exact_import_metadata',
      'fuzzy_name_reference',
      'manual'
    )
  );

alter table public.bank_transaction_donor_matches
  drop constraint if exists bank_transaction_donor_matches_review_status_check;

alter table public.bank_transaction_donor_matches
  add constraint bank_transaction_donor_matches_review_status_check
  check (
    review_status in (
      'suggested',
      'auto_confirmed',
      'confirmed',
      'rejected',
      'superseded'
    )
  );

alter table public.bank_transaction_donor_matches
  drop constraint if exists bank_transaction_donor_matches_source_required;

alter table public.bank_transaction_donor_matches
  add constraint bank_transaction_donor_matches_source_required
  check (bank_transaction_id is not null or donation_id is not null);

drop index if exists idx_bank_transaction_donor_matches_bank_txn;

create unique index if not exists uq_bank_transaction_donor_matches_bank_attempt
  on public.bank_transaction_donor_matches (bank_transaction_id, donor_id, match_method)
  where bank_transaction_id is not null;

create unique index if not exists uq_bank_transaction_donor_matches_donation_attempt
  on public.bank_transaction_donor_matches (donation_id, donor_id, match_method)
  where donation_id is not null;

create index if not exists idx_bank_transaction_donor_matches_review_status
  on public.bank_transaction_donor_matches (workspace_id, review_status, confidence_score desc);

create index if not exists idx_bank_transaction_donor_matches_bank_txn_review
  on public.bank_transaction_donor_matches (bank_transaction_id, review_status)
  where bank_transaction_id is not null;

create index if not exists idx_bank_transaction_donor_matches_donation_review
  on public.bank_transaction_donor_matches (donation_id, review_status)
  where donation_id is not null;
