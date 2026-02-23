-- 00019_giving_platforms.sql
-- Giving platform configuration: maps payment providers to clearing
-- and fee accounts for automated donation import processing.

-- ============================================================
-- 1. Giving Platforms table
-- ============================================================

create table if not exists public.giving_platforms (
  id                  uuid        primary key default gen_random_uuid(),
  organisation_id     uuid        not null references public.organisations(id) on delete cascade,
  provider            text        not null,
  clearing_account_id uuid        not null references public.accounts(id),
  fee_account_id      uuid        not null references public.accounts(id),
  is_active           boolean     not null default true,
  created_at          timestamptz not null default now(),

  constraint gp_provider_valid check (provider in ('gocardless', 'sumup', 'izettle')),
  unique (organisation_id, provider)
);

-- ============================================================
-- 2. Indexes
-- ============================================================

create index if not exists idx_giving_platforms_organisation_id
  on public.giving_platforms (organisation_id);

-- ============================================================
-- 3. Enable RLS
-- ============================================================

alter table public.giving_platforms enable row level security;

-- ============================================================
-- 4. RLS Policies
-- ============================================================

-- SELECT: any org member
create policy gp_select_member on public.giving_platforms
  for select using (public.is_org_member(organisation_id));

-- INSERT: treasurer/admin
create policy gp_insert_treasurer_admin on public.giving_platforms
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

-- UPDATE: treasurer/admin
create policy gp_update_treasurer_admin on public.giving_platforms
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

-- DELETE: treasurer/admin
create policy gp_delete_treasurer_admin on public.giving_platforms
  for delete using (public.is_org_treasurer_or_admin(organisation_id));
