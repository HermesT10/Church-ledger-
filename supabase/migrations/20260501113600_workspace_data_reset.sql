-- Workspace data management: demo deletion, financial reset, previews, and reset history.

create table if not exists public.workspace_data_reset_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  action_type text not null,
  status text not null default 'requested',
  requested_by uuid references public.profiles(id) on delete set null,
  options jsonb not null default '{}'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workspace_data_reset_runs_action_check check (action_type in ('delete_demo_data', 'reset_financial_data')),
  constraint workspace_data_reset_runs_status_check check (status in ('requested', 'completed', 'failed'))
);

create index if not exists idx_workspace_data_reset_runs_workspace_created
  on public.workspace_data_reset_runs (workspace_id, created_at desc);

create table if not exists public.demo_seed_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  demo_batch_id uuid,
  created_at timestamptz not null default now(),
  constraint demo_seed_records_unique_record unique (workspace_id, table_name, record_id)
);

create index if not exists idx_demo_seed_records_workspace_table
  on public.demo_seed_records (workspace_id, table_name, record_id);

alter table public.workspace_data_reset_runs enable row level security;
alter table public.workspace_data_reset_runs force row level security;
alter table public.demo_seed_records enable row level security;
alter table public.demo_seed_records force row level security;

drop policy if exists workspace_data_reset_runs_select_admin on public.workspace_data_reset_runs;
create policy workspace_data_reset_runs_select_admin
  on public.workspace_data_reset_runs
  for select using (public.is_org_admin(workspace_id));

drop policy if exists workspace_data_reset_runs_manage_admin on public.workspace_data_reset_runs;
create policy workspace_data_reset_runs_manage_admin
  on public.workspace_data_reset_runs
  for all using (public.is_org_admin(workspace_id))
  with check (public.is_org_admin(workspace_id));

drop policy if exists demo_seed_records_select_admin on public.demo_seed_records;
create policy demo_seed_records_select_admin
  on public.demo_seed_records
  for select using (public.is_org_admin(workspace_id));

drop policy if exists demo_seed_records_manage_admin on public.demo_seed_records;
create policy demo_seed_records_manage_admin
  on public.demo_seed_records
  for all using (public.is_org_admin(workspace_id))
  with check (public.is_org_admin(workspace_id));

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
    ('bank_reconciliation_matches', 'banking'),
    ('bank_reconciliation_summaries', 'banking'),
    ('bank_rules', 'banking'),
    ('bank_lines', 'banking'),
    ('bank_statement_imports', 'banking'),
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

create or replace function public.workspace_reset_count_rows(
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
  v_count bigint := 0;
  v_sql text;
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
      'select count(*) from public.%I t where exists (select 1 from public.demo_seed_records dsr where dsr.workspace_id = $1 and dsr.table_name = $2 and dsr.record_id = t.id)',
      p_table
    );
    if v_has_demo_batch and v_workspace_col is not null then
      v_sql := v_sql || format(' or (t.demo_batch_id is not null and t.%I = $1)', v_workspace_col);
    end if;
    execute v_sql using p_workspace_id, p_table into v_count;
    return coalesce(v_count, 0);
  end if;

  if v_workspace_col is null then
    return 0;
  end if;

  v_sql := format('select count(*) from public.%I where %I = $1', p_table, v_workspace_col);
  execute v_sql using p_workspace_id into v_count;
  return coalesce(v_count, 0);
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

  if v_workspace_col is null then
    return 0;
  end if;

  v_sql := format('delete from public.%I where %I = $1', p_table, v_workspace_col);
  execute v_sql using p_workspace_id;
  get diagnostics v_deleted = row_count;
  return coalesce(v_deleted, 0);
end;
$$;

create or replace function public.preview_workspace_data_reset(
  target_workspace_id uuid,
  mode text default 'financial',
  delete_documents boolean default false,
  delete_report_exports boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_demo_only boolean := mode = 'demo';
  v_counts jsonb := '{}'::jsonb;
  v_modules jsonb := '{}'::jsonb;
  v_total bigint := 0;
  v_row record;
  v_count bigint;
begin
  for v_row in select * from public.workspace_reset_table_order() loop
    if not delete_documents and v_row.module = 'documents' then
      continue;
    end if;
    if not delete_report_exports and v_row.module = 'reports' and v_row.table_name in ('report_exports', 'export_versions') then
      continue;
    end if;

    v_count := public.workspace_reset_count_rows(v_row.table_name, target_workspace_id, v_demo_only);
    if v_count > 0 then
      v_counts := jsonb_set(v_counts, array[v_row.table_name], to_jsonb(v_count), true);
      v_modules := jsonb_set(
        v_modules,
        array[v_row.module],
        to_jsonb(coalesce((v_modules ->> v_row.module)::bigint, 0) + v_count),
        true
      );
      v_total := v_total + v_count;
    end if;
  end loop;

  return jsonb_build_object(
    'mode', mode,
    'total', v_total,
    'counts', v_counts,
    'modules', v_modules,
    'options', jsonb_build_object(
      'deleteDocuments', delete_documents,
      'deleteReportExports', delete_report_exports
    )
  );
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

  if to_regclass('public.donations') is not null then
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

create or replace function public.delete_workspace_demo_data(
  target_workspace_id uuid,
  delete_documents boolean default false,
  delete_report_exports boolean default false,
  requested_by uuid default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.run_workspace_data_delete(target_workspace_id, 'demo', delete_documents, delete_report_exports, requested_by);
$$;

create or replace function public.reset_workspace_financial_data(
  target_workspace_id uuid,
  delete_documents boolean default false,
  delete_report_exports boolean default false,
  requested_by uuid default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.run_workspace_data_delete(target_workspace_id, 'financial', delete_documents, delete_report_exports, requested_by);
$$;

revoke all on function public.preview_workspace_data_reset(uuid, text, boolean, boolean) from anon, authenticated;
revoke all on function public.delete_workspace_demo_data(uuid, boolean, boolean, uuid) from anon, authenticated;
revoke all on function public.reset_workspace_financial_data(uuid, boolean, boolean, uuid) from anon, authenticated;
revoke all on function public.run_workspace_data_delete(uuid, text, boolean, boolean, uuid) from anon, authenticated;
