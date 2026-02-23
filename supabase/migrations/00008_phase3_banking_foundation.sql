-- 00008_phase3_banking_foundation.sql
-- Banking foundation: bank_accounts, bank_statements, bank_lines tables,
-- constraints, indexes, and RLS policies.

-- ============================================================
-- 1. Extension
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 2. Tables
-- ============================================================

-- Bank accounts
create table if not exists public.bank_accounts (
  id                    uuid        primary key default gen_random_uuid(),
  organisation_id       uuid        not null references public.organisations(id) on delete cascade,
  name                  text        not null,
  account_number_last4  text,
  sort_code             text,
  currency              text        not null default 'GBP',
  is_active             boolean     not null default true,
  created_at            timestamptz not null default now(),

  unique (organisation_id, name),
  check (currency <> '')
);

-- Bank statements (imported statement headers)
create table if not exists public.bank_statements (
  id                    uuid        primary key default gen_random_uuid(),
  organisation_id       uuid        not null references public.organisations(id) on delete cascade,
  bank_account_id       uuid        not null references public.bank_accounts(id) on delete cascade,
  statement_start       date,
  statement_end         date,
  opening_balance_pence bigint,
  closing_balance_pence bigint,
  source                text        not null default 'csv',
  import_hash           text,
  created_by            uuid        references public.profiles(id),
  created_at            timestamptz not null default now(),

  check (statement_end is null or statement_start is null or statement_end >= statement_start)
);

-- Bank lines (individual transactions)
create table if not exists public.bank_lines (
  id                uuid        primary key default gen_random_uuid(),
  organisation_id   uuid        not null references public.organisations(id) on delete cascade,
  bank_account_id   uuid        not null references public.bank_accounts(id) on delete cascade,
  bank_statement_id uuid        references public.bank_statements(id) on delete set null,
  txn_date          date        not null,
  description       text,
  reference         text,
  amount_pence      bigint      not null,
  balance_pence     bigint,
  raw               jsonb,
  fingerprint       text        not null,
  created_by        uuid        references public.profiles(id),
  created_at        timestamptz not null default now(),

  -- Dedup constraint: same account + fingerprint = duplicate
  unique (bank_account_id, fingerprint)
);

-- ============================================================
-- 3. Indexes
-- ============================================================

create index if not exists idx_bank_lines_account_date
  on public.bank_lines (bank_account_id, txn_date);

create index if not exists idx_bank_lines_org
  on public.bank_lines (organisation_id);

create index if not exists idx_bank_statements_account
  on public.bank_statements (bank_account_id);

-- ============================================================
-- 4. Enable RLS
-- ============================================================

alter table public.bank_accounts   enable row level security;
alter table public.bank_statements enable row level security;
alter table public.bank_lines      enable row level security;

-- ============================================================
-- 5. RLS Policies – bank_accounts
-- ============================================================

create policy bank_accounts_select_member on public.bank_accounts
  for select using (public.is_org_member(organisation_id));

create policy bank_accounts_insert_treasurer_admin on public.bank_accounts
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy bank_accounts_update_treasurer_admin on public.bank_accounts
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy bank_accounts_delete_treasurer_admin on public.bank_accounts
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

-- ============================================================
-- 6. RLS Policies – bank_statements
-- ============================================================

create policy bank_statements_select_member on public.bank_statements
  for select using (public.is_org_member(organisation_id));

create policy bank_statements_insert_treasurer_admin on public.bank_statements
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy bank_statements_update_treasurer_admin on public.bank_statements
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy bank_statements_delete_treasurer_admin on public.bank_statements
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

-- ============================================================
-- 7. RLS Policies – bank_lines
-- ============================================================

create policy bank_lines_select_member on public.bank_lines
  for select using (public.is_org_member(organisation_id));

create policy bank_lines_insert_treasurer_admin on public.bank_lines
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy bank_lines_update_treasurer_admin on public.bank_lines
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy bank_lines_delete_treasurer_admin on public.bank_lines
  for delete using (public.is_org_treasurer_or_admin(organisation_id));
