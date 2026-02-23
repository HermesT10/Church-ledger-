-- 00005_funds_hardening.sql
-- Production hardening: fix function security, recreate policies, add unique constraint.

-- ============================================================
-- A1. Fix helper function security + search_path + permissions
-- ============================================================

-- Redefine is_org_admin with explicit search_path and restricted execution
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
  );
$$;

revoke all on function public.is_org_admin(uuid) from public;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- Redefine is_org_member with explicit search_path and restricted execution
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
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

-- Redefine is_org_treasurer_or_admin with explicit search_path and restricted execution
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
  );
$$;

revoke all on function public.is_org_treasurer_or_admin(uuid) from public;
grant execute on function public.is_org_treasurer_or_admin(uuid) to authenticated;

-- ============================================================
-- A2. Drop and recreate funds RLS policies with correct clauses
-- ============================================================

drop policy if exists funds_select_member on public.funds;
drop policy if exists funds_insert_treasurer_admin on public.funds;
drop policy if exists funds_update_treasurer_admin on public.funds;
drop policy if exists funds_delete_treasurer_admin on public.funds;

-- SELECT: any org member can read
create policy funds_select_member on public.funds
  for select using (public.is_org_member(organisation_id));

-- INSERT: treasurer or admin
create policy funds_insert_treasurer_admin on public.funds
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

-- UPDATE: treasurer or admin (USING + WITH CHECK)
create policy funds_update_treasurer_admin on public.funds
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

-- DELETE: treasurer or admin
create policy funds_delete_treasurer_admin on public.funds
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

-- ============================================================
-- A3. Add unique constraint for idempotent seeding
-- ============================================================

alter table public.funds
  add constraint funds_org_name_unique unique (organisation_id, name);
