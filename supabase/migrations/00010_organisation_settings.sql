-- 00010_organisation_settings.sql
-- Organisation-level settings (overspend alert thresholds, etc.)

-- ============================================================
-- 1. Table
-- ============================================================

create table if not exists public.organisation_settings (
  organisation_id       uuid        primary key references public.organisations(id) on delete cascade,
  overspend_amount_pence bigint     not null default 5000,
  overspend_percent     int         not null default 20,
  created_at            timestamptz not null default now()
);

-- ============================================================
-- 2. Enable RLS
-- ============================================================

alter table public.organisation_settings enable row level security;

-- ============================================================
-- 3. RLS Policies
-- ============================================================

-- SELECT: any org member
create policy org_settings_select_member on public.organisation_settings
  for select using (public.is_org_member(organisation_id));

-- INSERT: treasurer or admin
create policy org_settings_insert_ta on public.organisation_settings
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

-- UPDATE: treasurer or admin
create policy org_settings_update_ta on public.organisation_settings
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

-- DELETE: treasurer or admin
create policy org_settings_delete_ta on public.organisation_settings
  for delete using (public.is_org_treasurer_or_admin(organisation_id));
