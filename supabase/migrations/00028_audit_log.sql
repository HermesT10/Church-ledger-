-- 00028_audit_log.sql
-- Phase 9.6: Audit log for destructive and significant actions.
-- Immutable, append-only table -- no UPDATE or DELETE policies.

-- ============================================================
-- 1. Create audit_log table
-- ============================================================

create table if not exists public.audit_log (
  id              uuid        primary key default gen_random_uuid(),
  organisation_id uuid        not null references public.organisations(id) on delete cascade,
  user_id         uuid        not null references public.profiles(id),
  action          text        not null,
  entity_type     text,
  entity_id       text,
  metadata        jsonb       not null default '{}'::jsonb,
  environment     text        not null,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- 2. Indexes
-- ============================================================

create index if not exists idx_audit_log_org_created
  on public.audit_log (organisation_id, created_at desc);

create index if not exists idx_audit_log_user
  on public.audit_log (user_id);

-- ============================================================
-- 3. RLS
-- ============================================================

alter table public.audit_log enable row level security;

-- SELECT: admin and treasurer can read audit log
create policy audit_log_select_admin_treasurer on public.audit_log
  for select using (
    public.is_org_treasurer_or_admin(organisation_id)
  );

-- INSERT: admin and treasurer can insert (server actions use admin client,
-- but this policy ensures the standard client can also insert if needed)
create policy audit_log_insert_admin_treasurer on public.audit_log
  for insert with check (
    public.is_org_treasurer_or_admin(organisation_id)
  );

-- No UPDATE or DELETE policies -- audit log is immutable
