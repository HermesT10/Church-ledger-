-- 00051_post_bill_atomic.sql
-- Phase 2: atomic bill posting function split from 00050 to
-- avoid Supabase CLI parser issues with large multi-function migrations.

create or replace function public.post_bill_atomic(
  p_org_id uuid,
  p_bill_id uuid,
  p_user_id uuid,
  p_environment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.bills%rowtype;
  v_creditors_account_id uuid;
  v_supplier_name text;
  v_journal_id uuid;
begin
  select *
    into v_bill
    from public.bills
   where id = p_bill_id
     and organisation_id = p_org_id
   for update;

  if not found then
    raise exception 'Bill not found.';
  end if;

  if v_bill.status = 'posted' then
    return;
  end if;

  if v_bill.status <> 'approved' then
    raise exception 'Invoice must be approved before posting.';
  end if;

  if public.is_locked_financial_date(p_org_id, v_bill.bill_date) then
    raise exception 'Cannot post: invoice date falls in a locked financial period.';
  end if;

  select default_creditors_account_id
    into v_creditors_account_id
    from public.organisation_settings
   where organisation_id = p_org_id;

  if v_creditors_account_id is null then
    raise exception 'No default creditors account configured. Set it in Settings -> Accounting.';
  end if;

  select s.name
    into v_supplier_name
    from public.suppliers s
   where s.id = v_bill.supplier_id;

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
    v_bill.bill_date,
    'Bill ' || coalesce(v_bill.bill_number, left(v_bill.id::text, 8)) || ' - ' || coalesce(v_supplier_name, 'Unknown supplier'),
    'draft',
    'bill',
    v_bill.id,
    p_user_id
  )
  returning id into v_journal_id;

  insert into public.journal_lines (
    journal_id,
    organisation_id,
    account_id,
    fund_id,
    supplier_id,
    description,
    debit_pence,
    credit_pence
  )
  select
    v_journal_id,
    p_org_id,
    bl.account_id,
    bl.fund_id,
    v_bill.supplier_id,
    coalesce(bl.description, 'Bill line'),
    bl.amount_pence,
    0
  from public.bill_lines bl
  where bl.bill_id = v_bill.id;

  if not exists (select 1 from public.bill_lines where bill_id = v_bill.id) then
    raise exception 'No bill lines found.';
  end if;

  insert into public.journal_lines (
    journal_id,
    organisation_id,
    account_id,
    fund_id,
    supplier_id,
    description,
    debit_pence,
    credit_pence
  )
  values (
    v_journal_id,
    p_org_id,
    v_creditors_account_id,
    null,
    v_bill.supplier_id,
    'Accounts payable - ' || coalesce(v_supplier_name, 'Unknown supplier'),
    0,
    v_bill.total_pence
  );

  update public.journals
     set status = 'posted',
         posted_at = now()
   where id = v_journal_id;

  update public.bills
     set status = 'posted',
         journal_id = v_journal_id
   where id = v_bill.id;

  insert into public.approval_events (
    organisation_id,
    entity_type,
    entity_id,
    action,
    performed_by
  )
  values (
    p_org_id,
    'bill',
    v_bill.id,
    'posted',
    p_user_id
  );

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
    'post_bill',
    'bill',
    v_bill.id::text,
    jsonb_build_object('journalId', v_journal_id),
    coalesce(nullif(p_environment, ''), 'unknown')
  );

  return;
end;
$$;
