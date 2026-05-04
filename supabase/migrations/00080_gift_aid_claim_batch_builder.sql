-- 00080_gift_aid_claim_batch_builder.sql
-- Reviewable Gift Aid claim batches, exception validation state, and manual
-- edit audit trail for claim-line snapshots.

alter table public.organisation_settings
  add column if not exists gift_aid_requires_bank_transaction_link boolean not null default false;

alter table public.gift_aid_claim_batches
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references public.profiles(id) on delete set null,
  add column if not exists rejection_reason text,
  add column if not exists validation_run_at timestamptz,
  add column if not exists validation_summary jsonb not null default '{}'::jsonb;

alter table public.gift_aid_claim_lines
  add column if not exists status text not null default 'included'
    check (status in ('included', 'removed', 'exception')),
  add column if not exists validation_status text not null default 'valid'
    check (validation_status in ('valid', 'warning', 'blocking')),
  add column if not exists validation_issues jsonb not null default '[]'::jsonb,
  add column if not exists manual_edit_reason text,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references public.profiles(id) on delete set null,
  add column if not exists original_snapshot jsonb,
  add column if not exists edited_snapshot jsonb;

create index if not exists idx_gift_aid_claim_lines_status
  on public.gift_aid_claim_lines (workspace_id, claim_batch_id, status);

create index if not exists idx_gift_aid_claim_lines_validation_status
  on public.gift_aid_claim_lines (workspace_id, claim_batch_id, validation_status);

create table if not exists public.gift_aid_claim_line_edits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  claim_batch_id uuid not null references public.gift_aid_claim_batches(id) on delete cascade,
  claim_line_id uuid not null references public.gift_aid_claim_lines(id) on delete cascade,
  field_name text not null,
  original_value jsonb,
  edited_value jsonb,
  reason text not null,
  edited_by uuid references public.profiles(id) on delete set null,
  edited_at timestamptz not null default now()
);

create index if not exists idx_gift_aid_claim_line_edits_workspace
  on public.gift_aid_claim_line_edits (workspace_id, edited_at desc);

create index if not exists idx_gift_aid_claim_line_edits_line
  on public.gift_aid_claim_line_edits (claim_line_id, edited_at desc);

alter table public.gift_aid_claim_line_edits enable row level security;
alter table public.gift_aid_claim_line_edits force row level security;

drop policy if exists gift_aid_claim_line_edits_select_member on public.gift_aid_claim_line_edits;
create policy gift_aid_claim_line_edits_select_member on public.gift_aid_claim_line_edits
  for select using (public.is_org_member(workspace_id));

drop policy if exists gift_aid_claim_line_edits_insert_writer on public.gift_aid_claim_line_edits;
create policy gift_aid_claim_line_edits_insert_writer on public.gift_aid_claim_line_edits
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_claim_line_edits_update_writer on public.gift_aid_claim_line_edits;
create policy gift_aid_claim_line_edits_update_writer on public.gift_aid_claim_line_edits
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_claim_line_edits_delete_writer on public.gift_aid_claim_line_edits;
create policy gift_aid_claim_line_edits_delete_writer on public.gift_aid_claim_line_edits
  for delete using (public.is_org_treasurer_or_admin(workspace_id));
