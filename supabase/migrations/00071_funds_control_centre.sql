-- 00071_funds_control_centre.sql
-- Extend funds schema, income_streams, fund_transfers, fund_adjustments,
-- journal_lines.income_stream_id, donations.income_stream_id, balance RPC helpers.
-- Tenant column everywhere: organisation_id (not workspace_id).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.fund_transfer_status as enum ('draft', 'approved', 'posted', 'reversed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.fund_adjustment_status as enum ('draft', 'approved', 'posted', 'reversed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.fund_adjustment_direction as enum ('increase', 'decrease');
exception
  when duplicate_object then null;
end $$;

-- Updated_at trigger helper (idempotent; aligns with 00060 touch pattern)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Extend public.funds
-- ---------------------------------------------------------------------------

alter table public.funds add column if not exists code text;
alter table public.funds add column if not exists description text;
alter table public.funds add column if not exists restriction_notes text;
alter table public.funds add column if not exists opening_balance_pence bigint not null default 0;
alter table public.funds add column if not exists opening_balance_date date;
alter table public.funds add column if not exists default_income_account_id uuid references public.accounts(id) on delete set null;
alter table public.funds add column if not exists default_expense_account_id uuid references public.accounts(id) on delete set null;
alter table public.funds add column if not exists min_balance_warning_pence bigint;
alter table public.funds add column if not exists allow_negative_balance boolean not null default false;
alter table public.funds add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.funds add column if not exists updated_at timestamptz not null default now();
alter table public.funds add column if not exists archived_at timestamptz;

create unique index if not exists idx_funds_org_code_unique
  on public.funds (organisation_id, code)
  where code is not null;

create index if not exists idx_funds_org_archived 
  on public.funds (organisation_id, archived_at)
  where archived_at is not null;

-- ---------------------------------------------------------------------------
-- income_streams (per-organisation analytic dimension)
-- ---------------------------------------------------------------------------

create table if not exists public.income_streams (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  default_fund_id uuid references public.funds(id) on delete set null,
  default_income_account_id uuid references public.accounts(id) on delete set null,
  status text not null default 'active' constraint income_streams_status_check check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint income_streams_org_code_unique unique (organisation_id, code)
);

create index if not exists idx_income_streams_org on public.income_streams (organisation_id);
create index if not exists idx_income_streams_status on public.income_streams (organisation_id, status);

-- ---------------------------------------------------------------------------
-- Tag journal_lines and donations with optional income stream
-- ---------------------------------------------------------------------------

alter table public.journal_lines add column if not exists income_stream_id uuid references public.income_streams(id) on delete set null;

create index if not exists idx_journal_lines_income_stream
  on public.journal_lines (organisation_id, income_stream_id)
  where income_stream_id is not null;

alter table public.donations add column if not exists income_stream_id uuid references public.income_streams(id) on delete set null;

create index if not exists idx_donations_income_stream
  on public.donations (organisation_id, income_stream_id)
  where income_stream_id is not null;

-- ---------------------------------------------------------------------------
-- fund_transfers (workflow + link to eventual posted journal)
-- ---------------------------------------------------------------------------

create table if not exists public.fund_transfers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  from_fund_id uuid not null references public.funds(id) on delete restrict,
  to_fund_id uuid not null references public.funds(id) on delete restrict,
  amount_pence bigint not null,
  transfer_date date not null,
  reason text,
  status public.fund_transfer_status not null default 'draft',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  posted_journal_id uuid references public.journals(id) on delete set null,
  reversed_journal_id uuid references public.journals(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fund_transfers_distinct_funds check (from_fund_id <> to_fund_id),
  constraint fund_transfers_amount_positive check (amount_pence > 0)
);

create index if not exists idx_fund_transfers_org on public.fund_transfers (organisation_id);
create index if not exists idx_fund_transfers_from on public.fund_transfers (organisation_id, from_fund_id);
create index if not exists idx_fund_transfers_to on public.fund_transfers (organisation_id, to_fund_id);
create index if not exists idx_fund_transfers_status on public.fund_transfers (organisation_id, status);

-- ---------------------------------------------------------------------------
-- fund_adjustments
-- ---------------------------------------------------------------------------

create table if not exists public.fund_adjustments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  fund_id uuid not null references public.funds(id) on delete restrict,
  amount_pence bigint not null,
  direction public.fund_adjustment_direction not null,
  adjustment_date date not null,
  reason text not null,
  status public.fund_adjustment_status not null default 'draft',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  posted_journal_id uuid references public.journals(id) on delete set null,
  reversed_journal_id uuid references public.journals(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fund_adjustments_amount_positive check (amount_pence > 0)
);

create index if not exists idx_fund_adjustments_org on public.fund_adjustments (organisation_id);
create index if not exists idx_fund_adjustments_fund on public.fund_adjustments (organisation_id, fund_id);
create index if not exists idx_fund_adjustments_status on public.fund_adjustments (organisation_id, status);

-- ---------------------------------------------------------------------------
-- triggers: updated_at
-- ---------------------------------------------------------------------------

drop trigger if exists trg_funds_touch_updated_at on public.funds;
create trigger trg_funds_touch_updated_at
  before update on public.funds
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_income_streams_touch_updated_at on public.income_streams;
create trigger trg_income_streams_touch_updated_at
  before update on public.income_streams
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_fund_transfers_touch_updated_at on public.fund_transfers;
create trigger trg_fund_transfers_touch_updated_at
  before update on public.fund_transfers
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_fund_adjustments_touch_updated_at on public.fund_adjustments;
create trigger trg_fund_adjustments_touch_updated_at
  before update on public.fund_adjustments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RPC: calculated balance per fund (posted journal lines minus opening convention)
-- Returns net debit - credit matching get_fund_balance_stats pattern.
-- ---------------------------------------------------------------------------

create or replace function public.calculate_fund_balance(p_org_id uuid, p_fund_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(jl.debit_pence), 0) - coalesce(sum(jl.credit_pence), 0)
    from public.journal_lines jl
    join public.journals j on j.id = jl.journal_id
   where jl.organisation_id = p_org_id
     and jl.fund_id = p_fund_id
     and j.status = 'posted'
$$;

revoke all on function public.calculate_fund_balance(uuid, uuid) from public;
grant execute on function public.calculate_fund_balance(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS — income_streams
-- ---------------------------------------------------------------------------

alter table public.income_streams enable row level security;

drop policy if exists income_streams_select_member on public.income_streams;
create policy income_streams_select_member on public.income_streams
  for select using (public.is_org_member(organisation_id));

drop policy if exists income_streams_insert_treasurer_admin on public.income_streams;
create policy income_streams_insert_treasurer_admin on public.income_streams
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

drop policy if exists income_streams_update_treasurer_admin on public.income_streams;
create policy income_streams_update_treasurer_admin on public.income_streams
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

drop policy if exists income_streams_delete_treasurer_admin on public.income_streams;
create policy income_streams_delete_treasurer_admin on public.income_streams
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

-- ---------------------------------------------------------------------------
-- RLS — fund_transfers
-- ---------------------------------------------------------------------------

alter table public.fund_transfers enable row level security;

drop policy if exists fund_transfers_select_member on public.fund_transfers;
create policy fund_transfers_select_member on public.fund_transfers
  for select using (public.is_org_member(organisation_id));

drop policy if exists fund_transfers_insert_treasurer_admin on public.fund_transfers;
create policy fund_transfers_insert_treasurer_admin on public.fund_transfers
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

drop policy if exists fund_transfers_update_treasurer_admin on public.fund_transfers;
create policy fund_transfers_update_treasurer_admin on public.fund_transfers
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

drop policy if exists fund_transfers_delete_treasurer_admin on public.fund_transfers;
create policy fund_transfers_delete_treasurer_admin on public.fund_transfers
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

-- ---------------------------------------------------------------------------
-- RLS — fund_adjustments
-- ---------------------------------------------------------------------------

alter table public.fund_adjustments enable row level security;

drop policy if exists fund_adjustments_select_member on public.fund_adjustments;
create policy fund_adjustments_select_member on public.fund_adjustments
  for select using (public.is_org_member(organisation_id));

drop policy if exists fund_adjustments_insert_treasurer_admin on public.fund_adjustments;
create policy fund_adjustments_insert_treasurer_admin on public.fund_adjustments
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

drop policy if exists fund_adjustments_update_treasurer_admin on public.fund_adjustments;
create policy fund_adjustments_update_treasurer_admin on public.fund_adjustments
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

drop policy if exists fund_adjustments_delete_treasurer_admin on public.fund_adjustments;
create policy fund_adjustments_delete_treasurer_admin on public.fund_adjustments
  for delete using (public.is_org_treasurer_or_admin(organisation_id));
