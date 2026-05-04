-- Smart reconciliation create-and-transfer support.
--
-- Adds lightweight metadata needed for reconciliation quick-create flows while
-- keeping posted accounting impact in the existing journals/manual transaction
-- model.

alter table public.donors
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists town_city text,
  add column if not exists county text,
  add column if not exists donor_reference text;

update public.donors
set donor_reference = coalesce(donor_reference, donor_reference_code, reference_code)
where donor_reference is null
  and (donor_reference_code is not null or reference_code is not null);

alter table public.manual_transactions
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists transfer_from_account_id uuid references public.accounts(id) on delete restrict,
  add column if not exists transfer_to_account_id uuid references public.accounts(id) on delete restrict,
  add column if not exists reconciliation_metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_manual_transactions_supplier
  on public.manual_transactions (organisation_id, supplier_id)
  where supplier_id is not null;

create index if not exists idx_manual_transactions_transfer_accounts
  on public.manual_transactions (organisation_id, transfer_from_account_id, transfer_to_account_id)
  where transfer_from_account_id is not null or transfer_to_account_id is not null;

alter table public.donor_matching_aliases
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.donor_matching_aliases
  drop constraint if exists donor_matching_aliases_source_check;

alter table public.donor_matching_aliases
  add constraint donor_matching_aliases_source_check
  check (source in ('bank_reference', 'manual', 'imported', 'reconciliation', 'system'));

create table if not exists public.supplier_matching_aliases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  alias_text text not null,
  normalized_alias text not null,
  source text not null default 'reconciliation'
    check (source in ('bank_reference', 'manual', 'imported', 'reconciliation', 'system')),
  confidence numeric(5,4) not null default 0.8
    check (confidence >= 0 and confidence <= 1),
  created_from_bank_transaction_id uuid references public.bank_lines(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint supplier_matching_aliases_alias_not_blank
    check (length(btrim(alias_text)) > 0),
  constraint supplier_matching_aliases_normalized_not_blank
    check (length(btrim(normalized_alias)) > 0)
);

create unique index if not exists uq_supplier_matching_aliases_workspace_alias_supplier
  on public.supplier_matching_aliases (workspace_id, normalized_alias, supplier_id);

create index if not exists idx_supplier_matching_aliases_lookup
  on public.supplier_matching_aliases (workspace_id, normalized_alias);

create index if not exists idx_supplier_matching_aliases_supplier
  on public.supplier_matching_aliases (workspace_id, supplier_id);

create index if not exists idx_supplier_matching_aliases_bank_transaction
  on public.supplier_matching_aliases (created_from_bank_transaction_id)
  where created_from_bank_transaction_id is not null;

alter table public.supplier_matching_aliases enable row level security;
alter table public.supplier_matching_aliases force row level security;

drop policy if exists supplier_matching_aliases_select_member on public.supplier_matching_aliases;
create policy supplier_matching_aliases_select_member
  on public.supplier_matching_aliases
  for select using (public.is_org_member(workspace_id));

drop policy if exists supplier_matching_aliases_insert_writer on public.supplier_matching_aliases;
create policy supplier_matching_aliases_insert_writer
  on public.supplier_matching_aliases
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists supplier_matching_aliases_update_writer on public.supplier_matching_aliases;
create policy supplier_matching_aliases_update_writer
  on public.supplier_matching_aliases
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists supplier_matching_aliases_delete_writer on public.supplier_matching_aliases;
create policy supplier_matching_aliases_delete_writer
  on public.supplier_matching_aliases
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

create table if not exists public.gift_aid_declaration_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  donor_id uuid not null references public.donors(id) on delete cascade,
  donation_id uuid references public.donations(id) on delete set null,
  status text not null default 'needed'
    check (status in ('needed', 'link_generated', 'sent', 'completed', 'dismissed')),
  request_reason text not null default 'missing_declaration',
  declaration_link_id uuid references public.gift_aid_declaration_links(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  dismissed_by uuid references public.profiles(id) on delete set null,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gift_aid_declaration_requests_reason_not_blank
    check (length(btrim(request_reason)) > 0)
);

create index if not exists idx_gift_aid_declaration_requests_workspace_status
  on public.gift_aid_declaration_requests (workspace_id, status, created_at desc);

create index if not exists idx_gift_aid_declaration_requests_donor
  on public.gift_aid_declaration_requests (workspace_id, donor_id, status);

create unique index if not exists uq_gift_aid_declaration_requests_open_donation
  on public.gift_aid_declaration_requests (workspace_id, donor_id, donation_id)
  where donation_id is not null and status in ('needed', 'link_generated', 'sent');

drop trigger if exists trg_gift_aid_declaration_requests_touch_updated_at
  on public.gift_aid_declaration_requests;

create trigger trg_gift_aid_declaration_requests_touch_updated_at
before update on public.gift_aid_declaration_requests
for each row execute function public.touch_updated_at();

alter table public.gift_aid_declaration_requests enable row level security;
alter table public.gift_aid_declaration_requests force row level security;

drop policy if exists gift_aid_declaration_requests_select_member
  on public.gift_aid_declaration_requests;
create policy gift_aid_declaration_requests_select_member
  on public.gift_aid_declaration_requests
  for select using (public.is_org_member(workspace_id));

drop policy if exists gift_aid_declaration_requests_insert_writer
  on public.gift_aid_declaration_requests;
create policy gift_aid_declaration_requests_insert_writer
  on public.gift_aid_declaration_requests
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_declaration_requests_update_writer
  on public.gift_aid_declaration_requests;
create policy gift_aid_declaration_requests_update_writer
  on public.gift_aid_declaration_requests
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_declaration_requests_delete_writer
  on public.gift_aid_declaration_requests;
create policy gift_aid_declaration_requests_delete_writer
  on public.gift_aid_declaration_requests
  for delete using (public.is_org_treasurer_or_admin(workspace_id));
