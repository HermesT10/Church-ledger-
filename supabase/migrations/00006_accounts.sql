-- 00006_accounts.sql
-- Chart of accounts: account_type enum, accounts table, RLS policies

-- 1. Enum: account types
create type public.account_type as enum (
  'income',
  'expense',
  'asset',
  'liability',
  'equity'
);

-- 2. Accounts table
create table public.accounts (
  id              uuid              primary key default gen_random_uuid(),
  organisation_id uuid              not null references public.organisations(id) on delete cascade,
  code            text              not null,
  name            text              not null,
  type            public.account_type not null,
  is_active       boolean           not null default true,
  created_at      timestamptz       not null default now(),

  unique (organisation_id, code)
);

-- 3. Enable RLS
alter table public.accounts enable row level security;

-- 4. Policies
-- Any org member can read accounts
create policy accounts_select_member on public.accounts
  for select using (public.is_org_member(organisation_id));

-- Treasurer or admin can insert accounts
create policy accounts_insert_treasurer_admin on public.accounts
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

-- Treasurer or admin can update accounts
create policy accounts_update_treasurer_admin on public.accounts
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

-- Treasurer or admin can delete accounts
create policy accounts_delete_treasurer_admin on public.accounts
  for delete using (public.is_org_treasurer_or_admin(organisation_id));
