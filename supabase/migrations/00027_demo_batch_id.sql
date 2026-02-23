-- 00027_demo_batch_id.sql
-- Phase 9.5: Demo Data Generator -- add demo_batch_id column to all
-- tables the generator touches, and modify safety triggers to allow
-- cleanup of demo-tagged records.

-- ============================================================
-- 1. Add demo_batch_id to all relevant tables
-- ============================================================

alter table public.funds                       add column if not exists demo_batch_id uuid;
alter table public.journals                    add column if not exists demo_batch_id uuid;
alter table public.journal_lines               add column if not exists demo_batch_id uuid;
alter table public.bank_accounts               add column if not exists demo_batch_id uuid;
alter table public.bank_lines                  add column if not exists demo_batch_id uuid;
alter table public.suppliers                   add column if not exists demo_batch_id uuid;
alter table public.bills                       add column if not exists demo_batch_id uuid;
alter table public.bill_lines                  add column if not exists demo_batch_id uuid;
alter table public.payment_runs                add column if not exists demo_batch_id uuid;
alter table public.payment_run_items           add column if not exists demo_batch_id uuid;
alter table public.donors                      add column if not exists demo_batch_id uuid;
alter table public.donations                   add column if not exists demo_batch_id uuid;
alter table public.gift_aid_claims             add column if not exists demo_batch_id uuid;
alter table public.giving_imports              add column if not exists demo_batch_id uuid;
alter table public.giving_import_rows          add column if not exists demo_batch_id uuid;
alter table public.payroll_runs                add column if not exists demo_batch_id uuid;
alter table public.payroll_run_splits          add column if not exists demo_batch_id uuid;
alter table public.bank_reconciliation_matches add column if not exists demo_batch_id uuid;

-- ============================================================
-- 2. Modify block_hard_delete() to allow demo data cleanup
-- ============================================================

create or replace function public.block_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow deletion of demo data (demo_batch_id IS NOT NULL)
  if OLD.demo_batch_id is not null then
    return OLD;
  end if;
  raise exception 'Hard deletes are not permitted on %. Use soft-delete (is_active = false) instead.', TG_TABLE_NAME;
end;
$$;

-- ============================================================
-- 3. Modify block_posted_mutation() to allow demo data cleanup
-- ============================================================

create or replace function public.block_posted_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow deletion of demo data regardless of status
  if TG_OP = 'DELETE' and OLD.demo_batch_id is not null then
    return OLD;
  end if;

  if TG_OP = 'DELETE' then
    if OLD.status::text = 'posted' then
      raise exception 'Cannot delete a posted %', TG_TABLE_NAME;
    end if;
    return OLD;
  end if;

  -- UPDATE: allow draft -> posted transition, block all other changes to posted rows
  if OLD.status::text = 'posted' then
    -- Special case for journals: allow setting reversed_by on a posted journal
    if TG_TABLE_NAME = 'journals'
       and NEW.status::text = 'posted'
       and OLD.reversed_by is null
       and NEW.reversed_by is not null
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

-- ============================================================
-- 4. Modify block_posted_journal_line_mutation() for demo cleanup
-- ============================================================

create or replace function public.block_posted_journal_line_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_demo_batch_id uuid;
begin
  -- Allow deletion of demo data
  if TG_OP = 'DELETE' and OLD.demo_batch_id is not null then
    return OLD;
  end if;

  select status::text, demo_batch_id into v_status, v_demo_batch_id
    from public.journals
    where id = coalesce(NEW.journal_id, OLD.journal_id);

  if v_status = 'posted' and v_demo_batch_id is null then
    raise exception 'Cannot mutate lines of a posted journal';
  end if;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
