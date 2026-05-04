-- 00084_recurring_donor_patterns.sql
-- Recurring donation patterns for insights, reconciliation hints, and Gift Aid forecasting.

create table if not exists public.recurring_donor_patterns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  donor_id uuid not null references public.donors(id) on delete cascade,
  pattern_signature text not null default '',
  pattern_type text not null
    check (pattern_type in ('monthly', 'weekly', 'quarterly', 'irregular')),
  expected_amount_pence bigint not null check (expected_amount_pence > 0),
  amount_tolerance_pence bigint not null default 50 check (amount_tolerance_pence >= 0),
  expected_day_of_month smallint
    check (expected_day_of_month is null or (expected_day_of_month >= 1 and expected_day_of_month <= 28)),
  bank_reference_alias text,
  normalized_bank_reference text,
  confidence_score numeric(5,4) not null default 0.8
    check (confidence_score >= 0 and confidence_score <= 1),
  status text not null default 'active'
    check (status in ('active', 'paused', 'dismissed')),
  grace_days integer not null default 7 check (grace_days >= 0 and grace_days <= 60),
  last_detected_at timestamptz,
  last_occurrence_at timestamptz,
  next_expected_date date,
  occurrence_count integer not null default 3 check (occurrence_count >= 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_recurring_donor_patterns_workspace_signature
  on public.recurring_donor_patterns (workspace_id, donor_id, pattern_signature);

create index if not exists idx_recurring_donor_patterns_workspace_status
  on public.recurring_donor_patterns (workspace_id, status)
  where status = 'active';

create index if not exists idx_recurring_donor_patterns_donor
  on public.recurring_donor_patterns (workspace_id, donor_id);

create or replace function public.recurring_donor_patterns_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recurring_donor_patterns_set_updated_at on public.recurring_donor_patterns;
create trigger recurring_donor_patterns_set_updated_at
  before update on public.recurring_donor_patterns
  for each row execute function public.recurring_donor_patterns_set_updated_at();

alter table public.recurring_donor_patterns enable row level security;
alter table public.recurring_donor_patterns force row level security;

drop policy if exists recurring_donor_patterns_select_member on public.recurring_donor_patterns;
create policy recurring_donor_patterns_select_member
  on public.recurring_donor_patterns
  for select using (public.is_org_member(workspace_id));

drop policy if exists recurring_donor_patterns_insert_writer on public.recurring_donor_patterns;
create policy recurring_donor_patterns_insert_writer
  on public.recurring_donor_patterns
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists recurring_donor_patterns_update_writer on public.recurring_donor_patterns;
create policy recurring_donor_patterns_update_writer
  on public.recurring_donor_patterns
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists recurring_donor_patterns_delete_writer on public.recurring_donor_patterns;
create policy recurring_donor_patterns_delete_writer
  on public.recurring_donor_patterns
  for delete using (public.is_org_treasurer_or_admin(workspace_id));
