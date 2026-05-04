-- 00087_donor_annual_giving_statements.sql
-- Admin-generated annual giving statements for donors (PDF in gift-aid bucket).

create table if not exists public.donor_statement_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  period_type text not null default 'uk_tax_year'
    check (period_type in ('uk_tax_year', 'fiscal_year', 'calendar_year', 'custom')),
  label text,
  status text not null default 'draft'
    check (status in ('draft', 'processing', 'completed', 'failed')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint donor_statement_runs_period_valid check (period_end >= period_start)
);

create index if not exists idx_donor_statement_runs_workspace
  on public.donor_statement_runs (workspace_id, created_at desc);

create table if not exists public.donor_statements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  run_id uuid references public.donor_statement_runs(id) on delete set null,
  donor_id uuid not null references public.donors(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  pdf_path text,
  email_sent_at timestamptz,
  status text not null default 'generated'
    check (status in ('generated', 'sent', 'failed', 'voided')),
  total_donations_pence bigint,
  total_gift_aid_reclaimable_pence bigint,
  created_at timestamptz not null default now(),
  constraint donor_statements_period_valid check (period_end >= period_start)
);

create index if not exists idx_donor_statements_workspace_donor
  on public.donor_statements (workspace_id, donor_id, period_start desc);

create index if not exists idx_donor_statements_run
  on public.donor_statements (workspace_id, run_id);

alter table public.donor_statement_runs enable row level security;
alter table public.donor_statement_runs force row level security;

alter table public.donor_statements enable row level security;
alter table public.donor_statements force row level security;

drop policy if exists donor_statement_runs_select_member on public.donor_statement_runs;
create policy donor_statement_runs_select_member
  on public.donor_statement_runs
  for select using (public.is_org_member(workspace_id));

drop policy if exists donor_statement_runs_insert_writer on public.donor_statement_runs;
create policy donor_statement_runs_insert_writer
  on public.donor_statement_runs
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists donor_statement_runs_update_writer on public.donor_statement_runs;
create policy donor_statement_runs_update_writer
  on public.donor_statement_runs
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists donor_statement_runs_delete_writer on public.donor_statement_runs;
create policy donor_statement_runs_delete_writer
  on public.donor_statement_runs
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists donor_statements_select_member on public.donor_statements;
create policy donor_statements_select_member
  on public.donor_statements
  for select using (public.is_org_member(workspace_id));

drop policy if exists donor_statements_insert_writer on public.donor_statements;
create policy donor_statements_insert_writer
  on public.donor_statements
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists donor_statements_update_writer on public.donor_statements;
create policy donor_statements_update_writer
  on public.donor_statements
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists donor_statements_delete_writer on public.donor_statements;
create policy donor_statements_delete_writer
  on public.donor_statements
  for delete using (public.is_org_treasurer_or_admin(workspace_id));
