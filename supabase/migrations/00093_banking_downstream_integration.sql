alter table public.bank_statement_imports
  add column if not exists statement_warnings jsonb not null default '[]'::jsonb,
  add column if not exists warning_status text not null default 'clear';

alter table public.bank_statement_imports
  drop constraint if exists bank_statement_imports_warning_status_check;

alter table public.bank_statement_imports
  add constraint bank_statement_imports_warning_status_check
  check (warning_status in ('clear', 'warning'));

create table if not exists public.bank_reconciliation_certificates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  statement_import_id uuid references public.bank_statement_imports(id) on delete set null,
  statement_period_start date,
  statement_period_end date not null,
  closing_bank_balance_pence bigint not null,
  book_balance_pence bigint not null,
  difference_pence bigint not null,
  reconciled_transaction_count integer not null default 0,
  unreconciled_exception_count integer not null default 0,
  unreconciled_exceptions jsonb not null default '[]'::jsonb,
  certificate_number text not null,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_reconciliation_certificates_number_unique unique (workspace_id, certificate_number)
);

create index if not exists idx_bank_reconciliation_certificates_account_date
  on public.bank_reconciliation_certificates (workspace_id, bank_account_id, statement_period_end desc);

create unique index if not exists idx_brm_confirmed_bank_transaction_once
  on public.bank_reconciliation_matches (workspace_id, bank_transaction_id)
  where status = 'confirmed';

create unique index if not exists idx_brm_confirmed_source_once
  on public.bank_reconciliation_matches (workspace_id, matched_source_type, matched_source_id)
  where status = 'confirmed';

drop trigger if exists trg_bank_reconciliation_certificates_touch_updated_at
  on public.bank_reconciliation_certificates;
create trigger trg_bank_reconciliation_certificates_touch_updated_at
  before update on public.bank_reconciliation_certificates
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_bank_reconciliation_certificates_sync_tenant
  on public.bank_reconciliation_certificates;
create trigger trg_bank_reconciliation_certificates_sync_tenant
  before insert or update on public.bank_reconciliation_certificates
  for each row execute function public.sync_workspace_and_organisation_ids();

alter table public.bank_reconciliation_certificates enable row level security;
alter table public.bank_reconciliation_certificates force row level security;

drop policy if exists brc_select_member on public.bank_reconciliation_certificates;
create policy brc_select_member
  on public.bank_reconciliation_certificates
  for select using (public.is_org_member(workspace_id));

drop policy if exists brc_insert_writer on public.bank_reconciliation_certificates;
create policy brc_insert_writer
  on public.bank_reconciliation_certificates
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists brc_update_writer on public.bank_reconciliation_certificates;
create policy brc_update_writer
  on public.bank_reconciliation_certificates
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists brc_delete_writer on public.bank_reconciliation_certificates;
create policy brc_delete_writer
  on public.bank_reconciliation_certificates
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

comment on table public.bank_reconciliation_certificates is
  'Point-in-time reconciliation certificate snapshots for trustee/internal records.';

comment on column public.bank_statement_imports.statement_warnings is
  'Statement continuity warnings such as date gaps, overlaps, or balance mismatches detected during import preview.';

