-- 00009_phase4_budgeting.sql
-- Phase 4: Budgeting foundation — budgets and budget_lines tables,
-- indexes, RLS policies, and org-consistency trigger.

-- ============================================================
-- 1. Tables
-- ============================================================

-- Budget headers (one per year / name)
create table if not exists public.budgets (
  id              uuid        primary key default gen_random_uuid(),
  organisation_id uuid        not null references public.organisations(id) on delete cascade,
  year            int         not null,
  name            text        not null default 'Annual Budget',
  status          text        not null default 'draft',
  created_by      uuid        references public.profiles(id),
  created_at      timestamptz not null default now(),

  unique (organisation_id, year, name),
  check (status in ('draft', 'active', 'archived'))
);

-- Budget line items (one row per account + optional fund, 12 monthly columns)
create table if not exists public.budget_lines (
  id              uuid        primary key default gen_random_uuid(),
  budget_id       uuid        not null references public.budgets(id) on delete cascade,
  organisation_id uuid        not null references public.organisations(id) on delete cascade,
  account_id      uuid        not null references public.accounts(id) on delete restrict,
  fund_id         uuid        references public.funds(id) on delete restrict,
  m01_pence       bigint      not null default 0,
  m02_pence       bigint      not null default 0,
  m03_pence       bigint      not null default 0,
  m04_pence       bigint      not null default 0,
  m05_pence       bigint      not null default 0,
  m06_pence       bigint      not null default 0,
  m07_pence       bigint      not null default 0,
  m08_pence       bigint      not null default 0,
  m09_pence       bigint      not null default 0,
  m10_pence       bigint      not null default 0,
  m11_pence       bigint      not null default 0,
  m12_pence       bigint      not null default 0,
  created_at      timestamptz not null default now()
);

-- Unique constraint on (budget_id, account_id, fund_id).
-- Standard UNIQUE treats NULL != NULL, so we use a unique index with
-- COALESCE to handle nullable fund_id correctly.
create unique index if not exists uq_budget_lines_budget_account_fund
  on public.budget_lines (
    budget_id,
    account_id,
    coalesce(fund_id, '00000000-0000-0000-0000-000000000000')
  );

-- ============================================================
-- 2. Indexes
-- ============================================================

create index if not exists idx_budget_lines_budget
  on public.budget_lines (budget_id);

create index if not exists idx_budget_lines_org
  on public.budget_lines (organisation_id);

create index if not exists idx_budget_lines_account
  on public.budget_lines (account_id);

create index if not exists idx_budget_lines_fund
  on public.budget_lines (fund_id);

-- ============================================================
-- 3. Enable RLS
-- ============================================================

alter table public.budgets      enable row level security;
alter table public.budget_lines enable row level security;

-- ============================================================
-- 4. RLS Policies — budgets
-- ============================================================

create policy budgets_select_member on public.budgets
  for select using (public.is_org_member(organisation_id));

create policy budgets_insert_treasurer_admin on public.budgets
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy budgets_update_treasurer_admin on public.budgets
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy budgets_delete_treasurer_admin on public.budgets
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

-- ============================================================
-- 5. RLS Policies — budget_lines
-- ============================================================

create policy budget_lines_select_member on public.budget_lines
  for select using (public.is_org_member(organisation_id));

create policy budget_lines_insert_treasurer_admin on public.budget_lines
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy budget_lines_update_treasurer_admin on public.budget_lines
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy budget_lines_delete_treasurer_admin on public.budget_lines
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

-- ============================================================
-- 6. Org-consistency trigger for budget_lines
-- ============================================================

-- Ensures budget_lines.organisation_id always matches the parent
-- budget's organisation_id. Auto-sets it on INSERT and rejects
-- mismatches on UPDATE.

create or replace function public.handle_budget_line_org()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  parent_org_id uuid;
begin
  -- Look up the parent budget's organisation_id
  select organisation_id into parent_org_id
  from public.budgets
  where id = new.budget_id;

  if parent_org_id is null then
    raise exception 'budget_id % does not exist', new.budget_id;
  end if;

  -- On INSERT: auto-fill organisation_id from parent budget
  -- On INSERT/UPDATE: reject if caller provided a mismatched org
  if new.organisation_id is null then
    new.organisation_id := parent_org_id;
  elsif new.organisation_id <> parent_org_id then
    raise exception 'budget_lines.organisation_id (%) does not match parent budget organisation_id (%)',
      new.organisation_id, parent_org_id;
  end if;

  return new;
end;
$$;

create trigger trg_budget_line_org_consistency
  before insert or update on public.budget_lines
  for each row execute function public.handle_budget_line_org();
