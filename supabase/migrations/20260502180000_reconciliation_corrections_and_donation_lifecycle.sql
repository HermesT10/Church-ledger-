-- Reconciliation corrections audit trail + donation lifecycle for unreconcile/correction UX.

-- ---------------------------------------------------------------------------
-- 1. Donations: extend status for voided/corrected + correction metadata
-- ---------------------------------------------------------------------------

alter table public.donations drop constraint if exists donations_status_valid;

alter table public.donations
  add constraint donations_status_valid check (status in ('draft', 'posted', 'voided', 'corrected'));

comment on column public.donations.status is
  'draft | posted (substantive gift) | voided (removed from donor-facing) | corrected (superseded by unreconcile; retained for audit)';

alter table public.donations
  add column if not exists corrected_at timestamptz,
  add column if not exists corrected_by uuid references public.profiles(id) on delete set null,
  add column if not exists correction_reason text,
  add column if not exists reversal_journal_id uuid references public.journals(id) on delete set null;

create index if not exists idx_donations_org_status_date
  on public.donations (organisation_id, status, donation_date desc);

-- ---------------------------------------------------------------------------
-- 2. reconciliation_corrections (append-only correction / unreconcile history)
-- ---------------------------------------------------------------------------

create table if not exists public.reconciliation_corrections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  bank_line_id uuid not null references public.bank_lines(id) on delete cascade,
  bank_reconciliation_match_id uuid references public.bank_reconciliation_matches(id) on delete set null,
  original_source_type text not null,
  original_source_id uuid not null,
  original_journal_id uuid references public.journals(id) on delete set null,
  reversal_journal_id uuid references public.journals(id) on delete set null,
  correction_type text not null default 'unreconcile'
    check (correction_type in ('unreconcile', 'reverse', 'void', 'rematch')),
  journal_action text
    check (journal_action is null or journal_action in ('reversed', 'voided', 'deleted_draft')),
  reason text not null
    check (length(trim(reason)) >= 3),
  created_by uuid not null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint reconciliation_corrections_tenant_sync check (workspace_id = organisation_id)
);

create index if not exists idx_reconciliation_corrections_workspace_created
  on public.reconciliation_corrections (workspace_id, created_at desc);

create index if not exists idx_reconciliation_corrections_bank_line
  on public.reconciliation_corrections (workspace_id, bank_line_id, created_at desc);

comment on table public.reconciliation_corrections is
  'Audit trail when a bank line is unreconciled or a posted journal is reversed/voided as part of correction.';

drop trigger if exists trg_reconciliation_corrections_sync_tenant
  on public.reconciliation_corrections;
create trigger trg_reconciliation_corrections_sync_tenant
before insert or update on public.reconciliation_corrections
for each row execute function public.sync_workspace_and_organisation_ids();

alter table public.reconciliation_corrections enable row level security;
alter table public.reconciliation_corrections force row level security;

drop policy if exists reconciliation_corrections_select_member on public.reconciliation_corrections;
create policy reconciliation_corrections_select_member on public.reconciliation_corrections
  for select using (public.is_org_member(workspace_id));

drop policy if exists reconciliation_corrections_insert_writer on public.reconciliation_corrections;
create policy reconciliation_corrections_insert_writer on public.reconciliation_corrections
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

-- Corrections are append-only: no update/delete policies for members
