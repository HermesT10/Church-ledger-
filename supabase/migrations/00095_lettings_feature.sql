-- 00095_lettings_feature.sql
-- Lettings / Hall Hire operational sub-ledger.
-- Tenant column follows the existing app convention: organisation_id.
-- Money is stored in integer pence to match journals, donations, banking, and reports.

-- ---------------------------------------------------------------------------
-- 1. Hirers / customers
-- ---------------------------------------------------------------------------

create table if not exists public.lettings_hirers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  default_room_name text,
  default_rate_pence bigint,
  default_fund_id uuid references public.funds(id) on delete set null,
  default_income_account_id uuid references public.accounts(id) on delete set null,
  status text not null default 'active',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  constraint lettings_hirers_name_not_blank check (length(trim(name)) > 0),
  constraint lettings_hirers_default_rate_non_negative check (default_rate_pence is null or default_rate_pence >= 0),
  constraint lettings_hirers_status_check check (status in ('active', 'inactive', 'archived'))
);

create index if not exists idx_lettings_hirers_org_status
  on public.lettings_hirers (organisation_id, status, name);

create unique index if not exists idx_lettings_hirers_org_name_active_unique
  on public.lettings_hirers (organisation_id, lower(name))
  where status <> 'archived';

-- ---------------------------------------------------------------------------
-- 2. Monthly charges
-- ---------------------------------------------------------------------------

create table if not exists public.lettings_charges (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  hirer_id uuid not null references public.lettings_hirers(id) on delete cascade,
  period_year integer not null,
  period_month smallint not null,
  description text,
  expected_amount_pence bigint not null default 0,
  paid_amount_pence bigint not null default 0,
  outstanding_amount_pence bigint generated always as (
    greatest(expected_amount_pence - paid_amount_pence, 0)
  ) stored,
  status text not null default 'expected',
  due_date date,
  default_fund_id uuid references public.funds(id) on delete set null,
  default_income_account_id uuid references public.accounts(id) on delete set null,
  waived_reason text,
  cancelled_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lettings_charges_month_check check (period_month between 1 and 12),
  constraint lettings_charges_year_check check (period_year between 2000 and 2200),
  constraint lettings_charges_expected_non_negative check (expected_amount_pence >= 0),
  constraint lettings_charges_paid_non_negative check (paid_amount_pence >= 0),
  constraint lettings_charges_status_check check (
    status in ('expected', 'paid', 'part_paid', 'overdue', 'waived', 'cancelled')
  ),
  constraint lettings_charges_waived_reason_check check (status <> 'waived' or length(trim(coalesce(waived_reason, ''))) > 0),
  constraint lettings_charges_cancelled_reason_check check (status <> 'cancelled' or length(trim(coalesce(cancelled_reason, ''))) > 0)
);

create index if not exists idx_lettings_charges_org_period
  on public.lettings_charges (organisation_id, period_year, period_month);

create index if not exists idx_lettings_charges_org_status_due
  on public.lettings_charges (organisation_id, status, due_date);

create index if not exists idx_lettings_charges_hirer_period
  on public.lettings_charges (organisation_id, hirer_id, period_year, period_month);

create unique index if not exists idx_lettings_charges_hirer_month_unique
  on public.lettings_charges (organisation_id, hirer_id, period_year, period_month)
  where status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- 3. Payments
-- ---------------------------------------------------------------------------

create table if not exists public.lettings_payments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  hirer_id uuid not null references public.lettings_hirers(id) on delete restrict,
  lettings_charge_id uuid references public.lettings_charges(id) on delete set null,
  bank_transaction_id uuid references public.bank_lines(id) on delete set null,
  transaction_id uuid references public.manual_transactions(id) on delete set null,
  posted_journal_id uuid references public.journals(id) on delete set null,
  payment_date date not null,
  amount_pence bigint not null,
  status text not null default 'matched',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,

  constraint lettings_payments_amount_positive check (amount_pence > 0),
  constraint lettings_payments_status_check check (status in ('matched', 'reconciled', 'voided')),
  constraint lettings_payments_void_reason_check check (status <> 'voided' or length(trim(coalesce(void_reason, ''))) > 0)
);

create index if not exists idx_lettings_payments_org_date
  on public.lettings_payments (organisation_id, payment_date desc);

create index if not exists idx_lettings_payments_charge
  on public.lettings_payments (organisation_id, lettings_charge_id)
  where lettings_charge_id is not null;

create unique index if not exists idx_lettings_payments_bank_unique
  on public.lettings_payments (bank_transaction_id)
  where bank_transaction_id is not null and status <> 'voided';

create unique index if not exists idx_lettings_payments_journal_unique
  on public.lettings_payments (posted_journal_id)
  where posted_journal_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Documents
-- ---------------------------------------------------------------------------

create table if not exists public.lettings_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  hirer_id uuid references public.lettings_hirers(id) on delete cascade,
  lettings_charge_id uuid references public.lettings_charges(id) on delete set null,
  file_name text not null,
  file_path text not null,
  file_type text,
  file_size bigint,
  file_hash text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),

  constraint lettings_documents_owner_check check (hirer_id is not null or lettings_charge_id is not null),
  constraint lettings_documents_path_unique unique (file_path)
);

create index if not exists idx_lettings_documents_hirer
  on public.lettings_documents (organisation_id, hirer_id, uploaded_at desc)
  where hirer_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Charge total/status maintenance
-- ---------------------------------------------------------------------------

create or replace function public.lettings_calculated_status(
  p_expected_amount_pence bigint,
  p_paid_amount_pence bigint,
  p_due_date date,
  p_existing_status text
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_existing_status in ('waived', 'cancelled') then p_existing_status
    when p_expected_amount_pence <= 0 and p_paid_amount_pence <= 0 then 'expected'
    when p_paid_amount_pence >= p_expected_amount_pence then 'paid'
    when p_paid_amount_pence > 0 then 'part_paid'
    when p_due_date is not null and p_due_date < current_date then 'overdue'
    else 'expected'
  end
$$;

revoke all on function public.lettings_calculated_status(bigint, bigint, date, text) from public;
grant execute on function public.lettings_calculated_status(bigint, bigint, date, text) to authenticated;

create or replace function public.refresh_lettings_charge_payment_totals(p_charge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid bigint;
begin
  if p_charge_id is null then
    return;
  end if;

  select coalesce(sum(amount_pence), 0)
    into v_paid
    from public.lettings_payments
   where lettings_charge_id = p_charge_id
     and status <> 'voided';

  update public.lettings_charges c
     set paid_amount_pence = v_paid,
         status = public.lettings_calculated_status(c.expected_amount_pence, v_paid, c.due_date, c.status),
         updated_at = now()
   where c.id = p_charge_id;
end;
$$;

revoke all on function public.refresh_lettings_charge_payment_totals(uuid) from public;
grant execute on function public.refresh_lettings_charge_payment_totals(uuid) to authenticated;

create or replace function public.trg_refresh_lettings_charge_payment_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_lettings_charge_payment_totals(new.lettings_charge_id);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_lettings_charge_payment_totals(old.lettings_charge_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_lettings_payments_refresh_charge_totals on public.lettings_payments;
create trigger trg_lettings_payments_refresh_charge_totals
  after insert or update or delete on public.lettings_payments
  for each row execute function public.trg_refresh_lettings_charge_payment_totals();

drop trigger if exists trg_lettings_hirers_touch_updated_at on public.lettings_hirers;
create trigger trg_lettings_hirers_touch_updated_at
  before update on public.lettings_hirers
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_lettings_charges_touch_updated_at on public.lettings_charges;
create trigger trg_lettings_charges_touch_updated_at
  before update on public.lettings_charges
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_lettings_payments_touch_updated_at on public.lettings_payments;
create trigger trg_lettings_payments_touch_updated_at
  before update on public.lettings_payments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

alter table public.lettings_hirers enable row level security;
alter table public.lettings_charges enable row level security;
alter table public.lettings_payments enable row level security;
alter table public.lettings_documents enable row level security;

create policy lettings_hirers_select_member on public.lettings_hirers
  for select using (public.is_org_member(organisation_id));
create policy lettings_hirers_insert_finance on public.lettings_hirers
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));
create policy lettings_hirers_update_finance on public.lettings_hirers
  for update using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));
create policy lettings_hirers_delete_finance on public.lettings_hirers
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

create policy lettings_charges_select_member on public.lettings_charges
  for select using (public.is_org_member(organisation_id));
create policy lettings_charges_insert_finance on public.lettings_charges
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));
create policy lettings_charges_update_finance on public.lettings_charges
  for update using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));
create policy lettings_charges_delete_finance on public.lettings_charges
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

create policy lettings_payments_select_member on public.lettings_payments
  for select using (public.is_org_member(organisation_id));
create policy lettings_payments_insert_finance on public.lettings_payments
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));
create policy lettings_payments_update_finance on public.lettings_payments
  for update using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));
create policy lettings_payments_delete_finance on public.lettings_payments
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

create policy lettings_documents_select_member on public.lettings_documents
  for select using (public.is_org_member(organisation_id));
create policy lettings_documents_insert_finance on public.lettings_documents
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));
create policy lettings_documents_update_finance on public.lettings_documents
  for update using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));
create policy lettings_documents_delete_finance on public.lettings_documents
  for delete using (public.is_org_treasurer_or_admin(organisation_id));
