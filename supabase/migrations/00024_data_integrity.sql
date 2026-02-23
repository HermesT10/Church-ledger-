-- 00024_data_integrity.sql
-- Phase 9.2: Data Integrity & Invariants (finance-grade safety rails)
-- Immutability triggers, payroll RLS fix, reversal journal columns,
-- soft-delete for suppliers/donors, hard-delete blocks, posted-needs-journal constraints.

-- ============================================================
-- A1. Payroll runs RLS hardening (add status='draft' check)
-- ============================================================

-- Fix UPDATE policy: only allow updating draft payroll runs
drop policy if exists pr_update_treasurer_admin on public.payroll_runs;
create policy pr_update_treasurer_admin on public.payroll_runs
  for update
  using  (public.is_org_treasurer_or_admin(organisation_id) and status = 'draft')
  with check (public.is_org_treasurer_or_admin(organisation_id));

-- Fix DELETE policy: only allow deleting draft payroll runs
drop policy if exists pr_delete_treasurer_admin on public.payroll_runs;
create policy pr_delete_treasurer_admin on public.payroll_runs
  for delete using (
    public.is_org_treasurer_or_admin(organisation_id)
    and status = 'draft'
  );

-- Fix payroll_run_splits: INSERT/DELETE should check parent run is draft
drop policy if exists prs_insert_treasurer_admin on public.payroll_run_splits;
create policy prs_insert_treasurer_admin on public.payroll_run_splits
  for insert with check (
    exists (
      select 1 from public.payroll_runs pr
      where pr.id = payroll_run_id
        and public.is_org_treasurer_or_admin(pr.organisation_id)
        and pr.status = 'draft'
    )
  );

drop policy if exists prs_delete_treasurer_admin on public.payroll_run_splits;
create policy prs_delete_treasurer_admin on public.payroll_run_splits
  for delete using (
    exists (
      select 1 from public.payroll_runs pr
      where pr.id = payroll_run_id
        and public.is_org_treasurer_or_admin(pr.organisation_id)
        and pr.status = 'draft'
    )
  );

-- ============================================================
-- A2. Immutability triggers (defense-in-depth for admin client)
-- ============================================================

-- Generic trigger function: blocks UPDATE and DELETE on posted rows.
-- The posting transition itself (draft -> posted) is allowed.
-- For journals specifically, setting reversed_by on a posted journal is allowed
-- (this is a metadata-only update used by the reversal workflow).
create or replace function public.block_posted_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.status::text = 'posted' then
      raise exception 'Cannot delete a posted %', TG_TABLE_NAME;
    end if;
    return OLD;
  end if;

  -- UPDATE: allow draft -> posted transition, block all other changes to posted rows
  if OLD.status::text = 'posted' then
    -- Special case for journals: allow setting reversed_by on a posted journal
    -- (reversal workflow sets this metadata column without changing ledger data)
    if TG_TABLE_NAME = 'journals'
       and NEW.status::text = 'posted'
       and OLD.reversed_by is null
       and NEW.reversed_by is not null
       -- Ensure nothing else changes
       and NEW.journal_date = OLD.journal_date
       and NEW.memo is not distinct from OLD.memo
       and NEW.posted_at is not distinct from OLD.posted_at
       and NEW.reversal_of is not distinct from OLD.reversal_of
    then
      return NEW;
    end if;

    raise exception 'Cannot update a posted %', TG_TABLE_NAME;
  end if;
  return NEW;
end;
$$;

revoke all on function public.block_posted_mutation() from public;

-- Apply to journals (fires BEFORE the existing trg_journal_post)
create trigger trg_block_posted_journal
  before update or delete on public.journals
  for each row
  execute function public.block_posted_mutation();

-- Apply to payment_runs (fires BEFORE the existing trg_payment_run_post)
create trigger trg_block_posted_payment_run
  before update or delete on public.payment_runs
  for each row
  execute function public.block_posted_mutation();

-- Apply to payroll_runs
create trigger trg_block_posted_payroll_run
  before update or delete on public.payroll_runs
  for each row
  execute function public.block_posted_mutation();

-- Apply to bills (posted/paid bills are immutable)
create trigger trg_block_posted_bill
  before update or delete on public.bills
  for each row
  execute function public.block_posted_mutation();

-- Trigger for journal_lines: blocks mutation when parent journal is posted
create or replace function public.block_posted_journal_line_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status::text into v_status
    from public.journals
    where id = coalesce(NEW.journal_id, OLD.journal_id);

  if v_status = 'posted' then
    raise exception 'Cannot mutate lines of a posted journal';
  end if;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

revoke all on function public.block_posted_journal_line_mutation() from public;

create trigger trg_block_posted_journal_lines
  before insert or update or delete on public.journal_lines
  for each row
  execute function public.block_posted_journal_line_mutation();

-- ============================================================
-- A3. Reversal journal columns
-- ============================================================

alter table public.journals
  add column if not exists reversal_of uuid references public.journals(id),
  add column if not exists reversed_by uuid references public.journals(id);

-- Each journal can only be reversed once
create unique index if not exists idx_journals_reversal_of_unique
  on public.journals (reversal_of) where reversal_of is not null;

-- Each journal can only have one reversal pointing to it
create unique index if not exists idx_journals_reversed_by_unique
  on public.journals (reversed_by) where reversed_by is not null;

-- ============================================================
-- A4. Soft-delete for suppliers and donors
-- ============================================================

alter table public.suppliers
  add column if not exists is_active boolean not null default true;

alter table public.donors
  add column if not exists is_active boolean not null default true;

-- ============================================================
-- A5. Block hard deletes on ledger tables
-- ============================================================

create or replace function public.block_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Hard deletes are not permitted on %. Use soft-delete (is_active = false) instead.', TG_TABLE_NAME;
end;
$$;

revoke all on function public.block_hard_delete() from public;

-- Block hard deletes on suppliers (use is_active instead)
create trigger trg_block_supplier_delete
  before delete on public.suppliers
  for each row
  execute function public.block_hard_delete();

-- Block hard deletes on donors (use is_active instead)
create trigger trg_block_donor_delete
  before delete on public.donors
  for each row
  execute function public.block_hard_delete();

-- Block hard deletes on donations (ledger data)
create trigger trg_block_donation_delete
  before delete on public.donations
  for each row
  execute function public.block_hard_delete();

-- Block hard deletes on gift_aid_claims (ledger data)
create trigger trg_block_gift_aid_claim_delete
  before delete on public.gift_aid_claims
  for each row
  execute function public.block_hard_delete();

-- ============================================================
-- A6. Constraint: posted runs must have journal_id
-- ============================================================

alter table public.payroll_runs
  add constraint pr_posted_needs_journal
  check (status != 'posted' or journal_id is not null);

alter table public.payment_runs
  add constraint pmr_posted_needs_journal
  check (status != 'posted' or journal_id is not null);
