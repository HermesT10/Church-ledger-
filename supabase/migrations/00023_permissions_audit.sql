-- 00023_permissions_audit.sql
-- Phase 9.1: Permissions & RLS audit
-- Adds auditor time-limited access via expires_at on memberships,
-- hardens is_org_member to check expiry, adds is_org_auditor helper.

-- ============================================================
-- 1. Add expires_at column to memberships
-- ============================================================

alter table public.memberships
  add column if not exists expires_at timestamptz;

comment on column public.memberships.expires_at is
  'Optional expiry timestamp. When set and past, the user loses all access. Primarily used for auditor time-limited access.';

-- ============================================================
-- 2. Harden is_org_member to reject expired memberships
-- ============================================================

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships
    where organisation_id = org_id
      and user_id = auth.uid()
      and (expires_at is null or expires_at > now())
  );
$$;

-- Preserve existing grants
revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

-- ============================================================
-- 3. Harden is_org_admin to reject expired memberships
-- ============================================================

create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships
    where organisation_id = org_id
      and user_id = auth.uid()
      and role = 'admin'
      and (expires_at is null or expires_at > now())
  );
$$;

revoke all on function public.is_org_admin(uuid) from public;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- ============================================================
-- 4. Harden is_org_treasurer_or_admin to reject expired memberships
-- ============================================================

create or replace function public.is_org_treasurer_or_admin(org_id uuid)
returns boolean
language sql stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships
    where organisation_id = org_id
      and user_id = auth.uid()
      and role in ('admin', 'treasurer')
      and (expires_at is null or expires_at > now())
  );
$$;

revoke all on function public.is_org_treasurer_or_admin(uuid) from public;
grant execute on function public.is_org_treasurer_or_admin(uuid) to authenticated;

-- ============================================================
-- 5. New helper: is_org_auditor (non-expired auditor)
-- ============================================================

create or replace function public.is_org_auditor(org_id uuid)
returns boolean
language sql stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships
    where organisation_id = org_id
      and user_id = auth.uid()
      and role = 'auditor'
      and (expires_at is null or expires_at > now())
  );
$$;

revoke all on function public.is_org_auditor(uuid) from public;
grant execute on function public.is_org_auditor(uuid) to authenticated;
