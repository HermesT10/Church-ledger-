-- Portal expense submissions: invited-user expense intake, receipts, approval, and reconciliation sync.

alter table public.organisation_settings
  add column if not exists portal_expense_receipts_required boolean not null default true,
  add column if not exists allow_portal_expense_overspend_submission boolean not null default true;

create table if not exists public.portal_expense_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  expense_date date not null,
  amount_pence bigint not null check (amount_pence > 0),
  detail text not null,
  method text not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text,
  budget_id uuid references public.budgets(id) on delete set null,
  budget_category_id uuid,
  fund_id uuid references public.funds(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  reimbursement_required boolean not null default false,
  card_assignment_id uuid references public.user_card_assignments(id) on delete set null,
  receipt_url text,
  receipt_path text,
  receipt_required boolean not null default true,
  overspend_warning text,
  overspend_allowed boolean not null default false,
  admin_notes text,
  change_request_note text,
  status text not null default 'draft',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  linked_manual_transaction_id uuid references public.manual_transactions(id) on delete set null,
  linked_bank_transaction_id uuid references public.bank_lines(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_expense_submissions_detail_not_empty check (length(trim(detail)) > 0),
  constraint portal_expense_submissions_method_check check (method in ('cash', 'card', 'cheque', 'bank_transfer')),
  constraint portal_expense_submissions_status_check check (status in (
    'draft',
    'submitted',
    'changes_requested',
    'approved',
    'rejected',
    'awaiting_bank_match',
    'paid',
    'reconciled',
    'voided'
  ))
);

create index if not exists idx_portal_exp_sub_workspace_status_created
  on public.portal_expense_submissions (workspace_id, status, created_at desc);

create index if not exists idx_portal_exp_sub_submitter_status
  on public.portal_expense_submissions (submitted_by, status);

create index if not exists idx_portal_exp_sub_budget
  on public.portal_expense_submissions (budget_id)
  where budget_id is not null;

create index if not exists idx_portal_exp_sub_budget_category
  on public.portal_expense_submissions (budget_category_id)
  where budget_category_id is not null;

create index if not exists idx_portal_exp_sub_fund
  on public.portal_expense_submissions (fund_id)
  where fund_id is not null;

create index if not exists idx_portal_exp_sub_account
  on public.portal_expense_submissions (account_id)
  where account_id is not null;

create index if not exists idx_portal_exp_sub_card_assignment
  on public.portal_expense_submissions (card_assignment_id)
  where card_assignment_id is not null;

create index if not exists idx_portal_exp_sub_manual_transaction
  on public.portal_expense_submissions (linked_manual_transaction_id)
  where linked_manual_transaction_id is not null;

create index if not exists idx_portal_exp_sub_bank_transaction
  on public.portal_expense_submissions (linked_bank_transaction_id)
  where linked_bank_transaction_id is not null;

drop trigger if exists trg_portal_expense_submissions_touch_updated_at on public.portal_expense_submissions;
create trigger trg_portal_expense_submissions_touch_updated_at
  before update on public.portal_expense_submissions
  for each row execute function public.touch_updated_at();

alter table public.portal_expense_submissions enable row level security;

drop policy if exists portal_exp_sub_select on public.portal_expense_submissions;
create policy portal_exp_sub_select on public.portal_expense_submissions
  for select using (
    submitted_by = auth.uid()
    or public.is_org_treasurer_or_admin(workspace_id)
  );

drop policy if exists portal_exp_sub_insert on public.portal_expense_submissions;
create policy portal_exp_sub_insert on public.portal_expense_submissions
  for insert with check (
    submitted_by = auth.uid()
    and public.is_org_member(workspace_id)
    and status in ('draft', 'submitted')
  );

drop policy if exists portal_exp_sub_update on public.portal_expense_submissions;
create policy portal_exp_sub_update on public.portal_expense_submissions
  for update using (
    (
      submitted_by = auth.uid()
      and status in ('draft', 'changes_requested')
    )
    or public.is_org_treasurer_or_admin(workspace_id)
  )
  with check (
    (
      submitted_by = auth.uid()
      and status in ('draft', 'submitted')
    )
    or public.is_org_treasurer_or_admin(workspace_id)
  );

drop policy if exists portal_exp_sub_delete_admin on public.portal_expense_submissions;
create policy portal_exp_sub_delete_admin on public.portal_expense_submissions
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

create or replace function public.sync_portal_expense_submission_transaction_state(p_manual_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.manual_transactions%rowtype;
begin
  if p_manual_transaction_id is null then
    return;
  end if;

  select *
    into v_tx
    from public.manual_transactions
   where id = p_manual_transaction_id;

  if not found then
    return;
  end if;

  update public.portal_expense_submissions
     set status = case
       when v_tx.status = 'reconciled' then 'reconciled'
       when v_tx.status in ('matched', 'posted') then 'paid'
       when v_tx.status = 'awaiting_bank_match' then 'awaiting_bank_match'
       else status
     end,
         linked_bank_transaction_id = coalesce(v_tx.matched_bank_transaction_id, linked_bank_transaction_id),
         updated_at = now()
   where linked_manual_transaction_id = p_manual_transaction_id
     and status not in ('rejected', 'voided');
end;
$$;

revoke all on function public.sync_portal_expense_submission_transaction_state(uuid) from public;

create or replace function public.handle_portal_expense_submission_manual_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     or new.matched_bank_transaction_id is distinct from old.matched_bank_transaction_id then
    perform public.sync_portal_expense_submission_transaction_state(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.handle_portal_expense_submission_manual_transaction() from public;

drop trigger if exists trg_portal_expense_submission_manual_transaction on public.manual_transactions;
create trigger trg_portal_expense_submission_manual_transaction
  after update of status, matched_bank_transaction_id on public.manual_transactions
  for each row execute function public.handle_portal_expense_submission_manual_transaction();

create or replace function public.handle_portal_expense_submission_bank_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.portal_expense_submissions
     set status = 'reconciled',
         linked_bank_transaction_id = new.id,
         updated_at = now()
   where linked_manual_transaction_id = new.matched_source_id
     and new.matched_source_type = 'manual_transaction'
     and new.matched_source_id is not null
     and status not in ('rejected', 'voided');
  return new;
end;
$$;

revoke all on function public.handle_portal_expense_submission_bank_match() from public;

drop trigger if exists trg_portal_expense_submission_bank_match on public.bank_lines;
create trigger trg_portal_expense_submission_bank_match
  after insert or update of matched_source_type, matched_source_id on public.bank_lines
  for each row execute function public.handle_portal_expense_submission_bank_match();

do $$
begin
  alter publication supabase_realtime add table public.portal_expense_submissions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
