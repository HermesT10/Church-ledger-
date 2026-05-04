alter table public.organisations
  add column if not exists setup_mode boolean not null default true,
  add column if not exists setup_type text not null default 'blank',
  add column if not exists setup_completed_at timestamptz;

alter table public.organisations
  drop constraint if exists organisations_setup_type_check;

alter table public.organisations
  add constraint organisations_setup_type_check
  check (setup_type in ('blank', 'guided', 'import_first'));

create table if not exists public.workspace_setup_progress (
  workspace_id uuid primary key references public.organisations(id) on delete cascade,
  bank_added boolean not null default false,
  statement_uploaded boolean not null default false,
  transactions_categorised boolean not null default false,
  funds_created boolean not null default false,
  reports_viewed boolean not null default false,
  skipped boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_workspace_setup_progress_touch_updated_at
  on public.workspace_setup_progress;
create trigger trg_workspace_setup_progress_touch_updated_at
  before update on public.workspace_setup_progress
  for each row execute function public.touch_updated_at();

create table if not exists public.categorisation_suggestions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  bank_transaction_id uuid references public.bank_lines(id) on delete cascade,
  description_pattern text not null,
  suggested_account_id uuid references public.accounts(id) on delete set null,
  suggested_category_id uuid references public.register_categories(id) on delete set null,
  suggested_category text,
  suggested_supplier_id uuid references public.suppliers(id) on delete set null,
  suggested_supplier text,
  confidence_score numeric(5, 4) not null default 0,
  status text not null default 'pending',
  source text not null default 'bank_import',
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categorisation_suggestions_confidence_check check (confidence_score >= 0 and confidence_score <= 1),
  constraint categorisation_suggestions_status_check check (status in ('pending', 'accepted', 'edited', 'rejected', 'dismissed'))
);

create index if not exists idx_categorisation_suggestions_workspace_status
  on public.categorisation_suggestions (workspace_id, status, created_at desc);

create index if not exists idx_categorisation_suggestions_bank_transaction
  on public.categorisation_suggestions (bank_transaction_id)
  where bank_transaction_id is not null;

drop trigger if exists trg_categorisation_suggestions_touch_updated_at
  on public.categorisation_suggestions;
create trigger trg_categorisation_suggestions_touch_updated_at
  before update on public.categorisation_suggestions
  for each row execute function public.touch_updated_at();

create table if not exists public.bank_transaction_mappings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  match_pattern text not null,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.register_categories(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  confidence numeric(5, 4) not null default 0.75,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_transaction_mappings_confidence_check check (confidence >= 0 and confidence <= 1)
);

create unique index if not exists idx_bank_transaction_mappings_workspace_pattern
  on public.bank_transaction_mappings (workspace_id, lower(match_pattern));

drop trigger if exists trg_bank_transaction_mappings_touch_updated_at
  on public.bank_transaction_mappings;
create trigger trg_bank_transaction_mappings_touch_updated_at
  before update on public.bank_transaction_mappings
  for each row execute function public.touch_updated_at();

alter table public.bank_accounts
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.funds
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.accounts
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.suppliers
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.register_categories
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

update public.bank_accounts
   set is_archived = true
 where status = 'archived' or is_active = false;

update public.funds
   set is_archived = true
 where is_active = false;

update public.accounts
   set is_archived = true
 where is_active = false;

update public.suppliers
   set is_archived = true
 where is_active = false;

update public.register_categories
   set is_archived = true,
       archived_at = coalesce(archived_at, updated_at)
 where status = 'archived';

alter table public.workspace_setup_progress enable row level security;
alter table public.workspace_setup_progress force row level security;
alter table public.categorisation_suggestions enable row level security;
alter table public.categorisation_suggestions force row level security;
alter table public.bank_transaction_mappings enable row level security;
alter table public.bank_transaction_mappings force row level security;

drop policy if exists workspace_setup_progress_select_member on public.workspace_setup_progress;
create policy workspace_setup_progress_select_member
  on public.workspace_setup_progress
  for select using (public.is_org_member(workspace_id));

drop policy if exists workspace_setup_progress_insert_admin on public.workspace_setup_progress;
create policy workspace_setup_progress_insert_admin
  on public.workspace_setup_progress
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists workspace_setup_progress_update_admin on public.workspace_setup_progress;
create policy workspace_setup_progress_update_admin
  on public.workspace_setup_progress
  for update using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists categorisation_suggestions_select_member on public.categorisation_suggestions;
create policy categorisation_suggestions_select_member
  on public.categorisation_suggestions
  for select using (public.is_org_member(workspace_id));

drop policy if exists categorisation_suggestions_insert_admin on public.categorisation_suggestions;
create policy categorisation_suggestions_insert_admin
  on public.categorisation_suggestions
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists categorisation_suggestions_update_admin on public.categorisation_suggestions;
create policy categorisation_suggestions_update_admin
  on public.categorisation_suggestions
  for update using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists categorisation_suggestions_delete_admin on public.categorisation_suggestions;
create policy categorisation_suggestions_delete_admin
  on public.categorisation_suggestions
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists bank_transaction_mappings_select_member on public.bank_transaction_mappings;
create policy bank_transaction_mappings_select_member
  on public.bank_transaction_mappings
  for select using (public.is_org_member(workspace_id));

drop policy if exists bank_transaction_mappings_insert_admin on public.bank_transaction_mappings;
create policy bank_transaction_mappings_insert_admin
  on public.bank_transaction_mappings
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists bank_transaction_mappings_update_admin on public.bank_transaction_mappings;
create policy bank_transaction_mappings_update_admin
  on public.bank_transaction_mappings
  for update using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists bank_transaction_mappings_delete_admin on public.bank_transaction_mappings;
create policy bank_transaction_mappings_delete_admin
  on public.bank_transaction_mappings
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

comment on table public.workspace_setup_progress is
  'Blank-canvas onboarding progress for an organisation/workspace.';

comment on table public.categorisation_suggestions is
  'Bank-import-driven account/category/supplier suggestions awaiting user review.';

comment on table public.bank_transaction_mappings is
  'Workspace-specific remembered bank transaction categorisation mappings.';
