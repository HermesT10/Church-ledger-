-- 00086_gift_aid_claim_payment_reconciliation.sql
-- HMRC Gift Aid / GASDS bank receipt linkage and payment status on claim batches.

alter table public.gift_aid_claim_batches
  add column if not exists expected_payment_amount_pence bigint,
  add column if not exists expected_payment_date date,
  add column if not exists payment_bank_account_id uuid references public.bank_accounts(id) on delete set null,
  add column if not exists received_payment_total_pence bigint not null default 0,
  add column if not exists received_bank_transaction_id uuid references public.bank_lines(id) on delete set null,
  add column if not exists gift_aid_payment_status text not null default 'pending'
    check (
      gift_aid_payment_status in (
        'pending',
        'partially_paid',
        'paid',
        'overpaid',
        'underpaid',
        'reconciled'
      )
    ),
  add column if not exists payment_reconciled_at timestamptz,
  add column if not exists payment_journal_id uuid references public.journals(id) on delete set null;

comment on column public.gift_aid_claim_batches.received_bank_transaction_id is
  'Anchor bank line for display; totals come from allocations. One HMRC credit may split across batches via multiple allocations.';

create table if not exists public.gift_aid_claim_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  claim_batch_id uuid not null references public.gift_aid_claim_batches(id) on delete cascade,
  bank_line_id uuid not null references public.bank_lines(id) on delete restrict,
  allocated_amount_pence bigint not null check (allocated_amount_pence > 0),
  journal_id uuid references public.journals(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint gift_aid_claim_payment_alloc_dup_batch_line unique (claim_batch_id, bank_line_id)
);

create index if not exists idx_ga_payment_alloc_workspace_batch
  on public.gift_aid_claim_payment_allocations (workspace_id, claim_batch_id);

create index if not exists idx_ga_payment_alloc_bank_line
  on public.gift_aid_claim_payment_allocations (bank_line_id);

create index if not exists idx_ga_claim_batches_payment_status
  on public.gift_aid_claim_batches (workspace_id, gift_aid_payment_status);

alter table public.gift_aid_claim_payment_allocations enable row level security;
alter table public.gift_aid_claim_payment_allocations force row level security;

drop policy if exists gift_aid_claim_payment_allocations_select_member on public.gift_aid_claim_payment_allocations;
create policy gift_aid_claim_payment_allocations_select_member
  on public.gift_aid_claim_payment_allocations
  for select using (public.is_org_member(workspace_id));

drop policy if exists gift_aid_claim_payment_allocations_insert_writer on public.gift_aid_claim_payment_allocations;
create policy gift_aid_claim_payment_allocations_insert_writer
  on public.gift_aid_claim_payment_allocations
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_claim_payment_allocations_update_writer on public.gift_aid_claim_payment_allocations;
create policy gift_aid_claim_payment_allocations_update_writer
  on public.gift_aid_claim_payment_allocations
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_claim_payment_allocations_delete_writer on public.gift_aid_claim_payment_allocations;
create policy gift_aid_claim_payment_allocations_delete_writer
  on public.gift_aid_claim_payment_allocations
  for delete using (public.is_org_treasurer_or_admin(workspace_id));
