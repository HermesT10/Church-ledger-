-- 00013_suppliers_bills.sql
-- Suppliers + Bills (AP-lite): suppliers, bills, bill_lines tables,
-- CHECK constraints, RLS policies, line-total validation trigger.

-- ============================================================
-- 1. Tables
-- ============================================================

create table if not exists public.suppliers (
  id              uuid        primary key default gen_random_uuid(),
  organisation_id uuid        not null references public.organisations(id) on delete cascade,
  name            text        not null,
  email           text,
  bank_details    text,
  created_at      timestamptz not null default now(),

  constraint suppliers_unique_name unique (organisation_id, name)
);

create table if not exists public.bills (
  id              uuid        primary key default gen_random_uuid(),
  organisation_id uuid        not null references public.organisations(id) on delete cascade,
  supplier_id     uuid        not null references public.suppliers(id),
  bill_number     text,
  bill_date       date        not null,
  due_date        date,
  status          text        not null default 'draft',
  total_pence     bigint      not null,
  journal_id      uuid        references public.journals(id),
  created_by      uuid        references public.profiles(id),
  created_at      timestamptz not null default now(),

  constraint bills_status_valid check (status in ('draft', 'approved', 'posted', 'paid')),
  constraint bills_total_positive check (total_pence > 0)
);

create table if not exists public.bill_lines (
  id            uuid   primary key default gen_random_uuid(),
  bill_id       uuid   not null references public.bills(id) on delete cascade,
  account_id    uuid   not null references public.accounts(id),
  fund_id       uuid   references public.funds(id),
  description   text,
  amount_pence  bigint not null,

  constraint bill_lines_amount_positive check (amount_pence > 0)
);

-- ============================================================
-- 2. Indexes
-- ============================================================

create index if not exists idx_bills_organisation_id on public.bills (organisation_id);
create index if not exists idx_bills_supplier_id     on public.bills (supplier_id);
create index if not exists idx_bill_lines_bill_id    on public.bill_lines (bill_id);

-- ============================================================
-- 3. Enable RLS
-- ============================================================

alter table public.suppliers  enable row level security;
alter table public.bills      enable row level security;
alter table public.bill_lines enable row level security;

-- ============================================================
-- 4. RLS Policies – suppliers
-- ============================================================

create policy suppliers_select_member on public.suppliers
  for select using (public.is_org_member(organisation_id));

create policy suppliers_insert_treasurer_admin on public.suppliers
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy suppliers_update_treasurer_admin on public.suppliers
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy suppliers_delete_treasurer_admin on public.suppliers
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

-- ============================================================
-- 5. RLS Policies – bills
-- ============================================================

-- SELECT: any org member
create policy bills_select_member on public.bills
  for select using (public.is_org_member(organisation_id));

-- INSERT: treasurer/admin, must be draft
create policy bills_insert_treasurer_admin on public.bills
  for insert with check (
    public.is_org_treasurer_or_admin(organisation_id)
    and status = 'draft'
  );

-- UPDATE: treasurer/admin can update drafts; WITH CHECK relaxed for status transitions
create policy bills_update_treasurer_admin on public.bills
  for update
  using  (public.is_org_treasurer_or_admin(organisation_id) and status = 'draft')
  with check (public.is_org_treasurer_or_admin(organisation_id));

-- DELETE: treasurer/admin, only drafts
create policy bills_delete_treasurer_admin on public.bills
  for delete using (
    public.is_org_treasurer_or_admin(organisation_id)
    and status = 'draft'
  );

-- ============================================================
-- 6. RLS Policies – bill_lines
-- ============================================================

-- SELECT: any org member (via parent bill)
create policy blines_select_member on public.bill_lines
  for select using (
    exists (
      select 1 from public.bills b
      where b.id = bill_id
        and public.is_org_member(b.organisation_id)
    )
  );

-- INSERT: treasurer/admin AND parent bill must be draft
create policy blines_insert_treasurer_admin on public.bill_lines
  for insert with check (
    exists (
      select 1 from public.bills b
      where b.id = bill_id
        and public.is_org_treasurer_or_admin(b.organisation_id)
        and b.status = 'draft'
    )
  );

-- UPDATE: treasurer/admin AND parent bill must be draft
create policy blines_update_treasurer_admin on public.bill_lines
  for update
  using (
    exists (
      select 1 from public.bills b
      where b.id = bill_id
        and public.is_org_treasurer_or_admin(b.organisation_id)
        and b.status = 'draft'
    )
  )
  with check (
    exists (
      select 1 from public.bills b
      where b.id = bill_id
        and public.is_org_treasurer_or_admin(b.organisation_id)
        and b.status = 'draft'
    )
  );

-- DELETE: treasurer/admin AND parent bill must be draft
create policy blines_delete_treasurer_admin on public.bill_lines
  for delete using (
    exists (
      select 1 from public.bills b
      where b.id = bill_id
        and public.is_org_treasurer_or_admin(b.organisation_id)
        and b.status = 'draft'
    )
  );

-- ============================================================
-- 7. Trigger: validate bill line totals before status change
-- ============================================================

create or replace function public.handle_bill_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  line_total bigint;
  line_count int;
begin
  -- Only fire when status changes to 'approved' or 'posted'
  if NEW.status in ('approved', 'posted') and (OLD.status is distinct from NEW.status) then
    select coalesce(sum(amount_pence), 0), count(*)
      into line_total, line_count
      from public.bill_lines
     where bill_id = NEW.id;

    if line_count = 0 then
      raise exception 'Cannot change bill status: no bill lines exist.';
    end if;

    if line_total <> NEW.total_pence then
      raise exception 'Cannot change bill status: bill lines total (%) does not match bill total (%).',
        line_total, NEW.total_pence;
    end if;
  end if;

  return NEW;
end;
$$;

revoke all on function public.handle_bill_status_change() from public;

create trigger trg_bill_status_change
  before update on public.bills
  for each row
  execute function public.handle_bill_status_change();
