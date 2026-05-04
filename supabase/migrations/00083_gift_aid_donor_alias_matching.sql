-- 00083_gift_aid_donor_alias_matching.sql
-- Donor aliases for bank-reference driven Gift Aid donor matching.

create table if not exists public.donor_matching_aliases (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.donors(id) on delete cascade,
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  alias_text text not null,
  normalized_alias text not null,
  source text not null
    check (source in ('bank_reference', 'manual', 'imported', 'system')),
  confidence numeric(5,4) not null default 0.8
    check (confidence >= 0 and confidence <= 1),
  created_from_bank_transaction_id uuid references public.bank_lines(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint donor_matching_aliases_alias_not_blank
    check (length(btrim(alias_text)) > 0),
  constraint donor_matching_aliases_normalized_not_blank
    check (length(btrim(normalized_alias)) > 0)
);

create unique index if not exists uq_donor_matching_aliases_workspace_alias_donor
  on public.donor_matching_aliases (workspace_id, normalized_alias, donor_id);

create index if not exists idx_donor_matching_aliases_lookup
  on public.donor_matching_aliases (workspace_id, normalized_alias);

create index if not exists idx_donor_matching_aliases_donor
  on public.donor_matching_aliases (workspace_id, donor_id);

create index if not exists idx_donor_matching_aliases_bank_transaction
  on public.donor_matching_aliases (created_from_bank_transaction_id)
  where created_from_bank_transaction_id is not null;

alter table public.donor_matching_aliases enable row level security;
alter table public.donor_matching_aliases force row level security;

drop policy if exists donor_matching_aliases_select_member on public.donor_matching_aliases;
create policy donor_matching_aliases_select_member
  on public.donor_matching_aliases
  for select using (public.is_org_member(workspace_id));

drop policy if exists donor_matching_aliases_insert_writer on public.donor_matching_aliases;
create policy donor_matching_aliases_insert_writer
  on public.donor_matching_aliases
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists donor_matching_aliases_update_writer on public.donor_matching_aliases;
create policy donor_matching_aliases_update_writer
  on public.donor_matching_aliases
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists donor_matching_aliases_delete_writer on public.donor_matching_aliases;
create policy donor_matching_aliases_delete_writer
  on public.donor_matching_aliases
  for delete using (public.is_org_treasurer_or_admin(workspace_id));
