-- User portal permissions phase 2: typed presets, assignments, and RLS.

-- ---------------------------------------------------------------------
-- Portal permission preset evolution
-- ---------------------------------------------------------------------

alter table public.portal_permission_presets
  alter column workspace_id drop not null,
  add column if not exists is_system_preset boolean not null default false;

alter table public.portal_permission_presets
  drop constraint if exists portal_permission_presets_workspace_id_name_key;

create unique index if not exists idx_portal_permission_presets_workspace_name
  on public.portal_permission_presets (workspace_id, name)
  where workspace_id is not null;

create unique index if not exists idx_portal_permission_presets_system_name
  on public.portal_permission_presets (name)
  where is_system_preset and workspace_id is null;

drop policy if exists portal_permission_presets_select_admin on public.portal_permission_presets;
create policy portal_permission_presets_select_admin on public.portal_permission_presets
  for select using (
    is_system_preset
    or (workspace_id is not null and public.is_org_admin(workspace_id))
  );

drop policy if exists portal_permission_presets_insert_admin on public.portal_permission_presets;
create policy portal_permission_presets_insert_admin on public.portal_permission_presets
  for insert with check (
    workspace_id is not null
    and not is_system_preset
    and public.is_org_admin(workspace_id)
  );

drop policy if exists portal_permission_presets_update_admin on public.portal_permission_presets;
create policy portal_permission_presets_update_admin on public.portal_permission_presets
  for update using (
    workspace_id is not null
    and not is_system_preset
    and public.is_org_admin(workspace_id)
  )
  with check (
    workspace_id is not null
    and not is_system_preset
    and public.is_org_admin(workspace_id)
  );

drop policy if exists portal_permission_presets_delete_admin on public.portal_permission_presets;
create policy portal_permission_presets_delete_admin on public.portal_permission_presets
  for delete using (
    workspace_id is not null
    and not is_system_preset
    and public.is_org_admin(workspace_id)
  );

insert into public.portal_permission_presets (
  workspace_id,
  name,
  description,
  role,
  permissions,
  is_system_preset,
  created_by
)
values
  (null, 'Youth Leader', 'Submit youth ministry invoices, calendar items, and assigned budget activity.', 'viewer', '{"pages":{"dashboard":true,"budgets":true,"submit_invoices":true,"cash_collections":false,"expenses":false,"calendar":true,"restricted_funds":false,"income_register":false,"expense_register":false,"documents":true},"actions":{"view":true,"create":true,"edit_own":true,"edit_all":false,"submit":true,"approve":false,"upload":true,"comment":true,"delete_own":false},"scopes":{"all_workspace":false,"assigned_budgets":true,"assigned_funds":false,"assigned_categories":true,"own_records":true}}'::jsonb, true, null),
  (null, 'Cafe Lead', 'Manage cafe cash collections and assigned cafe budget submissions.', 'viewer', '{"pages":{"dashboard":true,"budgets":true,"submit_invoices":true,"cash_collections":true,"expenses":false,"calendar":true,"restricted_funds":false,"income_register":false,"expense_register":false,"documents":true},"actions":{"view":true,"create":true,"edit_own":true,"edit_all":false,"submit":true,"approve":false,"upload":true,"comment":true,"delete_own":false},"scopes":{"all_workspace":false,"assigned_budgets":true,"assigned_funds":true,"assigned_categories":true,"own_records":true}}'::jsonb, true, null),
  (null, 'Maintenance Lead', 'Submit maintenance expenses against assigned categories and budgets.', 'viewer', '{"pages":{"dashboard":true,"budgets":true,"submit_invoices":true,"cash_collections":false,"expenses":true,"calendar":true,"restricted_funds":false,"income_register":false,"expense_register":false,"documents":true},"actions":{"view":true,"create":true,"edit_own":true,"edit_all":false,"submit":true,"approve":false,"upload":true,"comment":true,"delete_own":false},"scopes":{"all_workspace":false,"assigned_budgets":true,"assigned_funds":false,"assigned_categories":true,"own_records":true}}'::jsonb, true, null),
  (null, 'Cash Counter', 'Record and upload evidence for cash collections only.', 'viewer', '{"pages":{"dashboard":true,"budgets":false,"submit_invoices":false,"cash_collections":true,"expenses":false,"calendar":false,"restricted_funds":false,"income_register":false,"expense_register":false,"documents":true},"actions":{"view":true,"create":true,"edit_own":true,"edit_all":false,"submit":true,"approve":false,"upload":true,"comment":true,"delete_own":false},"scopes":{"all_workspace":false,"assigned_budgets":false,"assigned_funds":false,"assigned_categories":false,"own_records":true}}'::jsonb, true, null),
  (null, 'Trustee Viewer', 'Read-only trustee access across dashboard, reports, funds, and registers.', 'trustee_viewer', '{"pages":{"dashboard":true,"budgets":true,"submit_invoices":false,"cash_collections":true,"expenses":true,"calendar":true,"restricted_funds":true,"income_register":true,"expense_register":true,"documents":true},"actions":{"view":true,"create":false,"edit_own":false,"edit_all":false,"submit":false,"approve":false,"upload":false,"comment":true,"delete_own":false},"scopes":{"all_workspace":true,"assigned_budgets":false,"assigned_funds":false,"assigned_categories":false,"own_records":false}}'::jsonb, true, null),
  (null, 'Finance Assistant', 'Operational finance access without approval powers.', 'finance_user', '{"pages":{"dashboard":true,"budgets":true,"submit_invoices":true,"cash_collections":true,"expenses":true,"calendar":true,"restricted_funds":true,"income_register":true,"expense_register":true,"documents":true},"actions":{"view":true,"create":true,"edit_own":true,"edit_all":true,"submit":true,"approve":false,"upload":true,"comment":true,"delete_own":true},"scopes":{"all_workspace":true,"assigned_budgets":false,"assigned_funds":false,"assigned_categories":false,"own_records":false}}'::jsonb, true, null),
  (null, 'Read Only User', 'Basic read-only portal access for assigned areas.', 'viewer', '{"pages":{"dashboard":true,"budgets":false,"submit_invoices":false,"cash_collections":false,"expenses":false,"calendar":true,"restricted_funds":false,"income_register":false,"expense_register":false,"documents":true},"actions":{"view":true,"create":false,"edit_own":false,"edit_all":false,"submit":false,"approve":false,"upload":false,"comment":false,"delete_own":false},"scopes":{"all_workspace":false,"assigned_budgets":true,"assigned_funds":true,"assigned_categories":true,"own_records":true}}'::jsonb, true, null)
on conflict do nothing;

-- Keep employee-only draft rows valid before an invite is accepted, but make
-- user-backed rows unique for enforcement.
create unique index if not exists idx_portal_user_permissions_workspace_user
  on public.portal_user_permissions (workspace_id, user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------
-- Assignment tables
-- ---------------------------------------------------------------------

create table if not exists public.user_budget_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  budget_category_id uuid,
  can_view boolean not null default true,
  can_submit_against boolean not null default false,
  spending_limit bigint,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint user_budget_assignments_limit_non_negative check (spending_limit is null or spending_limit >= 0)
);

create table if not exists public.user_fund_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  fund_id uuid not null references public.funds(id) on delete cascade,
  can_view boolean not null default true,
  can_submit_against boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_category_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null,
  can_view boolean not null default true,
  can_submit_against boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_card_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  card_name text not null,
  last_four text,
  spending_limit bigint,
  status text not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_card_assignments_name_not_empty check (length(trim(card_name)) > 0),
  constraint user_card_assignments_last_four_check check (last_four is null or last_four ~ '^[0-9]{4}$'),
  constraint user_card_assignments_limit_non_negative check (spending_limit is null or spending_limit >= 0),
  constraint user_card_assignments_status_check check (status in ('active', 'inactive', 'archived'))
);

create unique index if not exists idx_user_budget_assignments_unique
  on public.user_budget_assignments (workspace_id, user_id, budget_id, coalesce(budget_category_id, '00000000-0000-0000-0000-000000000000'::uuid));

create unique index if not exists idx_user_fund_assignments_unique
  on public.user_fund_assignments (workspace_id, user_id, fund_id);

create unique index if not exists idx_user_category_assignments_unique
  on public.user_category_assignments (workspace_id, user_id, category_id);

create index if not exists idx_user_card_assignments_user_status
  on public.user_card_assignments (workspace_id, user_id, status);

alter table public.user_budget_assignments enable row level security;
alter table public.user_fund_assignments enable row level security;
alter table public.user_category_assignments enable row level security;
alter table public.user_card_assignments enable row level security;

drop trigger if exists trg_user_card_assignments_touch_updated_at on public.user_card_assignments;
create trigger trg_user_card_assignments_touch_updated_at
  before update on public.user_card_assignments
  for each row execute function public.touch_updated_at();

-- Admins manage assignments; assigned users can read their own rows.
drop policy if exists user_budget_assignments_select on public.user_budget_assignments;
drop policy if exists user_budget_assignments_insert_admin on public.user_budget_assignments;
drop policy if exists user_budget_assignments_update_admin on public.user_budget_assignments;
drop policy if exists user_budget_assignments_delete_admin on public.user_budget_assignments;
drop policy if exists user_fund_assignments_select on public.user_fund_assignments;
drop policy if exists user_fund_assignments_insert_admin on public.user_fund_assignments;
drop policy if exists user_fund_assignments_update_admin on public.user_fund_assignments;
drop policy if exists user_fund_assignments_delete_admin on public.user_fund_assignments;
drop policy if exists user_category_assignments_select on public.user_category_assignments;
drop policy if exists user_category_assignments_insert_admin on public.user_category_assignments;
drop policy if exists user_category_assignments_update_admin on public.user_category_assignments;
drop policy if exists user_category_assignments_delete_admin on public.user_category_assignments;
drop policy if exists user_card_assignments_select on public.user_card_assignments;
drop policy if exists user_card_assignments_insert_admin on public.user_card_assignments;
drop policy if exists user_card_assignments_update_admin on public.user_card_assignments;
drop policy if exists user_card_assignments_delete_admin on public.user_card_assignments;

create policy user_budget_assignments_select on public.user_budget_assignments
  for select using (public.is_org_admin(workspace_id) or user_id = auth.uid());
create policy user_budget_assignments_insert_admin on public.user_budget_assignments
  for insert with check (public.is_org_admin(workspace_id));
create policy user_budget_assignments_update_admin on public.user_budget_assignments
  for update using (public.is_org_admin(workspace_id)) with check (public.is_org_admin(workspace_id));
create policy user_budget_assignments_delete_admin on public.user_budget_assignments
  for delete using (public.is_org_admin(workspace_id));

create policy user_fund_assignments_select on public.user_fund_assignments
  for select using (public.is_org_admin(workspace_id) or user_id = auth.uid());
create policy user_fund_assignments_insert_admin on public.user_fund_assignments
  for insert with check (public.is_org_admin(workspace_id));
create policy user_fund_assignments_update_admin on public.user_fund_assignments
  for update using (public.is_org_admin(workspace_id)) with check (public.is_org_admin(workspace_id));
create policy user_fund_assignments_delete_admin on public.user_fund_assignments
  for delete using (public.is_org_admin(workspace_id));

create policy user_category_assignments_select on public.user_category_assignments
  for select using (public.is_org_admin(workspace_id) or user_id = auth.uid());
create policy user_category_assignments_insert_admin on public.user_category_assignments
  for insert with check (public.is_org_admin(workspace_id));
create policy user_category_assignments_update_admin on public.user_category_assignments
  for update using (public.is_org_admin(workspace_id)) with check (public.is_org_admin(workspace_id));
create policy user_category_assignments_delete_admin on public.user_category_assignments
  for delete using (public.is_org_admin(workspace_id));

create policy user_card_assignments_select on public.user_card_assignments
  for select using (public.is_org_admin(workspace_id) or user_id = auth.uid());
create policy user_card_assignments_insert_admin on public.user_card_assignments
  for insert with check (public.is_org_admin(workspace_id));
create policy user_card_assignments_update_admin on public.user_card_assignments
  for update using (public.is_org_admin(workspace_id)) with check (public.is_org_admin(workspace_id));
create policy user_card_assignments_delete_admin on public.user_card_assignments
  for delete using (public.is_org_admin(workspace_id));
