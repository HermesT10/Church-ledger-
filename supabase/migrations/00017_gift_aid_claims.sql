-- 00017_gift_aid_claims.sql
-- Gift Aid claim tracking: claims table, new columns on donations,
-- RLS policies, indexes.

-- ============================================================
-- 1. Gift Aid Claims table
-- ============================================================

create table if not exists public.gift_aid_claims (
  id              uuid        primary key default gen_random_uuid(),
  organisation_id uuid        not null references public.organisations(id) on delete cascade,
  claim_start     date        not null,
  claim_end       date        not null,
  submitted_at    timestamptz,
  reference       text,
  created_by      uuid        references public.profiles(id),
  created_at      timestamptz not null default now(),

  constraint gac_dates_valid check (claim_end >= claim_start)
);

-- ============================================================
-- 2. New columns on donations
-- ============================================================

ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS gift_aid_eligible boolean default false,
  ADD COLUMN IF NOT EXISTS gift_aid_claim_id uuid references public.gift_aid_claims(id),
  ADD COLUMN IF NOT EXISTS gift_aid_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS gift_aid_ineligible_reason text;

-- ============================================================
-- 3. Indexes
-- ============================================================

create index if not exists idx_gift_aid_claims_organisation_id
  on public.gift_aid_claims (organisation_id);

create index if not exists idx_donations_gift_aid_claim_id
  on public.donations (gift_aid_claim_id);

-- ============================================================
-- 4. Enable RLS
-- ============================================================

alter table public.gift_aid_claims enable row level security;

-- ============================================================
-- 5. RLS Policies – gift_aid_claims
-- ============================================================

-- SELECT: any org member
create policy gac_select_member on public.gift_aid_claims
  for select using (public.is_org_member(organisation_id));

-- INSERT: treasurer/admin
create policy gac_insert_treasurer_admin on public.gift_aid_claims
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

-- UPDATE: treasurer/admin
create policy gac_update_treasurer_admin on public.gift_aid_claims
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

-- DELETE: treasurer/admin
create policy gac_delete_treasurer_admin on public.gift_aid_claims
  for delete using (public.is_org_treasurer_or_admin(organisation_id));
