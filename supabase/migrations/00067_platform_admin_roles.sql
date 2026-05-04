-- 00067_platform_admin_roles.sql
-- Database-backed platform admin allowlist for support/internal tooling.

create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  disabled_at timestamptz,
  notes text
);

alter table public.platform_admins enable row level security;

drop policy if exists platform_admins_select_self on public.platform_admins;
create policy platform_admins_select_self
  on public.platform_admins
  for select
  using (user_id = auth.uid());

comment on table public.platform_admins is
  'Database-backed platform-level support/admin roles. Internal tools should prefer this over email-only checks.';
