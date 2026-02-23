-- 00018_create_gift_aid_claim_fn.sql
-- Atomic Postgres function for creating a Gift Aid claim.
-- Runs as a single transaction: claim insert + donation updates
-- succeed or fail together. Uses SELECT ... FOR UPDATE to prevent
-- race conditions on double-claim checks.

create or replace function public.create_gift_aid_claim(
  p_organisation_id uuid,
  p_claim_start     date,
  p_claim_end       date,
  p_donation_ids    uuid[],
  p_created_by      uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_claim_id       uuid;
  v_found_count    int;
  v_claimed_count  int;
  v_wrong_org      int;
begin
  -- 1. Lock the donation rows and validate they exist + belong to the org
  select
    count(*),
    count(*) filter (where organisation_id != p_organisation_id),
    count(*) filter (where gift_aid_claim_id is not null)
  into v_found_count, v_wrong_org, v_claimed_count
  from public.donations
  where id = any(p_donation_ids)
  for update;

  if v_found_count != array_length(p_donation_ids, 1) then
    raise exception 'Some donations were not found. Expected %, found %.',
      array_length(p_donation_ids, 1), v_found_count;
  end if;

  if v_wrong_org > 0 then
    raise exception '% donation(s) do not belong to the specified organisation.',
      v_wrong_org;
  end if;

  if v_claimed_count > 0 then
    raise exception '% donation(s) have already been included in a Gift Aid claim.',
      v_claimed_count;
  end if;

  -- 2. Create the claim row
  insert into public.gift_aid_claims (organisation_id, claim_start, claim_end, created_by)
  values (p_organisation_id, p_claim_start, p_claim_end, p_created_by)
  returning id into v_claim_id;

  -- 3. Link donations to the claim (do NOT set gift_aid_eligible)
  update public.donations
  set
    gift_aid_claim_id  = v_claim_id,
    gift_aid_claimed_at = now()
  where id = any(p_donation_ids);

  return v_claim_id;
end;
$$;
