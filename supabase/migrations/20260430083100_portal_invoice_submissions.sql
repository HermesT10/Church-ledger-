-- Portal invoice submissions: lifecycle, attachments, RLS hardening, and payment sync.

alter table public.invoice_submissions
  add column if not exists submitted_at timestamptz,
  add column if not exists budget_id uuid references public.budgets(id) on delete set null,
  add column if not exists under_review_at timestamptz,
  add column if not exists change_requested_at timestamptz,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_run_id uuid references public.payment_runs(id) on delete set null,
  add column if not exists last_status_changed_at timestamptz not null default now(),
  add column if not exists admin_note text,
  add column if not exists request_changes_note text,
  add column if not exists attachment_path text,
  add column if not exists attachment_file_name text,
  add column if not exists attachment_content_type text,
  add column if not exists attachment_size_bytes bigint,
  add column if not exists attachment_uploaded_by uuid references public.profiles(id) on delete set null,
  add column if not exists attachment_uploaded_at timestamptz;

alter table public.invoice_submissions
  drop constraint if exists invoice_submissions_status_check;

update public.invoice_submissions
   set status = case
     when status = 'pending' then 'submitted'
     when status = 'converted' then 'approved'
     else status
   end,
       submitted_at = coalesce(submitted_at, created_at),
       last_status_changed_at = coalesce(last_status_changed_at, now())
 where status in ('pending', 'converted');

alter table public.invoice_submissions
  alter column status set default 'draft',
  add constraint invoice_submissions_status_check
    check (status in (
      'draft',
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'change_requested',
      'scheduled_for_payment',
      'paid',
      'voided'
    ));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoice_submissions_bill_id_fkey'
      and conrelid = 'public.invoice_submissions'::regclass
  ) then
    alter table public.invoice_submissions
      add constraint invoice_submissions_bill_id_fkey
      foreign key (bill_id) references public.bills(id) on delete set null not valid;
  end if;
end $$;

create table if not exists public.invoice_submission_attachments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  submission_id uuid not null references public.invoice_submissions(id) on delete cascade,
  storage_bucket text not null default 'financial-evidence',
  storage_path text not null,
  file_name text not null,
  content_type text,
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint invoice_submission_attachments_bucket_check check (storage_bucket = 'financial-evidence'),
  constraint invoice_submission_attachments_path_unique unique (storage_bucket, storage_path)
);

create index if not exists idx_inv_sub_org_status_created
  on public.invoice_submissions (organisation_id, status, created_at desc);

create index if not exists idx_inv_sub_submitter_status
  on public.invoice_submissions (submitted_by, status);

create index if not exists idx_inv_sub_bill_id
  on public.invoice_submissions (bill_id)
  where bill_id is not null;

create index if not exists idx_inv_sub_payment_run_id
  on public.invoice_submissions (payment_run_id)
  where payment_run_id is not null;

create index if not exists idx_inv_sub_budget_id
  on public.invoice_submissions (budget_id)
  where budget_id is not null;

create index if not exists idx_inv_sub_attachments_submission
  on public.invoice_submission_attachments (organisation_id, submission_id, created_at desc);

alter table public.invoice_submission_attachments enable row level security;

drop policy if exists inv_sub_select on public.invoice_submissions;
create policy inv_sub_select on public.invoice_submissions
  for select using (
    submitted_by = auth.uid()
    or public.is_org_treasurer_or_admin(organisation_id)
  );

drop policy if exists inv_sub_insert on public.invoice_submissions;
create policy inv_sub_insert on public.invoice_submissions
  for insert with check (
    submitted_by = auth.uid()
    and public.is_org_member(organisation_id)
    and status in ('draft', 'submitted')
  );

drop policy if exists inv_sub_update on public.invoice_submissions;
drop policy if exists inv_sub_update_submitter_or_reviewer on public.invoice_submissions;
create policy inv_sub_update_submitter_or_reviewer on public.invoice_submissions
  for update
  using (
    (
      submitted_by = auth.uid()
      and status in ('draft', 'change_requested')
    )
    or public.is_org_treasurer_or_admin(organisation_id)
  )
  with check (
    (
      submitted_by = auth.uid()
      and status in ('draft', 'submitted')
    )
    or public.is_org_treasurer_or_admin(organisation_id)
  );

drop policy if exists inv_sub_attachments_select on public.invoice_submission_attachments;
create policy inv_sub_attachments_select on public.invoice_submission_attachments
  for select using (
    public.is_org_treasurer_or_admin(organisation_id)
    or exists (
      select 1
      from public.invoice_submissions s
      where s.id = submission_id
        and s.submitted_by = auth.uid()
    )
  );

drop policy if exists inv_sub_attachments_insert on public.invoice_submission_attachments;
create policy inv_sub_attachments_insert on public.invoice_submission_attachments
  for insert with check (
    uploaded_by = auth.uid()
    and exists (
      select 1
      from public.invoice_submissions s
      where s.id = submission_id
        and s.organisation_id = invoice_submission_attachments.organisation_id
        and s.submitted_by = auth.uid()
        and s.status in ('draft', 'change_requested')
    )
  );

drop policy if exists inv_sub_attachments_delete on public.invoice_submission_attachments;
create policy inv_sub_attachments_delete on public.invoice_submission_attachments
  for delete using (
    public.is_org_treasurer_or_admin(organisation_id)
    or exists (
      select 1
      from public.invoice_submissions s
      where s.id = submission_id
        and s.submitted_by = auth.uid()
        and s.status in ('draft', 'change_requested')
    )
  );

update storage.buckets
   set public = false
 where id = 'financial-evidence';

create or replace function public.sync_invoice_submission_payment_state(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.bills%rowtype;
  v_payment_run_id uuid;
begin
  if p_bill_id is null then
    return;
  end if;

  select *
    into v_bill
    from public.bills
   where id = p_bill_id;

  if not found then
    return;
  end if;

  select pri.payment_run_id
    into v_payment_run_id
    from public.payment_run_items pri
    join public.payment_runs pr on pr.id = pri.payment_run_id
   where pri.bill_id = p_bill_id
     and pr.status in ('draft', 'approved', 'posted')
   order by case pr.status when 'posted' then 1 when 'approved' then 2 else 3 end,
            pr.created_at desc
   limit 1;

  update public.invoice_submissions
     set status = case
       when v_bill.status = 'paid' then 'paid'
       when v_payment_run_id is not null and v_bill.status = 'posted' then 'scheduled_for_payment'
       else status
     end,
         payment_run_id = coalesce(v_payment_run_id, payment_run_id),
         paid_at = case when v_bill.status = 'paid' then coalesce(paid_at, now()) else paid_at end,
         last_status_changed_at = case
           when (v_bill.status = 'paid' and status <> 'paid')
             or (v_payment_run_id is not null and v_bill.status = 'posted' and status <> 'scheduled_for_payment')
           then now()
           else last_status_changed_at
         end
   where bill_id = p_bill_id
     and status not in ('rejected', 'voided');
end;
$$;

revoke all on function public.sync_invoice_submission_payment_state(uuid) from public;

create or replace function public.handle_invoice_submission_payment_run_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_invoice_submission_payment_state(coalesce(new.bill_id, old.bill_id));
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.handle_invoice_submission_payment_run_item() from public;

drop trigger if exists trg_invoice_submission_payment_run_item_insert on public.payment_run_items;
create trigger trg_invoice_submission_payment_run_item_insert
  after insert or delete on public.payment_run_items
  for each row execute function public.handle_invoice_submission_payment_run_item();

create or replace function public.handle_invoice_submission_bill_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.sync_invoice_submission_payment_state(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.handle_invoice_submission_bill_paid() from public;

drop trigger if exists trg_invoice_submission_bill_paid on public.bills;
create trigger trg_invoice_submission_bill_paid
  after update of status on public.bills
  for each row execute function public.handle_invoice_submission_bill_paid();

do $$
begin
  alter publication supabase_realtime add table public.invoice_submissions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.invoice_submission_attachments;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
