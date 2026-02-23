-- 00004_funds.sql
-- Fund type enum, funds table, helper function, and RLS policies

-- 1. Enum: fund types
create type public.fund_type as enum (
  'restricted',
  'unrestricted',
  'designated'
);

-- 2. Funds table
create table public.funds (
  id              uuid          primary key default gen_random_uuid(),
  organisation_id uuid          not null references public.organisations(id) on delete cascade,
  name            text          not null,
  type            public.fund_type not null,
  purpose_text    text,
  is_active       boolean       not null default true,
  created_at      timestamptz   not null default now()
);

-- 3. Helper: treasurer or admin check
create or replace function public.is_org_treasurer_or_admin(org_id uuid)
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
      and role in ('admin', 'treasurer')
  );
$$;

-- 4. Enable RLS
alter table public.funds enable row level security;

-- 5. Policies
-- Any org member can read funds
create policy funds_select_member on public.funds
  for select using (public.is_org_member(organisation_id));

-- Treasurer or admin can insert funds
create policy funds_insert_treasurer_admin on public.funds
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

-- Treasurer or admin can update funds
create policy funds_update_treasurer_admin on public.funds
  for update using (public.is_org_treasurer_or_admin(organisation_id));

-- Treasurer or admin can delete funds
create policy funds_delete_treasurer_admin on public.funds
  for delete using (public.is_org_treasurer_or_admin(organisation_id));
