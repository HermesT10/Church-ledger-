-- 00020_giving_imports.sql
-- Giving platform CSV import pipeline: import tracking, parsed rows,
-- and donations_income_account_id on giving_platforms.

-- ============================================================
-- 1. Add donations_income_account_id to giving_platforms
-- ============================================================

alter table public.giving_platforms
  add column if not exists donations_income_account_id uuid references public.accounts(id);

-- ============================================================
-- 2. Giving Imports table (tracks each CSV upload)
-- ============================================================

create table if not exists public.giving_imports (
  id               uuid        primary key default gen_random_uuid(),
  organisation_id  uuid        not null references public.organisations(id) on delete cascade,
  provider         text        not null,
  import_start     date,
  import_end       date,
  file_name        text,
  import_hash      text        not null,
  status           text        not null default 'completed',
  inserted_count   int         not null default 0,
  skipped_count    int         not null default 0,
  error_count      int         not null default 0,
  journals_created int         not null default 0,
  created_by       uuid        references public.profiles(id),
  created_at       timestamptz not null default now(),

  constraint gi_provider_valid check (provider in ('gocardless', 'sumup', 'izettle')),
  constraint gi_status_valid check (status in ('completed', 'failed'))
);

-- ============================================================
-- 3. Giving Import Rows table (individual parsed transactions)
-- ============================================================

create table if not exists public.giving_import_rows (
  id                uuid        primary key default gen_random_uuid(),
  giving_import_id  uuid        not null references public.giving_imports(id) on delete cascade,
  organisation_id   uuid        not null references public.organisations(id) on delete cascade,
  provider          text        not null,
  txn_date          date        not null,
  gross_amount_pence bigint     not null,
  fee_amount_pence  bigint      not null default 0,
  net_amount_pence  bigint      not null,
  donor_name        text,
  reference         text,
  payout_reference  text,
  fingerprint       text        not null,
  raw               jsonb,
  created_at        timestamptz not null default now(),

  constraint gir_provider_valid check (provider in ('gocardless', 'sumup', 'izettle')),
  -- Dedup: same org + provider + fingerprint = duplicate
  unique (organisation_id, provider, fingerprint)
);

-- ============================================================
-- 4. Indexes
-- ============================================================

create index if not exists idx_giving_imports_org
  on public.giving_imports (organisation_id);

create index if not exists idx_giving_imports_provider
  on public.giving_imports (organisation_id, provider);

create index if not exists idx_giving_import_rows_import
  on public.giving_import_rows (giving_import_id);

create index if not exists idx_giving_import_rows_org_provider
  on public.giving_import_rows (organisation_id, provider);

create index if not exists idx_giving_import_rows_txn_date
  on public.giving_import_rows (organisation_id, txn_date);

-- ============================================================
-- 5. Enable RLS
-- ============================================================

alter table public.giving_imports enable row level security;
alter table public.giving_import_rows enable row level security;

-- ============================================================
-- 6. RLS Policies – giving_imports
-- ============================================================

create policy gi_select_member on public.giving_imports
  for select using (public.is_org_member(organisation_id));

create policy gi_insert_treasurer_admin on public.giving_imports
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy gi_update_treasurer_admin on public.giving_imports
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy gi_delete_treasurer_admin on public.giving_imports
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

-- ============================================================
-- 7. RLS Policies – giving_import_rows
-- ============================================================

create policy gir_select_member on public.giving_import_rows
  for select using (public.is_org_member(organisation_id));

create policy gir_insert_treasurer_admin on public.giving_import_rows
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy gir_update_treasurer_admin on public.giving_import_rows
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy gir_delete_treasurer_admin on public.giving_import_rows
  for delete using (public.is_org_treasurer_or_admin(organisation_id));
