-- One statement per file: supabase db push uses prepared statements that accept a single command.

create or replace function public.post_bank_allocation_atomic(
  p_org_id uuid,
  p_bank_line_id uuid,
  p_account_id uuid,
  p_fund_id uuid,
  p_supplier_id uuid,
  p_user_id uuid,
  p_environment text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_bank_line public.bank_lines%rowtype;
  v_bank_account record;
  v_journal_id uuid;
  v_amount_pence bigint;
  v_is_income boolean;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Authenticated user does not match posting user.';
  end if;

  if not public.is_org_treasurer_or_admin(p_org_id) then
    raise exception 'Permission denied.';
  end if;

  select *
    into v_bank_line
    from public.bank_lines
   where id = p_bank_line_id
     and organisation_id = p_org_id
   for update;

  if not found then
    raise exception 'Bank line not found.';
  end if;

  if v_bank_line.allocated then
    raise exception 'This bank line is already allocated.';
  end if;

  if not exists (
    select 1 from public.accounts
     where id = p_account_id
       and organisation_id = p_org_id
       and is_active = true
  ) then
    raise exception 'Account not found or inactive.';
  end if;

  if not exists (
    select 1 from public.funds
     where id = p_fund_id
       and organisation_id = p_org_id
       and is_active = true
  ) then
    raise exception 'Fund not found or inactive.';
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers
     where id = p_supplier_id
       and organisation_id = p_org_id
       and is_active = true
  ) then
    raise exception 'Supplier not found or inactive.';
  end if;

  select id, linked_account_id, name
    into v_bank_account
    from public.bank_accounts
   where id = v_bank_line.bank_account_id
     and organisation_id = p_org_id;

  if not found then
    raise exception 'Bank account not found.';
  end if;

  insert into public.allocations (
    organisation_id,
    bank_line_id,
    account_id,
    fund_id,
    supplier_id,
    amount_pence,
    created_by
  )
  values (
    p_org_id,
    p_bank_line_id,
    p_account_id,
    p_fund_id,
    p_supplier_id,
    v_bank_line.amount_pence,
    p_user_id
  );

  if v_bank_account.linked_account_id is not null then
    if public.is_locked_financial_date(p_org_id, coalesce(v_bank_line.txn_date, current_date)) then
      raise exception 'Cannot allocate: the transaction date falls in a locked financial period.';
    end if;

    v_amount_pence := abs(v_bank_line.amount_pence);
    v_is_income := v_bank_line.amount_pence > 0;

    insert into public.journals (
      organisation_id,
      journal_date,
      memo,
      reference,
      status,
      source_type,
      source_id,
      created_by
    )
    values (
      p_org_id,
      coalesce(v_bank_line.txn_date, current_date),
      left('Bank allocation: ' || coalesce(v_bank_line.description, ''), 255),
      'BANK-' || upper(left(p_bank_line_id::text, 8)),
      'draft',
      'bank',
      p_bank_line_id,
      p_user_id
    )
    returning id into v_journal_id;

    if v_is_income then
      insert into public.journal_lines (
        journal_id, organisation_id, account_id, fund_id, supplier_id,
        description, debit_pence, credit_pence
      )
      values
        (
          v_journal_id, p_org_id, v_bank_account.linked_account_id, p_fund_id, null,
          coalesce(v_bank_account.name, 'Bank') || ' deposit', v_amount_pence, 0
        ),
        (
          v_journal_id, p_org_id, p_account_id, p_fund_id, p_supplier_id,
          coalesce(v_bank_line.description, 'Bank income allocation'), 0, v_amount_pence
        );
    else
      insert into public.journal_lines (
        journal_id, organisation_id, account_id, fund_id, supplier_id,
        description, debit_pence, credit_pence
      )
      values
        (
          v_journal_id, p_org_id, p_account_id, p_fund_id, p_supplier_id,
          coalesce(v_bank_line.description, 'Bank expense allocation'), v_amount_pence, 0
        ),
        (
          v_journal_id, p_org_id, v_bank_account.linked_account_id, p_fund_id, null,
          coalesce(v_bank_account.name, 'Bank') || ' payment', 0, v_amount_pence
        );
    end if;

    update public.journals
       set status = 'posted'
     where id = v_journal_id;
  end if;

  update public.bank_lines
     set allocated = true
   where id = p_bank_line_id
     and organisation_id = p_org_id;

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
    'allocate_bank_line',
    'bank_line',
    p_bank_line_id::text,
    jsonb_build_object(
      'journalId', v_journal_id,
      'accountId', p_account_id,
      'fundId', p_fund_id,
      'supplierId', p_supplier_id
    ),
    coalesce(nullif(p_environment, ''), 'unknown')
  );

  return v_journal_id;
exception
  when unique_violation then
    raise exception 'This bank line is already allocated.';
end;
$fn$;
