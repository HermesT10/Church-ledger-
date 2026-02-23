-- 00021_bank_reconciliation.sql
-- General-purpose bank line ↔ journal matching for reconciliation,
-- with support for payout-specific and manual match types.

-- ============================================================
-- 1. Bank Reconciliation Matches table
-- ============================================================

create table if not exists public.bank_reconciliation_matches (
  id              uuid        primary key default gen_random_uuid(),
  organisation_id uuid        not null references public.organisations(id) on delete cascade,
  bank_line_id    uuid        not null references public.bank_lines(id) on delete cascade,
  journal_id      uuid        not null references public.journals(id) on delete cascade,
  match_type      text        not null default 'manual',
  provider        text,
  matched_by      uuid        references public.profiles(id),
  created_at      timestamptz not null default now(),

  -- Each bank line can only be matched once
  unique (bank_line_id),

  -- Valid match types
  constraint brm_match_type_valid check (match_type in ('manual', 'payout', 'auto'))
);

-- ============================================================
-- 2. Indexes
-- ============================================================

create index if not exists idx_brm_org
  on public.bank_reconciliation_matches (organisation_id);

create index if not exists idx_brm_journal
  on public.bank_reconciliation_matches (journal_id);

create index if not exists idx_brm_bank_line
  on public.bank_reconciliation_matches (bank_line_id);

-- ============================================================
-- 3. Enable RLS
-- ============================================================

alter table public.bank_reconciliation_matches enable row level security;

-- ============================================================
-- 4. RLS Policies
-- ============================================================

create policy brm_select_member on public.bank_reconciliation_matches
  for select using (public.is_org_member(organisation_id));

create policy brm_insert_treasurer_admin on public.bank_reconciliation_matches
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy brm_update_treasurer_admin on public.bank_reconciliation_matches
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy brm_delete_treasurer_admin on public.bank_reconciliation_matches
  for delete using (public.is_org_treasurer_or_admin(organisation_id));
