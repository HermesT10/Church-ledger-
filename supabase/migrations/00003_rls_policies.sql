-- 00003_rls_policies.sql
-- Enable RLS on all tables, create helper functions, and add policies.

-- ============================================================
-- 1. Helper functions (security definer to avoid RLS recursion)
-- ============================================================

-- Returns true if the current user is an admin of the given organisation.
create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql
security definer set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.memberships
    where organisation_id = org_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

-- Returns true if the current user has any membership in the given organisation.
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.memberships
    where organisation_id = org_id
      and user_id = auth.uid()
  );
$$;

-- ============================================================
-- 2. Enable RLS
-- ============================================================

alter table public.profiles      enable row level security;
alter table public.organisations  enable row level security;
alter table public.memberships    enable row level security;

-- ============================================================
-- 3. Profiles policies
-- ============================================================

-- Users can read their own profile
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

-- Users can update their own profile
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid());

-- ============================================================
-- 4. Memberships policies
-- ============================================================

-- Users can read their own memberships
create policy memberships_select_own on public.memberships
  for select using (user_id = auth.uid());

-- Org admins can add members
create policy memberships_insert_admin on public.memberships
  for insert with check (public.is_org_admin(organisation_id));

-- Bootstrap: a user can insert themselves as the first member of a new org
create policy memberships_insert_self_first on public.memberships
  for insert with check (
    user_id = auth.uid()
    and not exists (
      select 1
      from public.memberships m
      where m.organisation_id = organisation_id
    )
  );

-- Org admins can update memberships
create policy memberships_update_admin on public.memberships
  for update using (public.is_org_admin(organisation_id));

-- Org admins can delete memberships
create policy memberships_delete_admin on public.memberships
  for delete using (public.is_org_admin(organisation_id));

-- ============================================================
-- 5. Organisations policies
-- ============================================================

-- Members can read their own organisations
create policy organisations_select_member on public.organisations
  for select using (public.is_org_member(id));

-- Any authenticated user can create an organisation (needed for onboarding)
create policy organisations_insert_authenticated on public.organisations
  for insert with check (auth.uid() is not null);

-- Only admins can update an organisation
create policy organisations_update_admin on public.organisations
  for update using (public.is_org_admin(id));
