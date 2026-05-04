-- Budget lines: unique constraint compatible with Supabase upsert
-- onConflict: 'budget_id,account_id,fund_id'
--
-- The original index uq_budget_lines_budget_account_fund used
-- coalesce(fund_id, '00000000-...') which Postgres cannot use as an
-- ON CONFLICT target for plain (budget_id, account_id, fund_id).
-- Requires PostgreSQL 15+ (NULLS NOT DISTINCT).

drop index if exists public.uq_budget_lines_budget_account_fund;

alter table public.budget_lines
  drop constraint if exists uq_budget_lines_budget_account_fund;

alter table public.budget_lines
  add constraint uq_budget_lines_budget_account_fund
  unique nulls not distinct (budget_id, account_id, fund_id);
