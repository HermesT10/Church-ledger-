-- 00050_phase2_controls.sql
-- Phase 2: transactional posting, approval metadata, and evidence support.

-- ============================================================
-- 1. Approval + evidence columns
-- ============================================================

alter table public.journals
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz,
  add column if not exists attachment_url text,
  add column if not exists reversal_reason text;

alter table public.bills
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz;

alter table public.payment_runs
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz,
  add column if not exists attachment_url text;

alter table public.payroll_runs
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz,
  add column if not exists attachment_url text;

alter table public.payment_runs
  drop constraint if exists payment_runs_status_valid;

alter table public.payment_runs
  add constraint payment_runs_status_valid
  check (status in ('draft', 'approved', 'posted'));

alter table public.payroll_runs
  drop constraint if exists pr_status_valid;

alter table public.payroll_runs
  add constraint pr_status_valid
  check (status in ('draft', 'approved', 'posted'));

alter table public.approval_events
  drop constraint if exists ae_entity_type_valid;

alter table public.approval_events
  add constraint ae_entity_type_valid
  check (entity_type in ('journal', 'bill', 'payment_run', 'payroll_run'));

-- ============================================================
-- 2. Storage bucket for evidence
-- ============================================================

insert into storage.buckets (id, name, public)
values ('financial-evidence', 'financial-evidence', true)
on conflict (id) do nothing;

drop policy if exists financial_evidence_public_read on storage.objects;
create policy financial_evidence_public_read
on storage.objects for select
using (bucket_id = 'financial-evidence');

drop policy if exists financial_evidence_member_insert on storage.objects;
create policy financial_evidence_member_insert
on storage.objects for insert
with check (
  bucket_id = 'financial-evidence'
  and auth.role() = 'authenticated'
);

drop policy if exists financial_evidence_member_update on storage.objects;
create policy financial_evidence_member_update
on storage.objects for update
using (
  bucket_id = 'financial-evidence'
  and auth.role() = 'authenticated'
)
with check (
  bucket_id = 'financial-evidence'
  and auth.role() = 'authenticated'
);

-- ============================================================
-- 3. Helper: locked period check
-- ============================================================

create or replace function public.is_locked_financial_date(
  p_org_id uuid,
  p_entry_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.financial_periods fp
    where fp.organisation_id = p_org_id
      and fp.status = 'locked'
      and fp.start_date <= p_entry_date
      and fp.end_date >= p_entry_date
  );
$$;

revoke all on function public.is_locked_financial_date(uuid, date) from public;
grant execute on function public.is_locked_financial_date(uuid, date) to authenticated;

-- Atomic posting functions and grants are split into
-- 00051_post_bill_atomic.sql
-- 00052_post_payment_run_atomic.sql
-- 00053_post_payroll_run_atomic.sql
-- 00054_posting_function_grants.sql
-- to avoid Supabase CLI migration parser boundary issues with
-- multiple large PL/pgSQL statements in a single migration.
