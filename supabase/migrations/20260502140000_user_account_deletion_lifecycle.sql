-- User/account deletion lifecycle, workspace removal, and staff archive support.
-- Keep accounting evidence intact while allowing login/account data to be removed safely.

alter table public.profiles
  add column if not exists email text,
  add column if not exists status text not null default 'active',
  add column if not exists deleted_at timestamptz,
  add column if not exists anonymised_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('active', 'deactivated', 'deleted'));

create index if not exists idx_profiles_status
  on public.profiles (status);

alter table public.memberships
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references public.profiles(id) on delete set null,
  add column if not exists removal_reason text;

alter table public.memberships
  drop constraint if exists memberships_status_check;

alter table public.memberships
  add constraint memberships_status_check
  check (status in ('invited', 'active', 'disabled', 'suspended', 'removed'));

create index if not exists idx_memberships_org_status_role
  on public.memberships (organisation_id, status, role);

create index if not exists idx_memberships_removed_at
  on public.memberships (organisation_id, removed_at desc)
  where status = 'removed';

alter table public.employees
  add column if not exists status text not null default 'active',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text;

update public.employees
   set status = case when is_active then 'active' else 'archived' end
 where status = 'active'
   and is_active = false;

alter table public.employees
  drop constraint if exists employees_status_check;

alter table public.employees
  add constraint employees_status_check
  check (status in ('active', 'inactive', 'archived'));

create index if not exists idx_employees_org_status
  on public.employees (organisation_id, status);

-- Keep profile email available for admin/user management screens. Existing rows are
-- backfilled opportunistically by server code because auth.users is not exposed here.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, phone, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'phone',
    new.email
  );
  return new;
end;
$$;

-- Historical actor references should not delete accounting evidence when an auth
-- user/profile is removed. Convert selected profile FKs to SET NULL and nullable.
do $$
declare
  v_item record;
  v_constraint record;
begin
  for v_item in
    select * from (values
      ('audit_log', 'user_id'),
      ('approval_events', 'performed_by'),
      ('payroll_runs', 'created_by'),
      ('payroll_runs', 'approved_by'),
      ('journals', 'approved_by'),
      ('bills', 'approved_by'),
      ('payment_runs', 'approved_by'),
      ('invoice_submissions', 'submitted_by'),
      ('expense_requests', 'submitted_by'),
      ('conversations', 'created_by'),
      ('messages', 'sender_id'),
      ('portal_expense_submissions', 'submitted_by'),
      ('cash_collection_submissions', 'submitted_by'),
      ('invoice_submission_attachments', 'uploaded_by')
    ) as t(table_name, column_name)
  loop
    if to_regclass(format('public.%I', v_item.table_name)) is null then
      continue;
    end if;

    if not exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name = v_item.table_name
         and column_name = v_item.column_name
    ) then
      continue;
    end if;

    execute format(
      'alter table public.%I alter column %I drop not null',
      v_item.table_name,
      v_item.column_name
    );

    for v_constraint in
      select c.conname
        from pg_constraint c
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = any(c.conkey)
       where c.conrelid = to_regclass(format('public.%I', v_item.table_name))
         and c.contype = 'f'
         and c.confrelid = 'public.profiles'::regclass
         and a.attname = v_item.column_name
    loop
      execute format(
        'alter table public.%I drop constraint %I',
        v_item.table_name,
        v_constraint.conname
      );
    end loop;

    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
      v_item.table_name,
      v_item.table_name || '_' || v_item.column_name || '_profiles_fkey',
      v_item.column_name
    );
  end loop;
end $$;

create or replace function public.anonymise_user_personal_data(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set full_name = 'Deleted user',
         email = null,
         phone = null,
         avatar_url = null,
         active_organisation_id = null,
         status = 'deleted',
         deleted_at = coalesce(deleted_at, now()),
         anonymised_at = now()
   where id = target_user_id;
end;
$$;

create or replace function public.remove_user_from_workspace(
  target_workspace_id uuid,
  target_user_id uuid,
  removed_by_user_id uuid,
  removal_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_id uuid;
  v_target_role text;
  v_remaining_admin_count integer;
  v_permissions_deleted integer := 0;
  v_budget_deleted integer := 0;
  v_fund_deleted integer := 0;
  v_category_deleted integer := 0;
  v_card_deleted integer := 0;
  v_invites_revoked integer := 0;
begin
  select id, role::text
    into v_membership_id, v_target_role
    from public.memberships
   where organisation_id = target_workspace_id
     and user_id = target_user_id
     and status <> 'removed'
   limit 1;

  if v_membership_id is null then
    return jsonb_build_object('removed', false, 'reason', 'not_found');
  end if;

  if v_target_role = 'admin' then
    select count(*)
      into v_remaining_admin_count
      from public.memberships
     where organisation_id = target_workspace_id
       and role = 'admin'
       and status = 'active'
       and (expires_at is null or expires_at > now())
       and user_id <> target_user_id;

    if coalesce(v_remaining_admin_count, 0) = 0 then
      raise exception 'Cannot remove the last active admin from this organisation.';
    end if;
  end if;

  delete from public.portal_user_permissions
   where workspace_id = target_workspace_id
     and (user_id = target_user_id or membership_id = v_membership_id);
  get diagnostics v_permissions_deleted = row_count;

  delete from public.user_budget_assignments
   where workspace_id = target_workspace_id
     and user_id = target_user_id;
  get diagnostics v_budget_deleted = row_count;

  delete from public.user_fund_assignments
   where workspace_id = target_workspace_id
     and user_id = target_user_id;
  get diagnostics v_fund_deleted = row_count;

  delete from public.user_category_assignments
   where workspace_id = target_workspace_id
     and user_id = target_user_id;
  get diagnostics v_category_deleted = row_count;

  delete from public.user_card_assignments
   where workspace_id = target_workspace_id
     and user_id = target_user_id;
  get diagnostics v_card_deleted = row_count;

  update public.organisation_invites
     set status = 'revoked',
         revoked_at = coalesce(revoked_at, now())
   where workspace_id = target_workspace_id
     and accepted_by = target_user_id
     and status in ('draft', 'sent', 'accepted');
  get diagnostics v_invites_revoked = row_count;

  update public.memberships
     set status = 'removed',
         removed_at = now(),
         removed_by = removed_by_user_id,
         removal_reason = nullif(trim(removal_reason), ''),
         expires_at = least(coalesce(expires_at, now()), now())
   where id = v_membership_id;

  return jsonb_build_object(
    'removed', true,
    'membershipId', v_membership_id,
    'portalPermissionsDeleted', v_permissions_deleted,
    'budgetAssignmentsDeleted', v_budget_deleted,
    'fundAssignmentsDeleted', v_fund_deleted,
    'categoryAssignmentsDeleted', v_category_deleted,
    'cardAssignmentsDeleted', v_card_deleted,
    'invitesRevoked', v_invites_revoked
  );
end;
$$;

create or replace function public.get_employee_delete_dependency_preview(target_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_counts jsonb := '{}'::jsonb;
  v_total integer := 0;
  v_count integer;
begin
  select organisation_id into v_workspace_id
    from public.employees
   where id = target_employee_id;

  if v_workspace_id is null then
    return jsonb_build_object('exists', false, 'total', 0, 'counts', '{}'::jsonb, 'canDelete', false);
  end if;

  if to_regclass('public.payroll_lines') is not null then
    select count(*) into v_count
      from public.payroll_lines
     where employee_id = target_employee_id;
    if v_count > 0 then
      v_counts := jsonb_set(v_counts, '{payroll_lines}', to_jsonb(v_count), true);
      v_total := v_total + v_count;
    end if;
  end if;

  if to_regclass('public.portal_user_permissions') is not null then
    select count(*) into v_count
      from public.portal_user_permissions
     where employee_id = target_employee_id;
    if v_count > 0 then
      v_counts := jsonb_set(v_counts, '{portal_user_permissions}', to_jsonb(v_count), true);
      v_total := v_total + v_count;
    end if;
  end if;

  if to_regclass('public.organisation_invites') is not null then
    select count(*) into v_count
      from public.organisation_invites
     where employee_id = target_employee_id;
    if v_count > 0 then
      v_counts := jsonb_set(v_counts, '{organisation_invites}', to_jsonb(v_count), true);
      v_total := v_total + v_count;
    end if;
  end if;

  if to_regclass('public.invoice_submissions') is not null
     and exists (
       select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'invoice_submissions'
          and column_name = 'employee_id'
     ) then
    execute 'select count(*) from public.invoice_submissions where employee_id = $1'
      using target_employee_id into v_count;
    if v_count > 0 then
      v_counts := jsonb_set(v_counts, '{invoice_submissions}', to_jsonb(v_count), true);
      v_total := v_total + v_count;
    end if;
  end if;

  if to_regclass('public.portal_expense_submissions') is not null
     and exists (
       select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'portal_expense_submissions'
          and column_name = 'employee_id'
     ) then
    execute 'select count(*) from public.portal_expense_submissions where employee_id = $1'
      using target_employee_id into v_count;
    if v_count > 0 then
      v_counts := jsonb_set(v_counts, '{portal_expense_submissions}', to_jsonb(v_count), true);
      v_total := v_total + v_count;
    end if;
  end if;

  if to_regclass('public.cash_collection_submissions') is not null
     and exists (
       select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'cash_collection_submissions'
          and column_name = 'employee_id'
     ) then
    execute 'select count(*) from public.cash_collection_submissions where employee_id = $1'
      using target_employee_id into v_count;
    if v_count > 0 then
      v_counts := jsonb_set(v_counts, '{cash_collection_submissions}', to_jsonb(v_count), true);
      v_total := v_total + v_count;
    end if;
  end if;

  return jsonb_build_object(
    'exists', true,
    'total', v_total,
    'counts', v_counts,
    'canDelete', v_total = 0
  );
end;
$$;

revoke all on function public.anonymise_user_personal_data(uuid) from anon, authenticated;
revoke all on function public.remove_user_from_workspace(uuid, uuid, uuid, text) from anon, authenticated;
revoke all on function public.get_employee_delete_dependency_preview(uuid) from anon, authenticated;
