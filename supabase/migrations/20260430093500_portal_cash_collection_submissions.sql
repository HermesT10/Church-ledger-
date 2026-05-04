-- Portal cash collection submissions: invited-user intake, review, conversion, and banking sync.

create table if not exists public.cash_collection_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  collection_date date not null,
  amount_pence bigint not null check (amount_pence > 0),
  detail text not null,
  signed_by text not null,
  collection_type text,
  fund_id uuid references public.funds(id) on delete set null,
  income_stream_id uuid references public.income_streams(id) on delete set null,
  counted_by text,
  second_counter text,
  notes text,
  attachment_url text,
  attachment_path text,
  status text not null default 'draft',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  admin_notes text,
  linked_cash_batch_id uuid references public.cash_collections(id) on delete set null,
  linked_bank_transaction_id uuid references public.bank_lines(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_collection_submissions_detail_not_empty check (length(trim(detail)) > 0),
  constraint cash_collection_submissions_signed_by_not_empty check (length(trim(signed_by)) > 0),
  constraint cash_collection_submissions_collection_type_check
    check (collection_type is null or collection_type in ('service', 'event', 'cafe', 'offering', 'other')),
  constraint cash_collection_submissions_status_check
    check (status in ('draft', 'submitted', 'reviewed', 'banked', 'reconciled', 'rejected'))
);

create index if not exists idx_cash_coll_sub_workspace_status_created
  on public.cash_collection_submissions (workspace_id, status, created_at desc);

create index if not exists idx_cash_coll_sub_submitter_status
  on public.cash_collection_submissions (submitted_by, status);

create index if not exists idx_cash_coll_sub_fund
  on public.cash_collection_submissions (workspace_id, fund_id)
  where fund_id is not null;

create index if not exists idx_cash_coll_sub_income_stream
  on public.cash_collection_submissions (workspace_id, income_stream_id)
  where income_stream_id is not null;

create index if not exists idx_cash_coll_sub_cash_batch
  on public.cash_collection_submissions (linked_cash_batch_id)
  where linked_cash_batch_id is not null;

create index if not exists idx_cash_coll_sub_bank_transaction
  on public.cash_collection_submissions (linked_bank_transaction_id)
  where linked_bank_transaction_id is not null;

drop trigger if exists trg_cash_collection_submissions_touch_updated_at on public.cash_collection_submissions;
create trigger trg_cash_collection_submissions_touch_updated_at
  before update on public.cash_collection_submissions
  for each row execute function public.touch_updated_at();

alter table public.cash_collection_submissions enable row level security;

drop policy if exists cash_coll_sub_select on public.cash_collection_submissions;
create policy cash_coll_sub_select on public.cash_collection_submissions
  for select using (
    submitted_by = auth.uid()
    or public.is_org_treasurer_or_admin(workspace_id)
  );

drop policy if exists cash_coll_sub_insert on public.cash_collection_submissions;
create policy cash_coll_sub_insert on public.cash_collection_submissions
  for insert with check (
    submitted_by = auth.uid()
    and public.is_org_member(workspace_id)
    and status in ('draft', 'submitted')
  );

drop policy if exists cash_coll_sub_update on public.cash_collection_submissions;
create policy cash_coll_sub_update on public.cash_collection_submissions
  for update using (
    (
      submitted_by = auth.uid()
      and status = 'draft'
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

drop policy if exists cash_coll_sub_delete_admin on public.cash_collection_submissions;
create policy cash_coll_sub_delete_admin on public.cash_collection_submissions
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

create or replace function public.sync_cash_collection_submission_banked_state(p_cash_collection_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_collection public.cash_collections%rowtype;
begin
  if p_cash_collection_id is null then
    return;
  end if;

  select *
    into v_collection
    from public.cash_collections
   where id = p_cash_collection_id;

  if not found then
    return;
  end if;

  update public.cash_collection_submissions
     set status = case
       when v_collection.status = 'banked' then 'banked'
       else status
     end,
         updated_at = now()
   where linked_cash_batch_id = p_cash_collection_id
     and status not in ('reconciled', 'rejected');
end;
$$;

revoke all on function public.sync_cash_collection_submission_banked_state(uuid) from public;

create or replace function public.handle_cash_collection_submission_collection_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.sync_cash_collection_submission_banked_state(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.handle_cash_collection_submission_collection_status() from public;

drop trigger if exists trg_cash_collection_submission_collection_status on public.cash_collections;
create trigger trg_cash_collection_submission_collection_status
  after update of status on public.cash_collections
  for each row execute function public.handle_cash_collection_submission_collection_status();

create or replace function public.handle_cash_collection_submission_bank_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.matched_source_type = 'cash_deposit' and new.matched_source_id is not null then
    update public.cash_collection_submissions sub
       set status = 'reconciled',
           linked_bank_transaction_id = new.id,
           updated_at = now()
      from public.cash_deposit_collections cdc
     where cdc.cash_collection_id = sub.linked_cash_batch_id
       and cdc.deposit_id = new.matched_source_id
       and sub.status <> 'rejected';
  end if;
  return new;
end;
$$;

revoke all on function public.handle_cash_collection_submission_bank_match() from public;

drop trigger if exists trg_cash_collection_submission_bank_match on public.bank_lines;
create trigger trg_cash_collection_submission_bank_match
  after insert or update of matched_source_type, matched_source_id on public.bank_lines
  for each row execute function public.handle_cash_collection_submission_bank_match();

do $$
begin
  alter publication supabase_realtime add table public.cash_collection_submissions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
