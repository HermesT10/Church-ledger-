-- Treasurer-grade payroll accounting controls, imports, liabilities, and reporting foundations.

alter table public.employees
  add column if not exists department_ministry text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists payroll_status text not null default 'active',
  add column if not exists default_fund_id uuid references public.funds(id) on delete set null,
  add column if not exists default_account_id uuid references public.accounts(id) on delete set null,
  add column if not exists pension_scheme_participation text not null default 'none',
  add column if not exists payroll_reference text;

alter table public.employees
  drop constraint if exists employees_payroll_status_check;

alter table public.employees
  add constraint employees_payroll_status_check
  check (payroll_status in ('active', 'on_leave', 'ended', 'excluded'));

alter table public.employees
  drop constraint if exists employees_pension_scheme_participation_check;

alter table public.employees
  add constraint employees_pension_scheme_participation_check
  check (pension_scheme_participation in ('none', 'employee', 'employer', 'both'));

alter table public.payroll_runs
  add column if not exists payment_date date,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists paid_by uuid references public.profiles(id) on delete set null,
  add column if not exists paid_at timestamptz,
  add column if not exists reconciled_by uuid references public.profiles(id) on delete set null,
  add column if not exists reconciled_at timestamptz,
  add column if not exists reversed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reversed_at timestamptz,
  add column if not exists payment_reference text,
  add column if not exists total_employee_nic_pence integer not null default 0,
  add column if not exists total_employer_nic_pence integer,
  add column if not exists total_employee_pension_pence integer not null default 0,
  add column if not exists total_employer_pension_pence integer,
  add column if not exists total_other_deductions_pence integer not null default 0,
  add column if not exists total_employer_cost_pence integer;

-- Existing rows are read with application fallbacks to avoid touching posted
-- payroll runs protected by immutable posting triggers.

alter table public.payroll_runs
  drop constraint if exists payroll_runs_status_check;

alter table public.payroll_runs
  add constraint payroll_runs_status_check
  check (status in ('draft', 'reviewed', 'approved', 'posted', 'paid', 'reconciled', 'reversed', 'archived'));

alter table public.payroll_lines
  add column if not exists employee_nic_pence integer not null default 0,
  add column if not exists employer_nic_pence integer,
  add column if not exists employee_pension_pence integer not null default 0,
  add column if not exists employer_pension_pence integer,
  add column if not exists other_deductions_pence integer not null default 0,
  add column if not exists fund_id uuid references public.funds(id) on delete set null,
  add column if not exists account_id uuid references public.accounts(id) on delete set null,
  add column if not exists department_ministry text,
  add column if not exists notes text;

update public.payroll_lines
   set employer_nic_pence = coalesce(employer_nic_pence, employer_ni_pence, 0),
       employer_pension_pence = coalesce(employer_pension_pence, pension_pence, 0);

create table if not exists public.payroll_import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  file_name text,
  file_path text,
  provider text,
  period_start date not null,
  period_end date not null,
  payment_date date,
  status text not null default 'draft',
  mapping jsonb not null default '{}'::jsonb,
  validation_results jsonb not null default '[]'::jsonb,
  imported_by uuid references public.profiles(id) on delete set null,
  imported_at timestamptz,
  committed_run_id uuid references public.payroll_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_import_batches_status_check check (status in ('draft', 'validated', 'committed', 'rejected', 'archived')),
  constraint payroll_import_batches_mapping_object check (jsonb_typeof(mapping) = 'object'),
  constraint payroll_import_batches_validation_array check (jsonb_typeof(validation_results) = 'array')
);

create table if not exists public.payroll_import_rows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  batch_id uuid not null references public.payroll_import_batches(id) on delete cascade,
  row_number integer not null,
  raw_data jsonb not null default '{}'::jsonb,
  mapped_data jsonb not null default '{}'::jsonb,
  employee_id uuid references public.employees(id) on delete set null,
  validation_status text not null default 'pending',
  validation_errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint payroll_import_rows_validation_status_check check (validation_status in ('pending', 'valid', 'warning', 'error')),
  constraint payroll_import_rows_raw_object check (jsonb_typeof(raw_data) = 'object'),
  constraint payroll_import_rows_mapped_object check (jsonb_typeof(mapped_data) = 'object'),
  constraint payroll_import_rows_errors_array check (jsonb_typeof(validation_errors) = 'array')
);

create table if not exists public.payroll_liability_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  payroll_run_id uuid references public.payroll_runs(id) on delete cascade,
  liability_type text not null,
  amount_pence integer not null,
  payment_date date,
  payment_reference text,
  bank_transaction_id uuid,
  reconciliation_match_id uuid,
  status text not null default 'pending',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_liability_payments_type_check check (liability_type in ('net_wages', 'paye_nic', 'pension')),
  constraint payroll_liability_payments_status_check check (status in ('pending', 'paid', 'reconciled', 'waived')),
  constraint payroll_liability_payments_amount_check check (amount_pence >= 0)
);

create table if not exists public.payroll_reversals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  original_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  reversal_journal_id uuid references public.journals(id) on delete set null,
  correction_run_id uuid references public.payroll_runs(id) on delete set null,
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payroll_reversals_reason_check check (length(trim(reason)) >= 10)
);

create table if not exists public.payroll_settings (
  workspace_id uuid primary key references public.organisations(id) on delete cascade,
  default_salary_account_id uuid references public.accounts(id) on delete set null,
  default_employer_nic_account_id uuid references public.accounts(id) on delete set null,
  default_employer_pension_account_id uuid references public.accounts(id) on delete set null,
  default_paye_nic_liability_account_id uuid references public.accounts(id) on delete set null,
  default_pension_liability_account_id uuid references public.accounts(id) on delete set null,
  default_net_wages_liability_account_id uuid references public.accounts(id) on delete set null,
  default_fund_id uuid references public.funds(id) on delete set null,
  pension_provider_name text,
  pension_provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employees_workspace_payroll_status_idx
  on public.employees (organisation_id, payroll_status);

create index if not exists payroll_runs_workspace_status_payment_idx
  on public.payroll_runs (organisation_id, status, payment_date);

create index if not exists payroll_lines_run_employee_idx
  on public.payroll_lines (payroll_run_id, employee_id);

create index if not exists payroll_import_rows_batch_idx
  on public.payroll_import_rows (workspace_id, batch_id, row_number);

create index if not exists payroll_liability_payments_run_idx
  on public.payroll_liability_payments (workspace_id, payroll_run_id, liability_type, status);

create index if not exists payroll_reversals_original_run_idx
  on public.payroll_reversals (workspace_id, original_run_id);

drop trigger if exists trg_payroll_import_batches_touch_updated_at on public.payroll_import_batches;
create trigger trg_payroll_import_batches_touch_updated_at
  before update on public.payroll_import_batches
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_payroll_liability_payments_touch_updated_at on public.payroll_liability_payments;
create trigger trg_payroll_liability_payments_touch_updated_at
  before update on public.payroll_liability_payments
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_payroll_settings_touch_updated_at on public.payroll_settings;
create trigger trg_payroll_settings_touch_updated_at
  before update on public.payroll_settings
  for each row execute function public.touch_updated_at();

alter table public.payroll_import_batches enable row level security;
alter table public.payroll_import_rows enable row level security;
alter table public.payroll_liability_payments enable row level security;
alter table public.payroll_reversals enable row level security;
alter table public.payroll_settings enable row level security;

drop policy if exists payroll_import_batches_select_member on public.payroll_import_batches;
create policy payroll_import_batches_select_member on public.payroll_import_batches
  for select using (public.is_org_member(workspace_id));

drop policy if exists payroll_import_batches_manage_treasurer_admin on public.payroll_import_batches;
create policy payroll_import_batches_manage_treasurer_admin on public.payroll_import_batches
  for all using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists payroll_import_rows_select_member on public.payroll_import_rows;
create policy payroll_import_rows_select_member on public.payroll_import_rows
  for select using (public.is_org_member(workspace_id));

drop policy if exists payroll_import_rows_manage_treasurer_admin on public.payroll_import_rows;
create policy payroll_import_rows_manage_treasurer_admin on public.payroll_import_rows
  for all using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists payroll_liability_payments_select_member on public.payroll_liability_payments;
create policy payroll_liability_payments_select_member on public.payroll_liability_payments
  for select using (public.is_org_member(workspace_id));

drop policy if exists payroll_liability_payments_manage_treasurer_admin on public.payroll_liability_payments;
create policy payroll_liability_payments_manage_treasurer_admin on public.payroll_liability_payments
  for all using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists payroll_reversals_select_member on public.payroll_reversals;
create policy payroll_reversals_select_member on public.payroll_reversals
  for select using (public.is_org_member(workspace_id));

drop policy if exists payroll_reversals_manage_treasurer_admin on public.payroll_reversals;
create policy payroll_reversals_manage_treasurer_admin on public.payroll_reversals
  for all using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists payroll_settings_select_member on public.payroll_settings;
create policy payroll_settings_select_member on public.payroll_settings
  for select using (public.is_org_member(workspace_id));

drop policy if exists payroll_settings_manage_treasurer_admin on public.payroll_settings;
create policy payroll_settings_manage_treasurer_admin on public.payroll_settings
  for all using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists payroll_lines_insert_draft_runs on public.payroll_lines;
create policy payroll_lines_insert_draft_runs on public.payroll_lines
  for insert
  with check (
    exists (
      select 1
      from public.payroll_runs pr
      where pr.id = payroll_lines.payroll_run_id
        and pr.status = 'draft'
        and public.is_org_treasurer_or_admin(pr.organisation_id)
    )
  );

drop policy if exists payroll_lines_delete_draft_runs on public.payroll_lines;
create policy payroll_lines_delete_draft_runs on public.payroll_lines
  for delete
  using (
    exists (
      select 1
      from public.payroll_runs pr
      where pr.id = payroll_lines.payroll_run_id
        and pr.status = 'draft'
        and public.is_org_treasurer_or_admin(pr.organisation_id)
    )
  );

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
  v_employer_nic_pence integer;
  v_employee_nic_pence integer;
  v_employer_pension_pence integer;
  v_employee_pension_pence integer;
  v_paye_nic_liability_pence integer;
  v_pension_liability_pence integer;
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

  if public.is_locked_financial_date(p_org_id, coalesce(v_run.payment_date, v_run.period_end, v_run.payroll_month)) then
    raise exception 'Cannot post: payroll payment date falls in a locked financial period.';
  end if;

  v_employer_nic_pence := coalesce(v_run.total_employer_nic_pence, v_run.total_nic_pence, 0);
  v_employee_nic_pence := coalesce(v_run.total_employee_nic_pence, 0);
  v_employer_pension_pence := coalesce(v_run.total_employer_pension_pence, v_run.total_pension_pence, 0);
  v_employee_pension_pence := coalesce(v_run.total_employee_pension_pence, 0);
  v_paye_nic_liability_pence := coalesce(v_run.total_paye_pence, 0) + v_employee_nic_pence + v_employer_nic_pence;
  v_pension_liability_pence := v_employee_pension_pence + v_employer_pension_pence;

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
    coalesce(v_run.payment_date, v_run.period_end, v_run.payroll_month),
    'Payroll - ' || to_char(v_run.payroll_month, 'YYYY-MM'),
    'draft',
    'payroll',
    v_run.id,
    p_user_id
  )
  returning id into v_journal_id;

  if exists (select 1 from public.payroll_run_splits prs where prs.payroll_run_id = p_run_id) then
    insert into public.journal_lines (journal_id, organisation_id, account_id, fund_id, description, debit_pence, credit_pence)
    select v_journal_id, p_org_id, v_settings.payroll_salaries_account_id, prs.fund_id, 'Payroll salaries', prs.amount_pence, 0
    from public.payroll_run_splits prs
    where prs.payroll_run_id = p_run_id;

    if v_employer_nic_pence > 0 then
      insert into public.journal_lines (journal_id, organisation_id, account_id, fund_id, description, debit_pence, credit_pence)
      select v_journal_id, p_org_id, v_settings.payroll_er_nic_account_id, prs.fund_id, 'Employer NIC',
             round((prs.amount_pence::numeric / nullif(v_run.total_gross_pence, 0)) * v_employer_nic_pence)::integer, 0
      from public.payroll_run_splits prs
      where prs.payroll_run_id = p_run_id;
    end if;

    if v_employer_pension_pence > 0 then
      insert into public.journal_lines (journal_id, organisation_id, account_id, fund_id, description, debit_pence, credit_pence)
      select v_journal_id, p_org_id, v_settings.payroll_pension_account_id, prs.fund_id, 'Employer pension',
             round((prs.amount_pence::numeric / nullif(v_run.total_gross_pence, 0)) * v_employer_pension_pence)::integer, 0
      from public.payroll_run_splits prs
      where prs.payroll_run_id = p_run_id;
    end if;
  else
    insert into public.journal_lines (journal_id, organisation_id, account_id, fund_id, description, debit_pence, credit_pence)
    values (v_journal_id, p_org_id, v_settings.payroll_salaries_account_id, null, 'Payroll salaries', v_run.total_gross_pence, 0);

    if v_employer_nic_pence > 0 then
      insert into public.journal_lines (journal_id, organisation_id, account_id, fund_id, description, debit_pence, credit_pence)
      values (v_journal_id, p_org_id, v_settings.payroll_er_nic_account_id, null, 'Employer NIC', v_employer_nic_pence, 0);
    end if;

    if v_employer_pension_pence > 0 then
      insert into public.journal_lines (journal_id, organisation_id, account_id, fund_id, description, debit_pence, credit_pence)
      values (v_journal_id, p_org_id, v_settings.payroll_pension_account_id, null, 'Employer pension', v_employer_pension_pence, 0);
    end if;
  end if;

  if v_paye_nic_liability_pence > 0 then
    insert into public.journal_lines (journal_id, organisation_id, account_id, fund_id, description, debit_pence, credit_pence)
    values (v_journal_id, p_org_id, v_settings.payroll_paye_nic_liability_id, null, 'PAYE / NIC liability', 0, v_paye_nic_liability_pence);
  end if;

  if v_pension_liability_pence > 0 then
    insert into public.journal_lines (journal_id, organisation_id, account_id, fund_id, description, debit_pence, credit_pence)
    values (v_journal_id, p_org_id, v_settings.payroll_pension_liability_id, null, 'Pension liability', 0, v_pension_liability_pence);
  end if;

  insert into public.journal_lines (journal_id, organisation_id, account_id, fund_id, description, debit_pence, credit_pence)
  values (v_journal_id, p_org_id, v_settings.payroll_net_pay_liability_id, null, 'Net pay liability', 0, v_run.total_net_pence);

  update public.journals
     set status = 'posted',
         posted_at = now()
   where id = v_journal_id;

  update public.payroll_runs
     set status = 'posted',
         journal_id = v_journal_id,
         total_employer_nic_pence = v_employer_nic_pence,
         total_employer_pension_pence = v_employer_pension_pence,
         total_employer_cost_pence = v_run.total_gross_pence + v_employer_nic_pence + v_employer_pension_pence
   where id = v_run.id;

  insert into public.payroll_liability_payments (workspace_id, payroll_run_id, liability_type, amount_pence, payment_date, payment_reference, status, created_by)
  values
    (p_org_id, v_run.id, 'net_wages', v_run.total_net_pence, v_run.payment_date, v_run.payment_reference, 'pending', p_user_id),
    (p_org_id, v_run.id, 'paye_nic', v_paye_nic_liability_pence, v_run.payment_date, v_run.payment_reference, 'pending', p_user_id),
    (p_org_id, v_run.id, 'pension', v_pension_liability_pence, v_run.payment_date, v_run.payment_reference, 'pending', p_user_id);

  insert into public.approval_events (organisation_id, entity_type, entity_id, action, performed_by)
  values (p_org_id, 'payroll_run', v_run.id, 'posted', p_user_id);

  insert into public.audit_log (organisation_id, user_id, action, entity_type, entity_id, metadata, environment)
  values (
    p_org_id,
    p_user_id,
    'post_payroll_run',
    'payroll_run',
    v_run.id,
    jsonb_build_object('journal_id', v_journal_id, 'paye_nic_liability_pence', v_paye_nic_liability_pence, 'pension_liability_pence', v_pension_liability_pence),
    p_environment
  );
end;
$$;
