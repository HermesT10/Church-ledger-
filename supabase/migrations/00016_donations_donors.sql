-- 00016_donations_donors.sql
-- Donors, Gift Aid declarations, and Donations tables.
-- CHECK constraints, RLS policies, indexes.

-- ============================================================
-- 1. Tables
-- ============================================================

create table if not exists public.donors (
  id              uuid        primary key default gen_random_uuid(),
  organisation_id uuid        not null references public.organisations(id) on delete cascade,
  full_name       text        not null,
  email           text,
  address         text,
  postcode        text,
  created_at      timestamptz not null default now(),

  constraint donors_unique_name unique (organisation_id, full_name)
);

create table if not exists public.gift_aid_declarations (
  id          uuid    primary key default gen_random_uuid(),
  donor_id    uuid    not null references public.donors(id) on delete cascade,
  start_date  date    not null,
  end_date    date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint gad_dates_valid check (end_date is null or end_date >= start_date)
);

create table if not exists public.donations (
  id              uuid        primary key default gen_random_uuid(),
  organisation_id uuid        not null references public.organisations(id) on delete cascade,
  donor_id        uuid        references public.donors(id),
  donation_date   date        not null,
  amount_pence    bigint      not null,
  fund_id         uuid        references public.funds(id),
  source          text        not null default 'manual',
  status          text        not null default 'posted',
  journal_id      uuid        references public.journals(id),
  created_by      uuid        references public.profiles(id),
  created_at      timestamptz not null default now(),

  constraint donations_amount_positive check (amount_pence > 0),
  constraint donations_source_valid check (source in ('manual', 'gocardless', 'sumup', 'izettle')),
  constraint donations_status_valid check (status in ('draft', 'posted'))
);

-- ============================================================
-- 2. Indexes
-- ============================================================

create index if not exists idx_donors_organisation_id
  on public.donors (organisation_id);

create index if not exists idx_gift_aid_declarations_donor_id
  on public.gift_aid_declarations (donor_id);

create index if not exists idx_donations_organisation_id
  on public.donations (organisation_id);

create index if not exists idx_donations_donor_id
  on public.donations (donor_id);

create index if not exists idx_donations_fund_id
  on public.donations (fund_id);

-- ============================================================
-- 3. Enable RLS
-- ============================================================

alter table public.donors                  enable row level security;
alter table public.gift_aid_declarations   enable row level security;
alter table public.donations               enable row level security;

-- ============================================================
-- 4. RLS Policies – donors
-- ============================================================

create policy donors_select_member on public.donors
  for select using (public.is_org_member(organisation_id));

create policy donors_insert_treasurer_admin on public.donors
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy donors_update_treasurer_admin on public.donors
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy donors_delete_treasurer_admin on public.donors
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

-- ============================================================
-- 5. RLS Policies – gift_aid_declarations (via parent donor)
-- ============================================================

create policy gad_select_member on public.gift_aid_declarations
  for select using (
    exists (
      select 1 from public.donors d
      where d.id = donor_id
        and public.is_org_member(d.organisation_id)
    )
  );

create policy gad_insert_treasurer_admin on public.gift_aid_declarations
  for insert with check (
    exists (
      select 1 from public.donors d
      where d.id = donor_id
        and public.is_org_treasurer_or_admin(d.organisation_id)
    )
  );

create policy gad_update_treasurer_admin on public.gift_aid_declarations
  for update
  using (
    exists (
      select 1 from public.donors d
      where d.id = donor_id
        and public.is_org_treasurer_or_admin(d.organisation_id)
    )
  )
  with check (
    exists (
      select 1 from public.donors d
      where d.id = donor_id
        and public.is_org_treasurer_or_admin(d.organisation_id)
    )
  );

create policy gad_delete_treasurer_admin on public.gift_aid_declarations
  for delete using (
    exists (
      select 1 from public.donors d
      where d.id = donor_id
        and public.is_org_treasurer_or_admin(d.organisation_id)
    )
  );

-- ============================================================
-- 6. RLS Policies – donations
-- ============================================================

create policy donations_select_member on public.donations
  for select using (public.is_org_member(organisation_id));

create policy donations_insert_treasurer_admin on public.donations
  for insert with check (
    public.is_org_treasurer_or_admin(organisation_id)
  );

create policy donations_update_treasurer_admin on public.donations
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy donations_delete_treasurer_admin on public.donations
  for delete using (
    public.is_org_treasurer_or_admin(organisation_id)
    and status = 'draft'
  );
