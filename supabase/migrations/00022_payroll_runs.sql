-- 00022_payroll_runs.sql
-- Payroll run wizard: payroll_runs, payroll_run_splits tables,
-- and payroll account mapping columns on organisation_settings.

-- ============================================================
-- 1. Add payroll account mapping columns to organisation_settings
-- ============================================================

alter table public.organisation_settings
  add column if not exists payroll_salaries_account_id    uuid references public.accounts(id),
  add column if not exists payroll_er_nic_account_id      uuid references public.accounts(id),
  add column if not exists payroll_pension_account_id     uuid references public.accounts(id),
  add column if not exists payroll_paye_nic_liability_id  uuid references public.accounts(id),
  add column if not exists payroll_pension_liability_id   uuid references public.accounts(id),
  add column if not exists payroll_net_pay_liability_id   uuid references public.accounts(id);

-- ============================================================
-- 2. Payroll Runs table
-- ============================================================

create table if not exists public.payroll_runs (
  id                    uuid        primary key default gen_random_uuid(),
  organisation_id       uuid        not null references public.organisations(id) on delete cascade,
  payroll_month         date        not null,
  status                text        not null default 'draft',
  total_gross_pence     bigint      not null default 0,
  total_net_pence       bigint      not null,
  total_paye_pence      bigint      not null,
  total_nic_pence       bigint      not null,
  total_pension_pence   bigint      not null,
  journal_id            uuid        references public.journals(id),
  created_by            uuid        references public.profiles(id),
  created_at            timestamptz not null default now(),

  constraint pr_status_valid   check (status in ('draft', 'posted')),
  constraint pr_net_positive   check (total_net_pence >= 0),
  constraint pr_paye_non_neg   check (total_paye_pence >= 0),
  constraint pr_nic_non_neg    check (total_nic_pence >= 0),
  constraint pr_pension_non_neg check (total_pension_pence >= 0),

  unique (organisation_id, payroll_month)
);

-- ============================================================
-- 3. Payroll Run Splits table (fund allocation)
-- ============================================================

create table if not exists public.payroll_run_splits (
  id              uuid   primary key default gen_random_uuid(),
  payroll_run_id  uuid   not null references public.payroll_runs(id) on delete cascade,
  fund_id         uuid   references public.funds(id),
  amount_pence    bigint not null,

  constraint prs_amount_positive check (amount_pence > 0)
);

-- ============================================================
-- 4. Indexes
-- ============================================================

create index if not exists idx_payroll_runs_org
  on public.payroll_runs (organisation_id);

create index if not exists idx_payroll_runs_org_month
  on public.payroll_runs (organisation_id, payroll_month);

create index if not exists idx_payroll_run_splits_run
  on public.payroll_run_splits (payroll_run_id);

-- ============================================================
-- 5. Enable RLS
-- ============================================================

alter table public.payroll_runs enable row level security;
alter table public.payroll_run_splits enable row level security;

-- ============================================================
-- 6. RLS Policies – payroll_runs
-- ============================================================

create policy pr_select_member on public.payroll_runs
  for select using (public.is_org_member(organisation_id));

create policy pr_insert_treasurer_admin on public.payroll_runs
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy pr_update_treasurer_admin on public.payroll_runs
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy pr_delete_treasurer_admin on public.payroll_runs
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

-- ============================================================
-- 7. RLS Policies – payroll_run_splits
-- ============================================================

-- Splits inherit org access via payroll_run_id -> payroll_runs.organisation_id
create policy prs_select_member on public.payroll_run_splits
  for select using (
    exists (
      select 1 from public.payroll_runs pr
      where pr.id = payroll_run_id
        and public.is_org_member(pr.organisation_id)
    )
  );

create policy prs_insert_treasurer_admin on public.payroll_run_splits
  for insert with check (
    exists (
      select 1 from public.payroll_runs pr
      where pr.id = payroll_run_id
        and public.is_org_treasurer_or_admin(pr.organisation_id)
    )
  );

create policy prs_delete_treasurer_admin on public.payroll_run_splits
  for delete using (
    exists (
      select 1 from public.payroll_runs pr
      where pr.id = payroll_run_id
        and public.is_org_treasurer_or_admin(pr.organisation_id)
    )
  );
