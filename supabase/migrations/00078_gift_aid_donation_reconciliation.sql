-- 00078_gift_aid_donation_reconciliation.sql
-- Wire reconciled bank donations into the production Gift Aid lifecycle.

alter table public.donations
  add column if not exists gift_aid_claim_batch_id uuid
    references public.gift_aid_claim_batches(id) on delete set null,
  add column if not exists gift_aid_estimated_claim_pence bigint
    check (gift_aid_estimated_claim_pence is null or gift_aid_estimated_claim_pence >= 0);

create index if not exists idx_donations_gift_aid_claim_batch_id
  on public.donations (gift_aid_claim_batch_id)
  where gift_aid_claim_batch_id is not null;

create index if not exists idx_donations_bank_gift_aid_status
  on public.donations (organisation_id, bank_transaction_id, gift_aid_status)
  where bank_transaction_id is not null;

create or replace function public.sync_donation_gift_aid_fields()
returns trigger
language plpgsql
as $$
begin
  if new.gift_aid_status is null then
    if new.gift_aid_claim_id is not null or new.gift_aid_claim_batch_id is not null then
      new.gift_aid_status := 'included_in_draft_claim'::public.gift_aid_donation_status;
    elsif coalesce(new.gift_aid_eligible, false) then
      new.gift_aid_status := 'eligible'::public.gift_aid_donation_status;
    elsif new.gift_aid_ineligible_reason is not null then
      new.gift_aid_status := 'invalid_donor_details'::public.gift_aid_donation_status;
    else
      new.gift_aid_status := 'not_assessed'::public.gift_aid_donation_status;
    end if;
  end if;

  if new.gift_aid_status in (
    'eligible',
    'included_in_claim',
    'included_in_draft_claim',
    'exported',
    'submitted',
    'paid'
  ) then
    new.gift_aid_eligible := true;
    new.gift_aid_ineligible_reason := null;
  elsif new.gift_aid_status in (
    'missing_declaration',
    'invalid_donor_details',
    'already_claimed',
    'rejected',
    'not_assessed',
    'unmatched',
    'needs_review',
    'matched_no_declaration',
    'ineligible'
  ) then
    new.gift_aid_eligible := false;
  end if;

  if new.gift_aid_status in (
    'included_in_claim',
    'included_in_draft_claim',
    'exported',
    'submitted',
    'paid'
  ) then
    if new.included_in_claim_at is null then
      new.included_in_claim_at := coalesce(new.gift_aid_claimed_at, now());
    end if;
  elsif new.gift_aid_status not in (
    'included_in_claim',
    'included_in_draft_claim',
    'exported',
    'submitted',
    'paid'
  ) then
    new.included_in_claim_at := null;
  end if;

  if new.gift_aid_status in ('submitted', 'paid') then
    if new.submitted_to_hmrc_at is null then
      new.submitted_to_hmrc_at := now();
    end if;
  elsif new.gift_aid_status <> 'submitted' then
    new.submitted_to_hmrc_at := null;
  end if;

  return new;
end;
$$;

update public.donations
   set gift_aid_status = 'not_assessed'::public.gift_aid_donation_status
 where gift_aid_status in ('unmatched', 'needs_review', 'ineligible');

update public.donations
   set gift_aid_status = 'missing_declaration'::public.gift_aid_donation_status
 where gift_aid_status = 'matched_no_declaration';

update public.donations
   set gift_aid_status = 'included_in_draft_claim'::public.gift_aid_donation_status,
       gift_aid_claim_batch_id = coalesce(gift_aid_claim_batch_id, gift_aid_claim_id)
 where gift_aid_status = 'included_in_claim'
   and gift_aid_claim_id is not null
   and exists (
     select 1
     from public.gift_aid_claim_batches gacb
     where gacb.id = donations.gift_aid_claim_id
       and gacb.status = 'draft'
   );

update public.donations d
   set gift_aid_claim_batch_id = coalesce(d.gift_aid_claim_batch_id, gacl.claim_batch_id)
  from public.gift_aid_claim_lines gacl
 where gacl.donation_id = d.id
   and d.gift_aid_claim_batch_id is null;
