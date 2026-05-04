-- User portal invite and permission foundation
-- Hardens legacy organisation_invites by moving new flows to hashed tokens,
-- explicit invite codes, statuses, and portal permission scopes.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Permission presets and per-user portal scopes
-- ---------------------------------------------------------------------

create table if not exists public.portal_permission_presets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  description text,
  role public.user_role not null default 'viewer',
  permissions jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_permission_presets_name_not_empty check (length(trim(name)) > 0),
  constraint portal_permission_presets_permissions_object check (jsonb_typeof(permissions) = 'object'),
  unique (workspace_id, name)
);

create table if not exists public.portal_user_permissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  membership_id uuid references public.memberships(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  permission_preset_id uuid references public.portal_permission_presets(id) on delete set null,
  permissions jsonb not null default '{}'::jsonb,
  assigned_budget_ids uuid[] not null default '{}'::uuid[],
  assigned_fund_ids uuid[] not null default '{}'::uuid[],
  linked_bank_account_ids uuid[] not null default '{}'::uuid[],
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_user_permissions_subject check (membership_id is not null or employee_id is not null or user_id is not null),
  constraint portal_user_permissions_permissions_object check (jsonb_typeof(permissions) = 'object')
);

create unique index if not exists idx_portal_user_permissions_membership
  on public.portal_user_permissions (workspace_id, membership_id)
  where membership_id is not null;

create unique index if not exists idx_portal_user_permissions_employee
  on public.portal_user_permissions (workspace_id, employee_id)
  where employee_id is not null and membership_id is null;

create index if not exists idx_portal_permission_presets_workspace
  on public.portal_permission_presets (workspace_id);

create index if not exists idx_portal_user_permissions_workspace
  on public.portal_user_permissions (workspace_id);

create index if not exists idx_portal_user_permissions_user
  on public.portal_user_permissions (user_id)
  where user_id is not null;

alter table public.portal_permission_presets enable row level security;
alter table public.portal_user_permissions enable row level security;

drop policy if exists portal_permission_presets_select_admin on public.portal_permission_presets;
create policy portal_permission_presets_select_admin on public.portal_permission_presets
  for select using (public.is_org_admin(workspace_id));

drop policy if exists portal_permission_presets_insert_admin on public.portal_permission_presets;
create policy portal_permission_presets_insert_admin on public.portal_permission_presets
  for insert with check (public.is_org_admin(workspace_id));

drop policy if exists portal_permission_presets_update_admin on public.portal_permission_presets;
create policy portal_permission_presets_update_admin on public.portal_permission_presets
  for update using (public.is_org_admin(workspace_id))
  with check (public.is_org_admin(workspace_id));

drop policy if exists portal_permission_presets_delete_admin on public.portal_permission_presets;
create policy portal_permission_presets_delete_admin on public.portal_permission_presets
  for delete using (public.is_org_admin(workspace_id));

drop policy if exists portal_user_permissions_select_admin on public.portal_user_permissions;
create policy portal_user_permissions_select_admin on public.portal_user_permissions
  for select using (public.is_org_admin(workspace_id));

drop policy if exists portal_user_permissions_insert_admin on public.portal_user_permissions;
create policy portal_user_permissions_insert_admin on public.portal_user_permissions
  for insert with check (public.is_org_admin(workspace_id));

drop policy if exists portal_user_permissions_update_admin on public.portal_user_permissions;
create policy portal_user_permissions_update_admin on public.portal_user_permissions
  for update using (public.is_org_admin(workspace_id))
  with check (public.is_org_admin(workspace_id));

drop policy if exists portal_user_permissions_delete_admin on public.portal_user_permissions;
create policy portal_user_permissions_delete_admin on public.portal_user_permissions
  for delete using (public.is_org_admin(workspace_id));

drop trigger if exists trg_portal_permission_presets_touch_updated_at on public.portal_permission_presets;
create trigger trg_portal_permission_presets_touch_updated_at
  before update on public.portal_permission_presets
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_portal_user_permissions_touch_updated_at on public.portal_user_permissions;
create trigger trg_portal_user_permissions_touch_updated_at
  before update on public.portal_user_permissions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Harden organisation_invites while preserving legacy columns.
-- ---------------------------------------------------------------------

alter table public.organisation_invites
  add column if not exists workspace_id uuid references public.organisations(id) on delete cascade,
  add column if not exists invited_email text,
  add column if not exists invited_full_name text,
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists invite_code text,
  add column if not exists token_hash text,
  add column if not exists permission_preset_id uuid references public.portal_permission_presets(id) on delete set null,
  add column if not exists status text not null default 'sent',
  add column if not exists accepted_by uuid references public.profiles(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.organisation_invites
set
  workspace_id = coalesce(workspace_id, organisation_id),
  invited_email = coalesce(invited_email, email),
  invite_code = coalesce(invite_code, 'INV-' || upper(substr(replace(id::text, '-', ''), 1, 6))),
  token_hash = coalesce(token_hash, case when token is not null then encode(extensions.digest(token, 'sha256'), 'hex') else null end),
  status = case
    when revoked_at is not null then 'revoked'
    when accepted_at is not null then 'accepted'
    when expires_at <= now() then 'expired'
    else status
  end;

alter table public.organisation_invites
  alter column workspace_id set not null,
  alter column invited_email set not null,
  alter column invite_code set not null;

alter table public.organisation_invites
  alter column token drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organisation_invites_status_check'
  ) then
    alter table public.organisation_invites
      add constraint organisation_invites_status_check
      check (status in ('draft', 'sent', 'accepted', 'expired', 'revoked'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organisation_invites_token_hash_check'
  ) then
    alter table public.organisation_invites
      add constraint organisation_invites_token_hash_check
      check (token_hash is null or token_hash ~ '^[a-f0-9]{64}$');
  end if;
end $$;

alter table public.organisation_invites
  drop constraint if exists organisation_invites_organisation_id_email_key;

create unique index if not exists idx_organisation_invites_workspace_email_pending
  on public.organisation_invites (workspace_id, lower(invited_email))
  where status in ('draft', 'sent');

create unique index if not exists idx_organisation_invites_token_hash
  on public.organisation_invites (token_hash)
  where token_hash is not null and status in ('draft', 'sent');

create index if not exists idx_organisation_invites_workspace_status
  on public.organisation_invites (workspace_id, status, created_at desc);

create index if not exists idx_organisation_invites_employee
  on public.organisation_invites (employee_id)
  where employee_id is not null;

drop trigger if exists trg_organisation_invites_touch_updated_at on public.organisation_invites;
create trigger trg_organisation_invites_touch_updated_at
  before update on public.organisation_invites
  for each row execute function public.touch_updated_at();

drop policy if exists invites_select on public.organisation_invites;
drop policy if exists invites_insert on public.organisation_invites;
drop policy if exists invites_delete on public.organisation_invites;
drop policy if exists invites_update on public.organisation_invites;

create policy invites_select_admin on public.organisation_invites
  for select using (public.is_org_admin(workspace_id));

create policy invites_insert_admin on public.organisation_invites
  for insert with check (public.is_org_admin(workspace_id));

create policy invites_update_admin on public.organisation_invites
  for update using (public.is_org_admin(workspace_id))
  with check (public.is_org_admin(workspace_id));

create policy invites_delete_admin on public.organisation_invites
  for delete using (public.is_org_admin(workspace_id));
