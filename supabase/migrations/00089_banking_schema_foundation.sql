-- 00089_banking_schema_foundation.sql
-- Banking schema foundation upgrade.
--
-- Product specs use workspace_id. This codebase historically uses organisation_id
-- for the same tenant boundary, so existing banking tables keep organisation_id
-- and gain workspace_id compatibility columns kept in sync by triggers.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Tenant sync helpers for legacy banking tables
-- ---------------------------------------------------------------------------

create or replace function public.sync_workspace_and_organisation_ids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.workspace_id is null and new.organisation_id is not null then
    new.workspace_id := new.organisation_id;
  end if;

  if new.organisation_id is null and new.workspace_id is not null then
    new.organisation_id := new.workspace_id;
  end if;

  if new.workspace_id is distinct from new.organisation_id then
    raise exception 'workspace_id and organisation_id must match.';
  end if;

  return new;
end;
$$;

revoke all on function public.sync_workspace_and_organisation_ids() from public;

-- ---------------------------------------------------------------------------
-- 2. bank_accounts: production metadata, account types, archive status
-- ---------------------------------------------------------------------------

alter table public.bank_accounts
  add column if not exists workspace_id uuid references public.organisations(id) on delete cascade,
  add column if not exists account_type text not null default 'current',
  add column if not exists bank_name text,
  add column if not exists masked_account_number text,
  add column if not exists opening_balance numeric(14, 2) not null default 0,
  add column if not exists opening_balance_date date,
  add column if not exists status text not null default 'active',
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz;

update public.bank_accounts
   set workspace_id = organisation_id
 where workspace_id is null;

update public.bank_accounts
   set status = case when is_active then 'active' else 'archived' end
 where status is null or status not in ('active', 'archived');

update public.bank_accounts
   set masked_account_number = case
       when masked_account_number is null and account_number_last4 is not null
         then '****' || account_number_last4
       else masked_account_number
     end;

alter table public.bank_accounts
  alter column workspace_id set not null;

do $$ begin
  alter table public.bank_accounts
    add constraint bank_accounts_account_type_check
    check (account_type in ('current', 'savings', 'credit_card', 'loan', 'cash', 'clearing'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.bank_accounts
    add constraint bank_accounts_status_check
    check (status in ('active', 'archived'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_bank_accounts_workspace_status
  on public.bank_accounts (workspace_id, status);

create index if not exists idx_bank_accounts_workspace_type
  on public.bank_accounts (workspace_id, account_type);

drop trigger if exists trg_bank_accounts_sync_tenant on public.bank_accounts;
create trigger trg_bank_accounts_sync_tenant
  before insert or update on public.bank_accounts
  for each row execute function public.sync_workspace_and_organisation_ids();

drop trigger if exists trg_bank_accounts_touch_updated_at on public.bank_accounts;
create trigger trg_bank_accounts_touch_updated_at
  before update on public.bank_accounts
  for each row execute function public.touch_updated_at();

create or replace function public.sync_bank_account_status_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is null then
    new.status := case when coalesce(new.is_active, true) then 'active' else 'archived' end;
  end if;

  if new.status = 'archived' then
    new.is_active := false;
    new.archived_at := coalesce(new.archived_at, now());
  else
    new.is_active := true;
    new.archived_at := null;
  end if;

  if new.masked_account_number is null and new.account_number_last4 is not null then
    new.masked_account_number := '****' || new.account_number_last4;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_bank_account_status_fields() from public;

drop trigger if exists trg_bank_accounts_sync_status on public.bank_accounts;
create trigger trg_bank_accounts_sync_status
  before insert or update on public.bank_accounts
  for each row execute function public.sync_bank_account_status_fields();

-- ---------------------------------------------------------------------------
-- 3. Statement import headers and reusable import mappings
-- ---------------------------------------------------------------------------

create table if not exists public.bank_statement_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text not null,
  file_hash text not null,
  status text not null default 'uploaded'
    check (status in (
      'uploaded',
      'parsing',
      'needs_mapping',
      'ready_to_import',
      'imported',
      'partially_imported',
      'failed',
      'voided'
    )),
  statement_start_date date,
  statement_end_date date,
  opening_balance numeric(14, 2),
  closing_balance numeric(14, 2),
  rows_detected integer not null default 0 check (rows_detected >= 0),
  rows_imported integer not null default 0 check (rows_imported >= 0),
  duplicates_skipped integer not null default 0 check (duplicates_skipped >= 0),
  errors_count integer not null default 0 check (errors_count >= 0),
  parse_errors jsonb,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_statement_imports_dates_valid
    check (statement_end_date is null or statement_start_date is null or statement_end_date >= statement_start_date),
  constraint bank_statement_imports_file_path_unique unique (file_path)
);

create unique index if not exists idx_bank_statement_imports_workspace_account_hash
  on public.bank_statement_imports (workspace_id, bank_account_id, file_hash);

create index if not exists idx_bank_statement_imports_workspace_status
  on public.bank_statement_imports (workspace_id, status, uploaded_at desc);

create index if not exists idx_bank_statement_imports_account_uploaded
  on public.bank_statement_imports (bank_account_id, uploaded_at desc);

drop trigger if exists trg_bank_statement_imports_touch_updated_at on public.bank_statement_imports;
create trigger trg_bank_statement_imports_touch_updated_at
  before update on public.bank_statement_imports
  for each row execute function public.touch_updated_at();

create table if not exists public.bank_import_mappings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  bank_name text,
  file_type text not null,
  mapping_name text not null,
  date_column text not null,
  description_column text not null,
  reference_column text,
  money_in_column text,
  money_out_column text,
  amount_column text,
  balance_column text,
  date_format text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_import_mappings_amount_source_check
    check (amount_column is not null or money_in_column is not null or money_out_column is not null),
  constraint bank_import_mappings_name_unique unique (workspace_id, mapping_name)
);

create index if not exists idx_bank_import_mappings_workspace_file_type
  on public.bank_import_mappings (workspace_id, file_type);

drop trigger if exists trg_bank_import_mappings_touch_updated_at on public.bank_import_mappings;
create trigger trg_bank_import_mappings_touch_updated_at
  before update on public.bank_import_mappings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. bank_lines as current bank transaction table, with compatibility fields
-- ---------------------------------------------------------------------------

alter table public.bank_lines
  add column if not exists workspace_id uuid references public.organisations(id) on delete cascade,
  add column if not exists statement_import_id uuid references public.bank_statement_imports(id) on delete set null,
  add column if not exists transaction_date date,
  add column if not exists amount numeric(14, 2),
  add column if not exists direction text,
  add column if not exists money_in numeric(14, 2),
  add column if not exists money_out numeric(14, 2),
  add column if not exists running_balance numeric(14, 2),
  add column if not exists status text not null default 'unmatched',
  add column if not exists matched_source_type text,
  add column if not exists matched_source_id uuid,
  add column if not exists posted_journal_id uuid references public.journals(id) on delete set null,
  add column if not exists reconciled_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.bank_lines
   set workspace_id = organisation_id
 where workspace_id is null;

update public.bank_lines
   set transaction_date = txn_date
 where transaction_date is null;

update public.bank_lines
   set amount = round((amount_pence::numeric / 100), 2),
       direction = case when amount_pence >= 0 then 'in' else 'out' end,
       money_in = case when amount_pence >= 0 then round((amount_pence::numeric / 100), 2) else null end,
       money_out = case when amount_pence < 0 then round((abs(amount_pence)::numeric / 100), 2) else null end,
       running_balance = case when balance_pence is not null then round((balance_pence::numeric / 100), 2) else running_balance end
 where amount is null
    or direction is null
    or (balance_pence is not null and running_balance is null);

update public.bank_lines
   set status = case
       when reconciled then 'reconciled'
       when allocated then 'matched'
       else status
     end
 where status = 'unmatched';

alter table public.bank_lines
  alter column workspace_id set not null;

do $$ begin
  alter table public.bank_lines
    add constraint bank_lines_direction_check
    check (direction is null or direction in ('in', 'out'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.bank_lines
    add constraint bank_lines_status_check
    check (status in (
      'unmatched',
      'suggested_match',
      'matched',
      'reconciled',
      'excluded',
      'duplicate',
      'needs_review'
    ));
exception when duplicate_object then null;
end $$;

create index if not exists idx_bank_lines_workspace_status_date
  on public.bank_lines (workspace_id, status, txn_date desc);

create index if not exists idx_bank_lines_statement_import
  on public.bank_lines (statement_import_id)
  where statement_import_id is not null;

create index if not exists idx_bank_lines_matched_source
  on public.bank_lines (workspace_id, matched_source_type, matched_source_id)
  where matched_source_type is not null and matched_source_id is not null;

drop trigger if exists trg_bank_lines_sync_tenant on public.bank_lines;
create trigger trg_bank_lines_sync_tenant
  before insert or update on public.bank_lines
  for each row execute function public.sync_workspace_and_organisation_ids();

drop trigger if exists trg_bank_lines_touch_updated_at on public.bank_lines;
create trigger trg_bank_lines_touch_updated_at
  before update on public.bank_lines
  for each row execute function public.touch_updated_at();

create or replace function public.sync_bank_line_transaction_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.transaction_date := coalesce(new.transaction_date, new.txn_date);
  new.amount := coalesce(new.amount, round((new.amount_pence::numeric / 100), 2));
  new.direction := coalesce(new.direction, case when new.amount_pence >= 0 then 'in' else 'out' end);

  if new.money_in is null and new.amount_pence >= 0 then
    new.money_in := round((new.amount_pence::numeric / 100), 2);
  end if;

  if new.money_out is null and new.amount_pence < 0 then
    new.money_out := round((abs(new.amount_pence)::numeric / 100), 2);
  end if;

  if new.running_balance is null and new.balance_pence is not null then
    new.running_balance := round((new.balance_pence::numeric / 100), 2);
  end if;

  if new.reconciled then
    new.status := 'reconciled';
  elsif new.allocated and new.status = 'unmatched' then
    new.status := 'matched';
  end if;

  return new;
end;
$$;

revoke all on function public.sync_bank_line_transaction_fields() from public;

drop trigger if exists trg_bank_lines_sync_transaction_fields on public.bank_lines;
create trigger trg_bank_lines_sync_transaction_fields
  before insert or update on public.bank_lines
  for each row execute function public.sync_bank_line_transaction_fields();

-- Compatibility view for product-facing "bank_transactions" terminology.
create or replace view public.bank_transactions
with (security_invoker = true)
as
select
  id,
  workspace_id,
  bank_account_id,
  statement_import_id,
  transaction_date,
  description,
  reference,
  amount,
  direction,
  money_in,
  money_out,
  running_balance,
  fingerprint,
  status,
  matched_source_type,
  matched_source_id,
  posted_journal_id,
  reconciled_at,
  reconciled_by,
  created_at,
  updated_at
from public.bank_lines;

comment on view public.bank_transactions is
  'Compatibility view over public.bank_lines. bank_lines remains the physical imported bank transaction table used by existing modules.';

-- ---------------------------------------------------------------------------
-- 5. Bank rules
-- ---------------------------------------------------------------------------

create table if not exists public.bank_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  bank_account_id uuid references public.bank_accounts(id) on delete cascade,
  name text not null,
  priority integer not null default 100 check (priority >= 0),
  condition_type text not null
    check (condition_type in ('contains', 'exact', 'starts_with', 'amount_equals', 'amount_range')),
  condition_value text,
  direction text check (direction is null or direction in ('in', 'out')),
  amount_min numeric(14, 2),
  amount_max numeric(14, 2),
  transaction_type text not null default 'other'
    check (transaction_type in (
      'income',
      'expense',
      'transfer',
      'donation',
      'payroll',
      'gift_aid_payment',
      'other'
    )),
  account_id uuid references public.accounts(id) on delete set null,
  fund_id uuid references public.funds(id) on delete set null,
  income_stream_id uuid references public.income_streams(id) on delete set null,
  donor_id uuid references public.donors(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  auto_apply boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_rules_amount_range_check
    check (amount_max is null or amount_min is null or amount_max >= amount_min)
);

create index if not exists idx_bank_rules_workspace_priority
  on public.bank_rules (workspace_id, status, priority, created_at);

create index if not exists idx_bank_rules_account_priority
  on public.bank_rules (workspace_id, bank_account_id, status, priority)
  where bank_account_id is not null;

drop trigger if exists trg_bank_rules_touch_updated_at on public.bank_rules;
create trigger trg_bank_rules_touch_updated_at
  before update on public.bank_rules
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Generalise existing reconciliation matches while preserving old callers
-- ---------------------------------------------------------------------------

alter table public.bank_reconciliation_matches
  add column if not exists workspace_id uuid references public.organisations(id) on delete cascade,
  add column if not exists bank_transaction_id uuid references public.bank_lines(id) on delete cascade,
  add column if not exists matched_source_type text,
  add column if not exists matched_source_id uuid,
  add column if not exists confidence_score numeric(5, 4) not null default 1,
  add column if not exists match_reason text,
  add column if not exists status text not null default 'confirmed',
  add column if not exists confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists confirmed_at timestamptz;

alter table public.bank_reconciliation_matches
  alter column journal_id drop not null;

update public.bank_reconciliation_matches
   set workspace_id = organisation_id
 where workspace_id is null;

update public.bank_reconciliation_matches
   set bank_transaction_id = bank_line_id
 where bank_transaction_id is null;

update public.bank_reconciliation_matches
   set matched_source_type = coalesce(matched_source_type, 'journal'),
       matched_source_id = coalesce(matched_source_id, journal_id),
       confirmed_by = coalesce(confirmed_by, matched_by),
       confirmed_at = coalesce(confirmed_at, created_at)
 where matched_source_type is null
    or matched_source_id is null
    or confirmed_by is null
    or confirmed_at is null;

alter table public.bank_reconciliation_matches
  alter column workspace_id set not null,
  alter column bank_transaction_id set not null,
  alter column matched_source_type set not null,
  alter column matched_source_id set not null;

do $$ begin
  alter table public.bank_reconciliation_matches
    add constraint bank_reconciliation_matches_status_check
    check (status in ('suggested', 'confirmed', 'rejected'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.bank_reconciliation_matches
    add constraint bank_reconciliation_matches_confidence_check
    check (confidence_score >= 0 and confidence_score <= 1);
exception when duplicate_object then null;
end $$;

create index if not exists idx_brm_workspace_status
  on public.bank_reconciliation_matches (workspace_id, status, created_at desc);

create index if not exists idx_brm_source
  on public.bank_reconciliation_matches (workspace_id, matched_source_type, matched_source_id);

drop trigger if exists trg_brm_sync_tenant on public.bank_reconciliation_matches;
create trigger trg_brm_sync_tenant
  before insert or update on public.bank_reconciliation_matches
  for each row execute function public.sync_workspace_and_organisation_ids();

create or replace function public.sync_bank_reconciliation_match_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.bank_transaction_id := coalesce(new.bank_transaction_id, new.bank_line_id);
  new.bank_line_id := coalesce(new.bank_line_id, new.bank_transaction_id);
  new.matched_source_type := coalesce(new.matched_source_type, 'journal');
  new.matched_source_id := coalesce(new.matched_source_id, new.journal_id);

  if new.matched_source_type = 'journal' then
    new.journal_id := coalesce(new.journal_id, new.matched_source_id);
  end if;

  if new.status = 'confirmed' then
    new.confirmed_by := coalesce(new.confirmed_by, new.matched_by);
    new.confirmed_at := coalesce(new.confirmed_at, now());
  end if;

  return new;
end;
$$;

revoke all on function public.sync_bank_reconciliation_match_fields() from public;

drop trigger if exists trg_brm_sync_match_fields on public.bank_reconciliation_matches;
create trigger trg_brm_sync_match_fields
  before insert or update on public.bank_reconciliation_matches
  for each row execute function public.sync_bank_reconciliation_match_fields();

-- ---------------------------------------------------------------------------
-- 7. RLS for new foundation tables
-- ---------------------------------------------------------------------------

alter table public.bank_statement_imports enable row level security;
alter table public.bank_statement_imports force row level security;
alter table public.bank_import_mappings enable row level security;
alter table public.bank_import_mappings force row level security;
alter table public.bank_rules enable row level security;
alter table public.bank_rules force row level security;
alter table public.bank_accounts force row level security;
alter table public.bank_statements force row level security;
alter table public.bank_lines force row level security;
alter table public.bank_reconciliation_matches force row level security;
alter table public.reconciliations force row level security;

drop policy if exists bank_statement_imports_select_member on public.bank_statement_imports;
create policy bank_statement_imports_select_member
  on public.bank_statement_imports
  for select using (public.is_org_member(workspace_id));

drop policy if exists bank_statement_imports_insert_writer on public.bank_statement_imports;
create policy bank_statement_imports_insert_writer
  on public.bank_statement_imports
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists bank_statement_imports_update_writer on public.bank_statement_imports;
create policy bank_statement_imports_update_writer
  on public.bank_statement_imports
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists bank_statement_imports_delete_writer on public.bank_statement_imports;
create policy bank_statement_imports_delete_writer
  on public.bank_statement_imports
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists bank_import_mappings_select_member on public.bank_import_mappings;
create policy bank_import_mappings_select_member
  on public.bank_import_mappings
  for select using (public.is_org_member(workspace_id));

drop policy if exists bank_import_mappings_insert_writer on public.bank_import_mappings;
create policy bank_import_mappings_insert_writer
  on public.bank_import_mappings
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists bank_import_mappings_update_writer on public.bank_import_mappings;
create policy bank_import_mappings_update_writer
  on public.bank_import_mappings
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists bank_import_mappings_delete_writer on public.bank_import_mappings;
create policy bank_import_mappings_delete_writer
  on public.bank_import_mappings
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists bank_rules_select_member on public.bank_rules;
create policy bank_rules_select_member
  on public.bank_rules
  for select using (public.is_org_member(workspace_id));

drop policy if exists bank_rules_insert_writer on public.bank_rules;
create policy bank_rules_insert_writer
  on public.bank_rules
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists bank_rules_update_writer on public.bank_rules;
create policy bank_rules_update_writer
  on public.bank_rules
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists bank_rules_delete_writer on public.bank_rules;
create policy bank_rules_delete_writer
  on public.bank_rules
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

-- Existing tables already have organisation_id-based RLS. Add comments so the
-- compatibility model is explicit for future Open Banking work.
comment on column public.bank_accounts.workspace_id is
  'Compatibility tenant key. Kept equal to organisation_id by trigger.';

comment on column public.bank_lines.workspace_id is
  'Compatibility tenant key. Kept equal to organisation_id by trigger.';

comment on table public.bank_statement_imports is
  'Manual statement upload/import batch metadata. Stores private file path, parse status, row counters and duplicate counts.';

comment on table public.bank_import_mappings is
  'Reusable CSV/import column mappings. Future Open Banking feeds should bypass this table and write normalized imports.';

comment on table public.bank_rules is
  'Bank rule suggestions/automation. auto_apply should remain conservative and audited before posting or reconciling.';
