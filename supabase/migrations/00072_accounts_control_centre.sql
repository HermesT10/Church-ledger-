-- 00072_accounts_control_centre.sql
-- Chart of Accounts upgrade: fund_balance vs equity, subtypes, module flags,
-- reporting safeguards, tenancy remains organisation_id (never workspace_id).

-- ---------------------------------------------------------------------------
-- 1. Extend account_type enum (charity-native reserves)
-- ---------------------------------------------------------------------------

do $$ begin
  alter type public.account_type add value 'fund_balance';
exception
  when duplicate_object then null;
end $$;

comment on type public.account_type is
  'income, expense, asset, liability, equity (legacy), fund_balance (reserves/net assets)';

-- Note: Postgres forbids assigning a newly added enum value in the same
-- transaction as ADD VALUE (55P04). Equity → fund_balance and follow-up
-- normal_balance hints run in migration 00073_fund_balance_account_type_backfill.sql.

-- ---------------------------------------------------------------------------
-- 2. Columns: detail, subtype, normal balance, status bits, modules, FKs
-- ---------------------------------------------------------------------------

alter table public.accounts add column if not exists subtype text;

alter table public.accounts add column if not exists description text;

do $$ begin
  alter table public.accounts add column normal_balance text;
  alter table public.accounts add constraint accounts_normal_balance_check
    check (normal_balance is null or normal_balance in ('debit', 'credit'));
exception
  when duplicate_column then null;
  when duplicate_object then null;
end $$;

alter table public.accounts add column if not exists is_system_account boolean not null default false;

alter table public.accounts add column if not exists allow_direct_posting boolean not null default true;

alter table public.accounts add column if not exists available_in_reconciliation boolean not null default true;

alter table public.accounts add column if not exists available_in_donations boolean not null default false;

alter table public.accounts add column if not exists available_in_invoices boolean not null default false;

alter table public.accounts add column if not exists available_in_payroll boolean not null default false;

alter table public.accounts add column if not exists default_fund_id uuid references public.funds(id) on delete set null;

alter table public.accounts add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.accounts add column if not exists updated_at timestamptz not null default now();

alter table public.accounts add column if not exists archived_at timestamptz;

-- Prefer system flag on seeded reserve + clearing style codes (idempotent heuristic)
update public.accounts
   set is_system_account = true
 where code in ('CLR-GC', 'CLR-SU', 'CLR-IZ', 'INC-DON')
   or code like 'EQU-%';

-- Normal balance hints by broad type where missing
update public.accounts
   set normal_balance = 'debit'
 where normal_balance is null and type::text in ('asset', 'expense');

update public.accounts
   set normal_balance = 'credit'
 where normal_balance is null and type::text in ('income', 'liability');

-- ---------------------------------------------------------------------------
-- 3. Indexes for list/filter performance
-- ---------------------------------------------------------------------------

create index if not exists idx_accounts_org_type_active
  on public.accounts (organisation_id, type, is_active);

create index if not exists idx_accounts_org_subtype
  on public.accounts (organisation_id, subtype)
  where subtype is not null;

create index if not exists idx_accounts_org_module_flags
  on public.accounts (organisation_id, available_in_reconciliation)
  where is_active = true;

create index if not exists idx_journal_lines_org_account_journal
  on public.journal_lines (organisation_id, account_id, journal_id);

comment on column public.accounts.available_in_reconciliation is
  'If true, selectable in banking/reconciliation UX when active.';

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger (reuse touch_updated_at from 00071 where present)
-- ---------------------------------------------------------------------------

drop trigger if exists trg_accounts_touch_updated_at on public.accounts;

create trigger trg_accounts_touch_updated_at
  before update on public.accounts
  for each row execute function public.touch_updated_at();
