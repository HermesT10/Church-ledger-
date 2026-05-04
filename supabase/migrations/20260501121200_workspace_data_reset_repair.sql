-- Repair clean-slate reset so financial references and seeded bank accounts do not survive.

create or replace function public.workspace_reset_table_order()
returns table(table_name text, module text)
language sql
stable
as $$
  values
    ('report_review_comments', 'reports'),
    ('report_approvals', 'reports'),
    ('annual_accounts_drafts', 'reports'),
    ('year_end_close_steps', 'reports'),
    ('year_end_close_runs', 'reports'),
    ('filing_packs', 'reports'),
    ('report_exports', 'reports'),
    ('report_versions', 'reports'),
    ('export_versions', 'documents'),
    ('dashboard_tasks', 'dashboard'),
    ('calendar_reminders', 'calendar'),
    ('calendar_event_links', 'calendar'),
    ('calendar_event_attendees', 'calendar'),
    ('calendar_events', 'calendar'),
    ('gift_aid_claim_line_edits', 'gift_aid'),
    ('gift_aid_exports', 'gift_aid'),
    ('gift_aid_claim_payment_allocations', 'gift_aid'),
    ('gift_aid_claim_lines', 'gift_aid'),
    ('gift_aid_claim_batches', 'gift_aid'),
    ('gift_aid_small_donation_batches', 'gift_aid'),
    ('gift_aid_reminders', 'gift_aid'),
    ('gift_aid_declaration_documents', 'gift_aid'),
    ('gift_aid_declaration_links', 'gift_aid'),
    ('donor_matching_aliases', 'gift_aid'),
    ('recurring_donor_patterns', 'gift_aid'),
    ('gift_aid_claims', 'gift_aid'),
    ('donations', 'giving'),
    ('gift_aid_declarations', 'giving'),
    ('donors', 'giving'),
    ('bank_transaction_donor_matches', 'banking'),
    ('categorisation_suggestions', 'banking'),
    ('bank_transaction_mappings', 'banking'),
    ('transaction_matches', 'banking'),
    ('bank_reconciliation_matches', 'banking'),
    ('bank_reconciliation_summaries', 'banking'),
    ('bank_reconciliation_certificates', 'banking'),
    ('reconciliations', 'banking'),
    ('cash_deposits', 'cash'),
    ('bank_rules', 'banking'),
    ('bank_lines', 'banking'),
    ('bank_statement_imports', 'banking'),
    ('bank_statements', 'banking'),
    ('bank_import_mappings', 'banking'),
    ('bank_accounts', 'banking'),
    ('portal_notifications', 'portal'),
    ('portal_tasks', 'portal'),
    ('invoice_submissions', 'workflows'),
    ('expense_requests', 'workflows'),
    ('cash_spends', 'cash'),
    ('cash_collections', 'cash'),
    ('payment_run_items', 'payables'),
    ('payment_runs', 'payables'),
    ('bill_lines', 'payables'),
    ('bills', 'payables'),
    ('giving_import_rows', 'giving'),
    ('giving_imports', 'giving'),
    ('payroll_import_rows', 'payroll'),
    ('payroll_import_batches', 'payroll'),
    ('payroll_liability_payments', 'payroll'),
    ('payroll_reversals', 'payroll'),
    ('payroll_lines', 'payroll'),
    ('payroll_run_splits', 'payroll'),
    ('payroll_runs', 'payroll'),
    ('lettings_documents', 'lettings'),
    ('lettings_payments', 'lettings'),
    ('lettings_charges', 'lettings'),
    ('lettings_hirers', 'lettings'),
    ('manual_transaction_lines', 'transactions'),
    ('manual_transactions', 'transactions'),
    ('transaction_lines', 'transactions'),
    ('transactions', 'transactions'),
    ('journal_lines', 'ledger'),
    ('journals', 'ledger'),
    ('register_category_mappings', 'registers'),
    ('register_categories', 'registers'),
    ('income_streams', 'registers'),
    ('budget_lines', 'budgets'),
    ('budgets', 'budgets'),
    ('accounts', 'accounts'),
    ('funds', 'funds')
$$;

create or replace function public.workspace_reset_column_exists(
  p_table text,
  p_column text
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = p_table
       and column_name = p_column
  );
$$;

create or replace function public.workspace_reset_null_column(
  p_table text,
  p_column text,
  p_workspace_column text,
  p_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass(format('public.%I', p_table)) is null then
    return;
  end if;

  if not public.workspace_reset_column_exists(p_table, p_column)
     or not public.workspace_reset_column_exists(p_table, p_workspace_column) then
    return;
  end if;

  execute format(
    'update public.%I set %I = null where %I = $1',
    p_table,
    p_column,
    p_workspace_column
  ) using p_workspace_id;
end;
$$;

create or replace function public.workspace_reset_prepare_financial_references(
  target_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_column text;
begin
  foreach v_column in array array[
    'default_bank_account_id',
    'default_creditors_account_id',
    'payroll_salaries_account_id',
    'payroll_er_nic_account_id',
    'payroll_pension_account_id',
    'payroll_paye_nic_liability_id',
    'payroll_pension_liability_id',
    'payroll_net_pay_liability_id',
    'gift_aid_income_account_id',
    'gift_aid_bank_account_id',
    'gift_aid_default_fund_id',
    'cash_in_hand_account_id',
    'default_donations_income_account_id',
    'default_donations_bank_account_id',
    'default_donations_fee_account_id'
  ] loop
    perform public.workspace_reset_null_column('organisation_settings', v_column, 'organisation_id', target_workspace_id);
  end loop;

  foreach v_column in array array[
    'default_salary_account_id',
    'default_employer_nic_account_id',
    'default_employer_pension_account_id',
    'default_paye_nic_liability_account_id',
    'default_pension_liability_account_id',
    'default_net_wages_liability_account_id',
    'default_fund_id'
  ] loop
    perform public.workspace_reset_null_column('payroll_settings', v_column, 'workspace_id', target_workspace_id);
  end loop;

  if to_regclass('public.user_portal_permissions') is not null then
    update public.user_portal_permissions
       set linked_bank_account_ids = '{}'::uuid[],
           assigned_budget_ids = '{}'::uuid[],
           assigned_fund_ids = '{}'::uuid[]
     where workspace_id = target_workspace_id;
  end if;

  perform public.workspace_reset_null_column('user_card_assignments', 'bank_account_id', 'workspace_id', target_workspace_id);
  perform public.workspace_reset_null_column('employees', 'default_fund_id', 'workspace_id', target_workspace_id);
  perform public.workspace_reset_null_column('employees', 'default_account_id', 'workspace_id', target_workspace_id);
end;
$$;

create or replace function public.workspace_reset_restore_blank_setup(
  target_workspace_id uuid,
  requested_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.organisations') is not null then
    update public.organisations
       set setup_mode = true,
           setup_type = 'blank',
           setup_completed_at = null
     where id = target_workspace_id;
  end if;

  if to_regclass('public.workspace_setup_progress') is not null then
    delete from public.workspace_setup_progress
     where workspace_id = target_workspace_id;

    insert into public.workspace_setup_progress (workspace_id, updated_by)
    values (target_workspace_id, requested_by)
    on conflict (workspace_id) do update
      set bank_added = false,
          statement_uploaded = false,
          transactions_categorised = false,
          funds_created = false,
          reports_viewed = false,
          skipped = false,
          updated_by = requested_by,
          updated_at = now();
  end if;
end;
$$;

create or replace function public.workspace_reset_delete_rows(
  p_table text,
  p_workspace_id uuid,
  p_demo_only boolean
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg regclass;
  v_workspace_col text;
  v_has_demo_batch boolean;
  v_sql text;
  v_deleted bigint := 0;
begin
  v_reg := to_regclass(format('public.%I', p_table));
  if v_reg is null then
    return 0;
  end if;

  select column_name into v_workspace_col
    from information_schema.columns
   where table_schema = 'public'
     and table_name = p_table
     and column_name in ('workspace_id', 'organisation_id')
   order by case column_name when 'workspace_id' then 1 else 2 end
   limit 1;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = p_table
       and column_name = 'demo_batch_id'
  ) into v_has_demo_batch;

  if p_demo_only then
    v_sql := format(
      'delete from public.%I t where exists (select 1 from public.demo_seed_records dsr where dsr.workspace_id = $1 and dsr.table_name = $2 and dsr.record_id = t.id)',
      p_table
    );
    if v_has_demo_batch and v_workspace_col is not null then
      v_sql := v_sql || format(' or (t.demo_batch_id is not null and t.%I = $1)', v_workspace_col);
    end if;
    execute v_sql using p_workspace_id, p_table;
    get diagnostics v_deleted = row_count;
    return coalesce(v_deleted, 0);
  end if;

  if v_workspace_col is not null then
    v_sql := format('delete from public.%I where %I = $1', p_table, v_workspace_col);
    execute v_sql using p_workspace_id;
    get diagnostics v_deleted = row_count;
    return coalesce(v_deleted, 0);
  end if;

  if p_table = 'bill_lines' then
    delete from public.bill_lines bl
     using public.bills b
     where bl.bill_id = b.id
       and b.organisation_id = p_workspace_id;
    get diagnostics v_deleted = row_count;
    return coalesce(v_deleted, 0);
  end if;

  if p_table = 'payment_run_items' then
    delete from public.payment_run_items pri
     using public.payment_runs pr
     where pri.payment_run_id = pr.id
       and pr.organisation_id = p_workspace_id;
    get diagnostics v_deleted = row_count;
    return coalesce(v_deleted, 0);
  end if;

  if p_table = 'payroll_run_splits' then
    delete from public.payroll_run_splits prs
     using public.payroll_runs pr
     where prs.payroll_run_id = pr.id
       and pr.organisation_id = p_workspace_id;
    get diagnostics v_deleted = row_count;
    return coalesce(v_deleted, 0);
  end if;

  return 0;
end;
$$;

create or replace function public.run_workspace_data_delete(
  target_workspace_id uuid,
  mode text,
  delete_documents boolean,
  delete_report_exports boolean,
  requested_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_demo_only boolean := mode = 'demo';
  v_action text := case when mode = 'demo' then 'delete_demo_data' else 'reset_financial_data' end;
  v_run_id uuid;
  v_counts jsonb := '{}'::jsonb;
  v_modules jsonb := '{}'::jsonb;
  v_total bigint := 0;
  v_row record;
  v_deleted bigint;
begin
  insert into public.workspace_data_reset_runs (
    workspace_id,
    action_type,
    status,
    requested_by,
    options
  )
  values (
    target_workspace_id,
    v_action,
    'requested',
    requested_by,
    jsonb_build_object('deleteDocuments', delete_documents, 'deleteReportExports', delete_report_exports)
  )
  returning id into v_run_id;

  if not v_demo_only then
    perform public.workspace_reset_prepare_financial_references(target_workspace_id);
  end if;

  if to_regclass('public.donations') is not null
     and public.workspace_reset_column_exists('donations', 'gift_aid_claim_id') then
    update public.donations
       set gift_aid_claim_id = null
     where organisation_id = target_workspace_id
       and (not v_demo_only or demo_batch_id is not null);
  end if;

  for v_row in select * from public.workspace_reset_table_order() loop
    if not delete_documents and v_row.module = 'documents' then
      continue;
    end if;
    if not delete_report_exports and v_row.module = 'reports' and v_row.table_name in ('report_exports', 'export_versions') then
      continue;
    end if;

    v_deleted := public.workspace_reset_delete_rows(v_row.table_name, target_workspace_id, v_demo_only);
    if v_deleted > 0 then
      v_counts := jsonb_set(v_counts, array[v_row.table_name], to_jsonb(v_deleted), true);
      v_modules := jsonb_set(
        v_modules,
        array[v_row.module],
        to_jsonb(coalesce((v_modules ->> v_row.module)::bigint, 0) + v_deleted),
        true
      );
      v_total := v_total + v_deleted;
    end if;
  end loop;

  delete from public.demo_seed_records where workspace_id = target_workspace_id;

  if not v_demo_only then
    perform public.workspace_reset_restore_blank_setup(target_workspace_id, requested_by);
  end if;

  update public.workspace_data_reset_runs
     set status = 'completed',
         counts = jsonb_build_object('total', v_total, 'counts', v_counts, 'modules', v_modules),
         completed_at = now()
   where id = v_run_id;

  return jsonb_build_object(
    'runId', v_run_id,
    'total', v_total,
    'counts', v_counts,
    'modules', v_modules
  );
exception
  when others then
    if v_run_id is not null then
      update public.workspace_data_reset_runs
         set status = 'failed',
             error = sqlerrm,
             completed_at = now()
       where id = v_run_id;
    end if;
    raise;
end;
$$;

revoke all on function public.workspace_reset_column_exists(text, text) from anon, authenticated;
revoke all on function public.workspace_reset_null_column(text, text, text, uuid) from anon, authenticated;
revoke all on function public.workspace_reset_prepare_financial_references(uuid) from anon, authenticated;
revoke all on function public.workspace_reset_restore_blank_setup(uuid, uuid) from anon, authenticated;
