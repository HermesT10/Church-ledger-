-- 00014_payment_runs.sql
-- Payment Runs: batch payment of posted bills.
-- Tables, CHECK constraints, RLS policies, duplicate-prevention trigger.

-- ============================================================
-- 1. Tables
-- ============================================================

create table if not exists public.payment_runs (
  id              uuid        primary key default gen_random_uuid(),
  organisation_id uuid        not null references public.organisations(id) on delete cascade,
  run_date        date        not null,
  status          text        not null default 'draft',
  total_pence     bigint      not null,
  journal_id      uuid        references public.journals(id),
  created_by      uuid        references public.profiles(id),
  created_at      timestamptz not null default now(),

  constraint payment_runs_status_valid check (status in ('draft', 'posted')),
  constraint payment_runs_total_positive check (total_pence > 0)
);

create table if not exists public.payment_run_items (
  id              uuid   primary key default gen_random_uuid(),
  payment_run_id  uuid   not null references public.payment_runs(id) on delete cascade,
  bill_id         uuid   not null references public.bills(id) on delete restrict,
  amount_pence    bigint not null,

  constraint payment_run_items_amount_positive check (amount_pence > 0)
);

-- ============================================================
-- 2. Indexes
-- ============================================================

create index if not exists idx_payment_runs_organisation_id
  on public.payment_runs (organisation_id);

create index if not exists idx_payment_run_items_run_id
  on public.payment_run_items (payment_run_id);

create index if not exists idx_payment_run_items_bill_id
  on public.payment_run_items (bill_id);

-- ============================================================
-- 3. Enable RLS
-- ============================================================

alter table public.payment_runs       enable row level security;
alter table public.payment_run_items  enable row level security;

-- ============================================================
-- 4. RLS Policies – payment_runs
-- ============================================================

-- SELECT: any org member
create policy pr_select_member on public.payment_runs
  for select using (public.is_org_member(organisation_id));

-- INSERT: treasurer/admin, must be draft
create policy pr_insert_treasurer_admin on public.payment_runs
  for insert with check (
    public.is_org_treasurer_or_admin(organisation_id)
    and status = 'draft'
  );

-- UPDATE: treasurer/admin, draft rows; WITH CHECK relaxed for status transitions
create policy pr_update_treasurer_admin on public.payment_runs
  for update
  using  (public.is_org_treasurer_or_admin(organisation_id) and status = 'draft')
  with check (public.is_org_treasurer_or_admin(organisation_id));

-- DELETE: treasurer/admin, only drafts
create policy pr_delete_treasurer_admin on public.payment_runs
  for delete using (
    public.is_org_treasurer_or_admin(organisation_id)
    and status = 'draft'
  );

-- ============================================================
-- 5. RLS Policies – payment_run_items
-- ============================================================

-- SELECT: any org member (via parent payment_run)
create policy pri_select_member on public.payment_run_items
  for select using (
    exists (
      select 1 from public.payment_runs pr
      where pr.id = payment_run_id
        and public.is_org_member(pr.organisation_id)
    )
  );

-- INSERT: treasurer/admin AND parent run must be draft
create policy pri_insert_treasurer_admin on public.payment_run_items
  for insert with check (
    exists (
      select 1 from public.payment_runs pr
      where pr.id = payment_run_id
        and public.is_org_treasurer_or_admin(pr.organisation_id)
        and pr.status = 'draft'
    )
  );

-- UPDATE: treasurer/admin AND parent run must be draft
create policy pri_update_treasurer_admin on public.payment_run_items
  for update
  using (
    exists (
      select 1 from public.payment_runs pr
      where pr.id = payment_run_id
        and public.is_org_treasurer_or_admin(pr.organisation_id)
        and pr.status = 'draft'
    )
  )
  with check (
    exists (
      select 1 from public.payment_runs pr
      where pr.id = payment_run_id
        and public.is_org_treasurer_or_admin(pr.organisation_id)
        and pr.status = 'draft'
    )
  );

-- DELETE: treasurer/admin AND parent run must be draft
create policy pri_delete_treasurer_admin on public.payment_run_items
  for delete using (
    exists (
      select 1 from public.payment_runs pr
      where pr.id = payment_run_id
        and public.is_org_treasurer_or_admin(pr.organisation_id)
        and pr.status = 'draft'
    )
  );

-- ============================================================
-- 6. Trigger: validate payment run before posting
-- ============================================================

create or replace function public.handle_payment_run_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_total  bigint;
  item_count  int;
  dup_bill_id uuid;
  bad_bill_id uuid;
begin
  -- Only fire when status changes to 'posted'
  if NEW.status = 'posted' and (OLD.status is distinct from 'posted') then

    -- 1. At least one item must exist
    select coalesce(sum(amount_pence), 0), count(*)
      into item_total, item_count
      from public.payment_run_items
     where payment_run_id = NEW.id;

    if item_count = 0 then
      raise exception 'Cannot post payment run: no items exist.';
    end if;

    -- 2. Item totals must match run total
    if item_total <> NEW.total_pence then
      raise exception 'Cannot post payment run: items total (%) does not match run total (%).',
        item_total, NEW.total_pence;
    end if;

    -- 3. No bill in this run should already belong to another POSTED payment run
    select pri2.bill_id into dup_bill_id
      from public.payment_run_items pri1
      join public.payment_run_items pri2
        on pri1.bill_id = pri2.bill_id
       and pri2.payment_run_id <> NEW.id
      join public.payment_runs pr2
        on pr2.id = pri2.payment_run_id
       and pr2.status = 'posted'
     where pri1.payment_run_id = NEW.id
     limit 1;

    if dup_bill_id is not null then
      raise exception 'Cannot post payment run: bill % has already been paid in another payment run.',
        dup_bill_id;
    end if;

    -- 4. All bills must be in 'posted' status (only posted bills can be paid)
    select pri.bill_id into bad_bill_id
      from public.payment_run_items pri
      join public.bills b on b.id = pri.bill_id
     where pri.payment_run_id = NEW.id
       and b.status <> 'posted'
     limit 1;

    if bad_bill_id is not null then
      raise exception 'Cannot post payment run: bill % is not in posted status.',
        bad_bill_id;
    end if;

  end if;

  return NEW;
end;
$$;

revoke all on function public.handle_payment_run_post() from public;

create trigger trg_payment_run_post
  before update on public.payment_runs
  for each row
  execute function public.handle_payment_run_post();
