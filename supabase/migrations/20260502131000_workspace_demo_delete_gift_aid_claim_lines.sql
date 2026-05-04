-- Demo data delete: gift_aid_claim_lines often has no demo_batch_id / demo_seed row
-- but still references demo-tagged donations. Extend demo-only count/delete so those
-- lines are removed before donations, avoiding gift_aid_claim_lines_donation_id_fkey failures.

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
    if p_table = 'gift_aid_claim_lines'
       and v_workspace_col is not null
       and to_regclass('public.donations') is not null then
      v_sql := v_sql || format(
        ' or (t.donation_id is not null and t.%I = $1 and exists ('
        'select 1 from public.donations d where d.id = t.donation_id and d.organisation_id = $1 '
        'and (d.demo_batch_id is not null or exists ('
        'select 1 from public.demo_seed_records dsr_d '
        'where dsr_d.workspace_id = $1 and dsr_d.table_name = %L and dsr_d.record_id = d.id'
        '))))',
        v_workspace_col,
        'donations'
      );
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
    if p_table = 'gift_aid_claim_lines'
       and v_workspace_col is not null
       and to_regclass('public.donations') is not null then
      v_sql := v_sql || format(
        ' or (t.donation_id is not null and t.%I = $1 and exists ('
        'select 1 from public.donations d where d.id = t.donation_id and d.organisation_id = $1 '
        'and (d.demo_batch_id is not null or exists ('
        'select 1 from public.demo_seed_records dsr_d '
        'where dsr_d.workspace_id = $1 and dsr_d.table_name = %L and dsr_d.record_id = d.id'
        '))))',
        v_workspace_col,
        'donations'
      );
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
