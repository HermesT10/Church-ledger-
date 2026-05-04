-- 00060_gift_aid_production_model.sql
-- Production-grade Gift Aid data model.
--
-- Notes:
-- - Church Ledger is currently organisation-scoped in application code.
-- - This migration adds workspace_id as the durable tenant key for Gift Aid
--   while preserving organisation_id for backward compatibility.
-- - For existing tables, workspace_id is a generated alias of organisation_id.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'gift_aid_donation_status'
  ) then
    create type public.gift_aid_donation_status as enum (
      'unmatched',
      'needs_review',
      'matched_no_declaration',
      'eligible',
      'ineligible',
      'included_in_claim',
      'submitted'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'gift_aid_declaration_status'
  ) then
    create type public.gift_aid_declaration_status as enum (
      'active',
      'cancelled',
      'expired'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'gift_aid_batch_status'
  ) then
    create type public.gift_aid_batch_status as enum (
      'draft',
      'exported',
      'submitted',
      'voided'
    );
  end if;
end $$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_gift_aid_declaration_legacy_fields()
returns trigger
language plpgsql
as $$
begin
  if new.status is null then
    if coalesce(new.is_active, true) = false then
      new.status := 'cancelled'::public.gift_aid_declaration_status;
    elsif new.end_date is not null and new.end_date < current_date then
      new.status := 'expired'::public.gift_aid_declaration_status;
    else
      new.status := 'active'::public.gift_aid_declaration_status;
    end if;
  end if;

  new.is_active := (new.status = 'active');

  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;

  if new.status <> 'cancelled' then
    new.cancelled_at := null;
    if new.cancellation_reason is not null and new.status <> 'cancelled' then
      new.cancellation_reason := null;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.sync_donation_gift_aid_fields()
returns trigger
language plpgsql
as $$
begin
  if new.gift_aid_status is null then
    if new.gift_aid_claim_id is not null then
      new.gift_aid_status := 'included_in_claim'::public.gift_aid_donation_status;
    elsif coalesce(new.gift_aid_eligible, false) then
      new.gift_aid_status := 'eligible'::public.gift_aid_donation_status;
    elsif new.gift_aid_ineligible_reason is not null then
      new.gift_aid_status := 'ineligible'::public.gift_aid_donation_status;
    elsif new.donor_id is null then
      new.gift_aid_status := 'unmatched'::public.gift_aid_donation_status;
    else
      new.gift_aid_status := 'needs_review'::public.gift_aid_donation_status;
    end if;
  end if;

  if new.gift_aid_status in ('eligible', 'included_in_claim', 'submitted') then
    new.gift_aid_eligible := true;
    new.gift_aid_ineligible_reason := null;
  elsif new.gift_aid_status = 'ineligible' then
    new.gift_aid_eligible := false;
    if new.gift_aid_ineligible_reason is null then
      new.gift_aid_ineligible_reason := 'Marked ineligible for Gift Aid.';
    end if;
  elsif new.gift_aid_status = 'unmatched' then
    new.gift_aid_eligible := false;
    new.gift_aid_ineligible_reason := null;
    new.donor_id := null;
  else
    new.gift_aid_eligible := false;
  end if;

  if new.gift_aid_status in ('included_in_claim', 'submitted') then
    if new.included_in_claim_at is null then
      new.included_in_claim_at := coalesce(new.gift_aid_claimed_at, now());
    end if;
  elsif new.gift_aid_status not in ('included_in_claim', 'submitted') then
    new.included_in_claim_at := null;
  end if;

  if new.gift_aid_status = 'submitted' then
    if new.submitted_to_hmrc_at is null then
      new.submitted_to_hmrc_at := now();
    end if;
  elsif new.gift_aid_status <> 'submitted' then
    new.submitted_to_hmrc_at := null;
  end if;

  return new;
end;
$$;

-- ============================================================
-- Existing tables: donors / declarations / donations
-- ============================================================

alter table public.donors
  add column if not exists workspace_id uuid generated always as (organisation_id) stored,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

alter table public.gift_aid_declarations
  add column if not exists workspace_id uuid generated always as (organisation_id) stored,
  add column if not exists status public.gift_aid_declaration_status,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.gift_aid_declarations gad
set organisation_id = d.organisation_id
from public.donors d
where gad.donor_id = d.id
  and gad.organisation_id is null;

update public.gift_aid_declarations
set status = case
  when coalesce(is_active, true) = false then 'cancelled'::public.gift_aid_declaration_status
  when end_date is not null and end_date < current_date then 'expired'::public.gift_aid_declaration_status
  else 'active'::public.gift_aid_declaration_status
end
where status is null;

alter table public.gift_aid_declarations
  alter column organisation_id set not null,
  alter column status set not null;

alter table public.donations
  add column if not exists workspace_id uuid generated always as (organisation_id) stored,
  add column if not exists bank_transaction_id uuid references public.bank_lines(id) on delete set null,
  add column if not exists matched_declaration_id uuid references public.gift_aid_declarations(id) on delete set null,
  add column if not exists gift_aid_status public.gift_aid_donation_status,
  add column if not exists review_reason text,
  add column if not exists included_in_claim_at timestamptz,
  add column if not exists submitted_to_hmrc_at timestamptz,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.donations
set gift_aid_status = 'unmatched'::public.gift_aid_donation_status
where gift_aid_status is null
  and donor_id is null;

update public.donations
set gift_aid_status = 'included_in_claim'::public.gift_aid_donation_status,
    included_in_claim_at = coalesce(included_in_claim_at, gift_aid_claimed_at)
where gift_aid_status is null
  and gift_aid_claim_id is not null;

update public.donations d
set gift_aid_status = 'submitted'::public.gift_aid_donation_status,
    submitted_to_hmrc_at = coalesce(d.submitted_to_hmrc_at, gac.submitted_at)
from public.gift_aid_claims gac
where d.gift_aid_claim_id = gac.id
  and gac.status in ('submitted', 'paid');

update public.donations
set gift_aid_status = 'eligible'::public.gift_aid_donation_status
where gift_aid_status is null
  and coalesce(gift_aid_eligible, false) = true;

update public.donations
set gift_aid_status = 'ineligible'::public.gift_aid_donation_status
where gift_aid_status is null
  and gift_aid_ineligible_reason is not null;

update public.donations d
set gift_aid_status = 'matched_no_declaration'::public.gift_aid_donation_status
where gift_aid_status is null
  and donor_id is not null
  and not exists (
    select 1
    from public.gift_aid_declarations gad
    where gad.donor_id = d.donor_id
      and gad.organisation_id = d.organisation_id
      and gad.status = 'active'
      and gad.start_date <= d.donation_date
      and (gad.end_date is null or gad.end_date >= d.donation_date)
  );

update public.donations
set gift_aid_status = 'needs_review'::public.gift_aid_donation_status
where gift_aid_status is null;

alter table public.donations
  alter column gift_aid_status set not null;

drop trigger if exists trg_gift_aid_declarations_touch_updated_at on public.gift_aid_declarations;
create trigger trg_gift_aid_declarations_touch_updated_at
before update on public.gift_aid_declarations
for each row execute function public.touch_updated_at();

drop trigger if exists trg_donors_touch_updated_at on public.donors;
create trigger trg_donors_touch_updated_at
before update on public.donors
for each row execute function public.touch_updated_at();

drop trigger if exists trg_donations_touch_updated_at on public.donations;
create trigger trg_donations_touch_updated_at
before update on public.donations
for each row execute function public.touch_updated_at();

drop trigger if exists trg_gift_aid_declarations_sync on public.gift_aid_declarations;
create trigger trg_gift_aid_declarations_sync
before insert or update on public.gift_aid_declarations
for each row execute function public.sync_gift_aid_declaration_legacy_fields();

drop trigger if exists trg_donations_gift_aid_sync on public.donations;
create trigger trg_donations_gift_aid_sync
before insert or update on public.donations
for each row execute function public.sync_donation_gift_aid_fields();

create index if not exists idx_donors_workspace_id
  on public.donors (workspace_id);

create index if not exists idx_donors_workspace_name
  on public.donors (workspace_id, full_name);

create index if not exists idx_gift_aid_declarations_workspace_id
  on public.gift_aid_declarations (workspace_id);

create index if not exists idx_gift_aid_declarations_status
  on public.gift_aid_declarations (workspace_id, status);

create index if not exists idx_gift_aid_declarations_donor_id
  on public.gift_aid_declarations (donor_id);

create index if not exists idx_gift_aid_declarations_donor_status
  on public.gift_aid_declarations (workspace_id, donor_id, status);

create index if not exists idx_donations_workspace_id
  on public.donations (workspace_id);

create index if not exists idx_donations_gift_aid_status
  on public.donations (workspace_id, gift_aid_status);

create index if not exists idx_donations_gift_aid_donor
  on public.donations (workspace_id, donor_id)
  where donor_id is not null;

create index if not exists idx_donations_gift_aid_donation_date
  on public.donations (workspace_id, donation_date);

create unique index if not exists uq_donations_bank_transaction_id
  on public.donations (bank_transaction_id);

create index if not exists idx_donations_matched_declaration_id
  on public.donations (matched_declaration_id)
  where matched_declaration_id is not null;

alter table public.donors force row level security;
alter table public.gift_aid_declarations force row level security;
alter table public.donations force row level security;

-- ============================================================
-- New tables
-- ============================================================

create table if not exists public.bank_transaction_donor_matches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  bank_transaction_id uuid not null references public.bank_lines(id) on delete cascade,
  donor_id uuid not null references public.donors(id) on delete cascade,
  donation_id uuid references public.donations(id) on delete set null,
  match_method text not null
    check (match_method in ('manual', 'rule', 'heuristic')),
  confidence_score numeric(5,4),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_transaction_donor_matches_confidence_range
    check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1))
);

create unique index if not exists idx_bank_transaction_donor_matches_bank_txn
  on public.bank_transaction_donor_matches (bank_transaction_id);

create index if not exists idx_bank_transaction_donor_matches_workspace
  on public.bank_transaction_donor_matches (workspace_id);

create index if not exists idx_bank_transaction_donor_matches_donor
  on public.bank_transaction_donor_matches (workspace_id, donor_id);

create index if not exists idx_bank_transaction_donor_matches_donation
  on public.bank_transaction_donor_matches (donation_id)
  where donation_id is not null;

create table if not exists public.gift_aid_claim_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  claim_start date not null,
  claim_end date not null,
  status public.gift_aid_batch_status not null default 'draft',
  batch_reference text,
  hmrc_submission_reference text,
  donation_count integer not null default 0,
  donation_total_pence bigint not null default 0,
  claim_total_pence bigint not null default 0,
  latest_exported_at timestamptz,
  submitted_at timestamptz,
  voided_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gift_aid_claim_batches_dates_valid
    check (claim_end >= claim_start)
);

create index if not exists idx_gift_aid_claim_batches_workspace
  on public.gift_aid_claim_batches (workspace_id);

create index if not exists idx_gift_aid_claim_batches_status
  on public.gift_aid_claim_batches (workspace_id, status);

create index if not exists idx_gift_aid_claim_batches_period
  on public.gift_aid_claim_batches (workspace_id, claim_start, claim_end);

create table if not exists public.gift_aid_claim_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  claim_batch_id uuid not null references public.gift_aid_claim_batches(id) on delete cascade,
  donation_id uuid not null references public.donations(id) on delete restrict,
  donor_id uuid not null references public.donors(id) on delete restrict,
  declaration_id uuid references public.gift_aid_declarations(id) on delete set null,
  donation_date date not null,
  donation_amount_pence bigint not null check (donation_amount_pence > 0),
  claim_rate numeric(6,5) not null default 0.25 check (claim_rate > 0 and claim_rate <= 1),
  claim_amount_pence bigint not null check (claim_amount_pence >= 0),
  donor_name_snapshot text not null,
  donor_address_snapshot text,
  donor_postcode_snapshot text,
  created_at timestamptz not null default now(),
  unique (donation_id)
);

create index if not exists idx_gift_aid_claim_lines_workspace
  on public.gift_aid_claim_lines (workspace_id);

create index if not exists idx_gift_aid_claim_lines_claim_batch_id
  on public.gift_aid_claim_lines (claim_batch_id);

create index if not exists idx_gift_aid_claim_lines_workspace_batch
  on public.gift_aid_claim_lines (workspace_id, claim_batch_id);

create index if not exists idx_gift_aid_claim_lines_donor_id
  on public.gift_aid_claim_lines (donor_id);

create index if not exists idx_gift_aid_claim_lines_donation_date
  on public.gift_aid_claim_lines (workspace_id, donation_date);

create table if not exists public.gift_aid_exports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  claim_batch_id uuid not null references public.gift_aid_claim_batches(id) on delete cascade,
  export_format text not null
    check (export_format in ('hmrc_csv', 'csv', 'json')),
  file_name text,
  storage_path text,
  checksum_sha256 text,
  row_count integer not null default 0,
  exported_at timestamptz not null default now(),
  submitted_at timestamptz,
  submission_reference text,
  exported_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_gift_aid_exports_workspace
  on public.gift_aid_exports (workspace_id);

create index if not exists idx_gift_aid_exports_claim_batch_id
  on public.gift_aid_exports (claim_batch_id);

create index if not exists idx_gift_aid_exports_workspace_batch
  on public.gift_aid_exports (workspace_id, claim_batch_id);

create index if not exists idx_gift_aid_exports_exported_at
  on public.gift_aid_exports (workspace_id, exported_at desc);

drop trigger if exists trg_bank_transaction_donor_matches_touch_updated_at on public.bank_transaction_donor_matches;
create trigger trg_bank_transaction_donor_matches_touch_updated_at
before update on public.bank_transaction_donor_matches
for each row execute function public.touch_updated_at();

drop trigger if exists trg_gift_aid_claim_batches_touch_updated_at on public.gift_aid_claim_batches;
create trigger trg_gift_aid_claim_batches_touch_updated_at
before update on public.gift_aid_claim_batches
for each row execute function public.touch_updated_at();

alter table public.bank_transaction_donor_matches enable row level security;
alter table public.gift_aid_claim_batches enable row level security;
alter table public.gift_aid_claim_lines enable row level security;
alter table public.gift_aid_exports enable row level security;

alter table public.bank_transaction_donor_matches force row level security;
alter table public.gift_aid_claim_batches force row level security;
alter table public.gift_aid_claim_lines force row level security;
alter table public.gift_aid_exports force row level security;

drop policy if exists bank_transaction_donor_matches_select_member on public.bank_transaction_donor_matches;
create policy bank_transaction_donor_matches_select_member on public.bank_transaction_donor_matches
  for select using (public.is_org_member(workspace_id));

drop policy if exists bank_transaction_donor_matches_insert_writer on public.bank_transaction_donor_matches;
create policy bank_transaction_donor_matches_insert_writer on public.bank_transaction_donor_matches
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists bank_transaction_donor_matches_update_writer on public.bank_transaction_donor_matches;
create policy bank_transaction_donor_matches_update_writer on public.bank_transaction_donor_matches
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists bank_transaction_donor_matches_delete_writer on public.bank_transaction_donor_matches;
create policy bank_transaction_donor_matches_delete_writer on public.bank_transaction_donor_matches
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_claim_batches_select_member on public.gift_aid_claim_batches;
create policy gift_aid_claim_batches_select_member on public.gift_aid_claim_batches
  for select using (public.is_org_member(workspace_id));

drop policy if exists gift_aid_claim_batches_insert_writer on public.gift_aid_claim_batches;
create policy gift_aid_claim_batches_insert_writer on public.gift_aid_claim_batches
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_claim_batches_update_writer on public.gift_aid_claim_batches;
create policy gift_aid_claim_batches_update_writer on public.gift_aid_claim_batches
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_claim_batches_delete_writer on public.gift_aid_claim_batches;
create policy gift_aid_claim_batches_delete_writer on public.gift_aid_claim_batches
  for delete using (
    public.is_org_treasurer_or_admin(workspace_id)
    and status = 'draft'
  );

drop policy if exists gift_aid_claim_lines_select_member on public.gift_aid_claim_lines;
create policy gift_aid_claim_lines_select_member on public.gift_aid_claim_lines
  for select using (public.is_org_member(workspace_id));

drop policy if exists gift_aid_claim_lines_insert_writer on public.gift_aid_claim_lines;
create policy gift_aid_claim_lines_insert_writer on public.gift_aid_claim_lines
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_claim_lines_update_writer on public.gift_aid_claim_lines;
create policy gift_aid_claim_lines_update_writer on public.gift_aid_claim_lines
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_claim_lines_delete_writer on public.gift_aid_claim_lines;
create policy gift_aid_claim_lines_delete_writer on public.gift_aid_claim_lines
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_exports_select_member on public.gift_aid_exports;
create policy gift_aid_exports_select_member on public.gift_aid_exports
  for select using (public.is_org_member(workspace_id));

drop policy if exists gift_aid_exports_insert_writer on public.gift_aid_exports;
create policy gift_aid_exports_insert_writer on public.gift_aid_exports
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_exports_update_writer on public.gift_aid_exports;
create policy gift_aid_exports_update_writer on public.gift_aid_exports
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_exports_delete_writer on public.gift_aid_exports;
create policy gift_aid_exports_delete_writer on public.gift_aid_exports
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

-- ============================================================
-- Legacy claims backfill into production tables
-- ============================================================

insert into public.gift_aid_claim_batches (
  id,
  workspace_id,
  claim_start,
  claim_end,
  status,
  batch_reference,
  hmrc_submission_reference,
  donation_count,
  donation_total_pence,
  claim_total_pence,
  latest_exported_at,
  submitted_at,
  created_by,
  created_at,
  updated_at
)
select
  gac.id,
  gac.organisation_id,
  gac.claim_start,
  gac.claim_end,
  case gac.status
    when 'draft' then 'draft'::public.gift_aid_batch_status
    when 'submitted' then 'submitted'::public.gift_aid_batch_status
    when 'paid' then 'submitted'::public.gift_aid_batch_status
    else 'draft'::public.gift_aid_batch_status
  end,
  gac.reference,
  gac.reference,
  coalesce((
    select count(*)
    from public.donations d
    where d.gift_aid_claim_id = gac.id
  ), 0),
  coalesce(gac.total_donations_pence, 0),
  coalesce(gac.total_gift_aid_pence, 0),
  gac.submitted_at,
  gac.submitted_at,
  gac.created_by,
  gac.created_at,
  now()
from public.gift_aid_claims gac
on conflict (id) do nothing;

insert into public.gift_aid_claim_lines (
  workspace_id,
  claim_batch_id,
  donation_id,
  donor_id,
  declaration_id,
  donation_date,
  donation_amount_pence,
  claim_amount_pence,
  donor_name_snapshot,
  donor_address_snapshot,
  donor_postcode_snapshot,
  created_at
)
select
  d.organisation_id,
  d.gift_aid_claim_id,
  d.id,
  d.donor_id,
  d.matched_declaration_id,
  d.donation_date,
  coalesce(d.gross_amount_pence, d.amount_pence),
  round(coalesce(d.gross_amount_pence, d.amount_pence) * 0.25),
  coalesce(dr.full_name, 'Unknown donor'),
  dr.address,
  dr.postcode,
  coalesce(d.gift_aid_claimed_at, d.created_at)
from public.donations d
join public.donors dr on dr.id = d.donor_id
where d.gift_aid_claim_id is not null
  and d.donor_id is not null
on conflict (donation_id) do nothing;
