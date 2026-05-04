-- 00053_post_payroll_run_atomic.sql
-- Phase 2: atomic payroll posting function split from 00050.

create or replace function public.post_payroll_run_atomic(
  p_org_id uuid,
  p_run_id uuid,
  p_user_id uuid,
  p_environment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.payroll_runs%rowtype;
  v_settings record;
  v_journal_id uuid;
begin
  select *
    into v_run
    from public.payroll_runs
   where id = p_run_id
     and organisation_id = p_org_id
   for update;

  if not found then
    raise exception 'Payroll run not found.';
  end if;

  if v_run.status = 'posted' then
    return;
  end if;

  if v_run.status <> 'approved' then
    raise exception 'Only approved payroll runs can be posted.';
  end if;

  if public.is_locked_financial_date(p_org_id, v_run.payroll_month) then
    raise exception 'Cannot post: payroll month falls in a locked financial period.';
  end if;

  select
    payroll_salaries_account_id,
    payroll_er_nic_account_id,
    payroll_pension_account_id,
    payroll_paye_nic_liability_id,
    payroll_pension_liability_id,
    payroll_net_pay_liability_id
    into v_settings
    from public.organisation_settings
   where organisation_id = p_org_id;

  if v_settings.payroll_salaries_account_id is null
     or v_settings.payroll_er_nic_account_id is null
     or v_settings.payroll_pension_account_id is null
     or v_settings.payroll_paye_nic_liability_id is null
     or v_settings.payroll_pension_liability_id is null
     or v_settings.payroll_net_pay_liability_id is null then
    raise exception 'All 6 payroll accounts must be configured in Settings -> Payroll Accounts before posting.';
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
    v_run.payroll_month,
    'Payroll - ' || to_char(v_run.payroll_month, 'YYYY-MM'),
    'draft',
    'payroll',
    v_run.id,
    p_user_id
  )
  returning id into v_journal_id;

  if exists (
    select 1
    from public.payroll_run_splits prs
    where prs.payroll_run_id = p_run_id
  ) then
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
      v_settings.payroll_salaries_account_id,
      prs.fund_id,
      'Payroll salaries',
      prs.amount_pence,
      0
    from public.payroll_run_splits prs
    where prs.payroll_run_id = p_run_id;
  else
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
      v_settings.payroll_salaries_account_id,
      null,
      'Payroll salaries',
      v_run.total_gross_pence,
      0
    );
  end if;

  if v_run.total_nic_pence > 0 then
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
      v_settings.payroll_er_nic_account_id,
      null,
      'Employer NIC',
      v_run.total_nic_pence,
      0
    );
  end if;

  if v_run.total_pension_pence > 0 then
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
      v_settings.payroll_pension_account_id,
      null,
      'Employer pension',
      v_run.total_pension_pence,
      0
    );
  end if;

  if v_run.total_paye_pence > 0 then
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
      v_settings.payroll_paye_nic_liability_id,
      null,
      'PAYE / NIC liability',
      0,
      v_run.total_paye_pence
    );
  end if;

  if v_run.total_pension_pence > 0 then
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
      v_settings.payroll_pension_liability_id,
      null,
      'Pension liability',
      0,
      v_run.total_pension_pence
    );
  end if;

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
    v_settings.payroll_net_pay_liability_id,
    null,
    'Net pay liability',
    0,
    v_run.total_net_pence
  );

  update public.journals
     set status = 'posted',
         posted_at = now()
   where id = v_journal_id;

  update public.payroll_runs
     set status = 'posted',
         journal_id = v_journal_id
   where id = v_run.id;

  insert into public.approval_events (
    organisation_id,
    entity_type,
    entity_id,
    action,
    performed_by
  )
  values (
    p_org_id,
    'payroll_run',
    v_run.id,
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
    'post_payroll_run',
    'payroll_run',
    v_run.id::text,
    jsonb_build_object('journalId', v_journal_id),
    coalesce(nullif(p_environment, ''), 'unknown')
  );

  return;
end;
$$;
