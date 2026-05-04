-- 00052_post_payment_run_atomic.sql
-- Phase 2: atomic payment run posting function split from 00050.

create or replace function public.post_payment_run_atomic(
  p_org_id uuid,
  p_payment_run_id uuid,
  p_user_id uuid,
  p_bank_account_id uuid,
  p_environment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.payment_runs%rowtype;
  v_creditors_account_id uuid;
  v_bank_gl_account_id uuid;
  v_journal_id uuid;
  v_paid_bill_count integer;
  v_dup_bill_id uuid;
begin
  select *
    into v_run
    from public.payment_runs
   where id = p_payment_run_id
     and organisation_id = p_org_id
   for update;

  if not found then
    raise exception 'Payment run not found.';
  end if;

  if v_run.status = 'posted' then
    return;
  end if;

  if v_run.status <> 'approved' then
    raise exception 'Only approved payment runs can be posted.';
  end if;

  if public.is_locked_financial_date(p_org_id, v_run.run_date) then
    raise exception 'Cannot post: payment run date falls in a locked financial period.';
  end if;

  select default_creditors_account_id
    into v_creditors_account_id
    from public.organisation_settings
   where organisation_id = p_org_id;

  if v_creditors_account_id is null then
    raise exception 'No default creditors account configured. Set it in Settings -> Accounting.';
  end if;

  select coalesce(linked_account_id, id)
    into v_bank_gl_account_id
    from public.bank_accounts
   where id = p_bank_account_id
     and organisation_id = p_org_id;

  if v_bank_gl_account_id is null then
    raise exception 'Selected bank account is invalid.';
  end if;

  if not exists (
    select 1
      from public.payment_run_items pri
     where pri.payment_run_id = p_payment_run_id
  ) then
    raise exception 'No items found in payment run.';
  end if;

  select pri.bill_id
    into v_dup_bill_id
    from public.payment_run_items pri
    join public.bills b on b.id = pri.bill_id
   where pri.payment_run_id = p_payment_run_id
     and b.status <> 'posted'
   limit 1;

  if v_dup_bill_id is not null then
    raise exception 'Only posted invoices can be included in a payment run.';
  end if;

  insert into public.journals (
    organisation_id,
    journal_date,
    memo,
    status,
    source_type,
    source_id,
    created_by
  )
  values (
    p_org_id,
    v_run.run_date,
    'Payment Run ' || left(v_run.id::text, 8),
    'draft',
    'payment',
    v_run.id,
    p_user_id
  )
  returning id into v_journal_id;

  insert into public.journal_lines (
    journal_id,
    organisation_id,
    account_id,
    fund_id,
    description,
    debit_pence,
    credit_pence
  )
  select
    v_journal_id,
    p_org_id,
    v_creditors_account_id,
    null,
    'Payment - Invoice ' || coalesce(b.bill_number, left(b.id::text, 8)),
    pri.amount_pence,
    0
  from public.payment_run_items pri
  join public.bills b on b.id = pri.bill_id
  where pri.payment_run_id = p_payment_run_id;

  insert into public.journal_lines (
    journal_id,
    organisation_id,
    account_id,
    fund_id,
    description,
    debit_pence,
    credit_pence
  )
  values (
    v_journal_id,
    p_org_id,
    v_bank_gl_account_id,
    null,
    'Payment run bank transfer',
    0,
    v_run.total_pence
  );

  update public.journals
     set status = 'posted',
         posted_at = now()
   where id = v_journal_id;

  update public.payment_runs
     set status = 'posted',
         journal_id = v_journal_id,
         bank_account_id = p_bank_account_id
   where id = v_run.id;

  update public.bills
     set status = 'paid'
   where id in (
     select bill_id
     from public.payment_run_items
     where payment_run_id = p_payment_run_id
   );

  insert into public.approval_events (
    organisation_id,
    entity_type,
    entity_id,
    action,
    performed_by
  )
  values (
    p_org_id,
    'payment_run',
    v_run.id,
    'posted',
    p_user_id
  );

  insert into public.approval_events (
    organisation_id,
    entity_type,
    entity_id,
    action,
    performed_by
  )
  select
    p_org_id,
    'bill',
    pri.bill_id,
    'paid',
    p_user_id
  from public.payment_run_items pri
  where pri.payment_run_id = p_payment_run_id;

  select count(*)
    into v_paid_bill_count
    from public.payment_run_items
   where payment_run_id = p_payment_run_id;

  insert into public.audit_log (
    organisation_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    environment
  )
  values (
    p_org_id,
    p_user_id,
    'post_payment_run',
    'payment_run',
    v_run.id::text,
    jsonb_build_object('journalId', v_journal_id, 'billCount', v_paid_bill_count),
    coalesce(nullif(p_environment, ''), 'unknown')
  );

  return;
end;
$$;
