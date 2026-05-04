-- 00085_gift_aid_gasds.sql
-- Gift Aid Small Donations Scheme (GASDS) batches and claim line linkage.

alter table public.organisation_settings
  add column if not exists gasds_require_bank_deposit_evidence boolean not null default false,
  add column if not exists gasds_annual_cap_pence bigint not null default 800000;

create table if not exists public.gift_aid_small_donation_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  batch_reference text not null,
  collection_date date not null,
  service_or_event_name text not null,
  location_name text,
  community_building_id uuid,
  collection_method text not null
    check (collection_method in ('cash', 'contactless')),
  total_collected_pence bigint not null check (total_collected_pence > 0),
  eligible_amount_pence bigint not null check (eligible_amount_pence >= 0),
  excluded_amount_pence bigint not null default 0 check (excluded_amount_pence >= 0),
  exclusion_reason text,
  linked_bank_transaction_id uuid references public.bank_lines(id) on delete set null,
  evidence_storage_path text,
  status text not null default 'draft'
    check (
      status in ('draft', 'ready', 'included_in_claim', 'claimed', 'rejected', 'voided')
    ),
  gift_aid_claim_batch_id uuid references public.gift_aid_claim_batches(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gift_aid_small_donation_batches_amounts_consistent
    check (eligible_amount_pence + excluded_amount_pence <= total_collected_pence),
  constraint gift_aid_small_donation_batches_batch_ref_unique unique (workspace_id, batch_reference)
);

create index if not exists idx_gift_aid_gasds_batches_workspace
  on public.gift_aid_small_donation_batches (workspace_id);

create index if not exists idx_gift_aid_gasds_batches_workspace_status
  on public.gift_aid_small_donation_batches (workspace_id, status);

create index if not exists idx_gift_aid_gasds_batches_claim
  on public.gift_aid_small_donation_batches (gift_aid_claim_batch_id)
  where gift_aid_claim_batch_id is not null;

create index if not exists idx_gift_aid_gasds_batches_bank_line
  on public.gift_aid_small_donation_batches (linked_bank_transaction_id)
  where linked_bank_transaction_id is not null;

alter table public.gift_aid_small_donation_batches enable row level security;
alter table public.gift_aid_small_donation_batches force row level security;

drop policy if exists gift_aid_small_donation_batches_select_member on public.gift_aid_small_donation_batches;
create policy gift_aid_small_donation_batches_select_member
  on public.gift_aid_small_donation_batches
  for select using (public.is_org_member(workspace_id));

drop policy if exists gift_aid_small_donation_batches_insert_writer on public.gift_aid_small_donation_batches;
create policy gift_aid_small_donation_batches_insert_writer
  on public.gift_aid_small_donation_batches
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_small_donation_batches_update_writer on public.gift_aid_small_donation_batches;
create policy gift_aid_small_donation_batches_update_writer
  on public.gift_aid_small_donation_batches
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_small_donation_batches_delete_writer on public.gift_aid_small_donation_batches;
create policy gift_aid_small_donation_batches_delete_writer
  on public.gift_aid_small_donation_batches
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

-- Gift Aid claim lines: nullable donation/donor for GASDS rows.
alter table public.gift_aid_claim_lines
  drop constraint if exists gift_aid_claim_lines_donation_id_key;

alter table public.gift_aid_claim_lines
  drop constraint if exists gift_aid_claim_lines_donation_id_fkey;

alter table public.gift_aid_claim_lines
  alter column donation_id drop not null;

alter table public.gift_aid_claim_lines
  drop constraint if exists gift_aid_claim_lines_donor_id_fkey;

alter table public.gift_aid_claim_lines
  alter column donor_id drop not null;

alter table public.gift_aid_claim_lines
  add constraint gift_aid_claim_lines_donation_id_fkey
    foreign key (donation_id)
    references public.donations(id)
    on delete restrict;

alter table public.gift_aid_claim_lines
  add constraint gift_aid_claim_lines_donor_id_fkey
    foreign key (donor_id)
    references public.donors(id)
    on delete restrict;

create unique index if not exists uq_gift_aid_claim_lines_donation_when_set
  on public.gift_aid_claim_lines (donation_id)
  where donation_id is not null;

alter table public.gift_aid_claim_lines
  add column if not exists claim_item_type text not null default 'standard_gift_aid'
    check (claim_item_type in ('standard_gift_aid', 'gasds'));

alter table public.gift_aid_claim_lines
  add column if not exists gasds_batch_id uuid references public.gift_aid_small_donation_batches(id) on delete restrict;

drop index if exists uq_gasds_lines_batch;

create unique index if not exists uq_gasds_lines_gasds_batch_when_set
  on public.gift_aid_claim_lines (gasds_batch_id)
  where gasds_batch_id is not null;

update public.gift_aid_claim_lines
  set claim_item_type = 'standard_gift_aid'
  where claim_item_type is null;

alter table public.gift_aid_claim_lines
  drop constraint if exists gift_aid_claim_lines_item_integrity;

alter table public.gift_aid_claim_lines
  add constraint gift_aid_claim_lines_item_integrity check (
    (
      claim_item_type = 'standard_gift_aid'
      and donation_id is not null
      and donor_id is not null
      and gasds_batch_id is null
    )
    or (
      claim_item_type = 'gasds'
      and donation_id is null
      and donor_id is null
      and gasds_batch_id is not null
    )
  );

drop trigger if exists trg_gift_aid_small_donation_batches_touch_updated_at on public.gift_aid_small_donation_batches;
create trigger trg_gift_aid_small_donation_batches_touch_updated_at
  before update on public.gift_aid_small_donation_batches
  for each row execute function public.touch_updated_at();
