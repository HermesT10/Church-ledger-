-- Invoice / supplier workflow upgrade (additive).
-- Keeps existing supplier bills (`bills` / `bill_lines`) as the payable/AP model
-- and adds receivable invoices for invoices owed to the church.

-- ---------------------------------------------------------------------------
-- Supplier and hirer quick-create fields
-- ---------------------------------------------------------------------------

alter table public.suppliers
  add column if not exists bank_reference_alias text,
  add column if not exists notes text;

alter table public.lettings_hirers
  add column if not exists address text;

-- ---------------------------------------------------------------------------
-- Receivable invoices: invoices the church sends to customers/hirers
-- ---------------------------------------------------------------------------

create table if not exists public.receivable_invoices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  hirer_id uuid not null references public.lettings_hirers(id) on delete restrict,
  linked_letting_charge_id uuid references public.lettings_charges(id) on delete set null,
  invoice_number text,
  invoice_date date not null,
  due_date date,
  status text not null default 'draft',
  total_pence bigint not null default 0,
  paid_pence bigint not null default 0,
  notes text,
  message text,
  generated_pdf_storage_path text,
  generated_pdf_file_name text,
  generated_pdf_created_at timestamptz,
  generated_pdf_created_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz,
  viewed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  posted_journal_id uuid references public.journals(id) on delete set null,
  payment_journal_id uuid references public.journals(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint receivable_invoices_status_check check (
    status in ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'voided')
  ),
  constraint receivable_invoices_total_non_negative check (total_pence >= 0),
  constraint receivable_invoices_paid_non_negative check (paid_pence >= 0),
  constraint receivable_invoices_paid_not_over_total check (paid_pence <= total_pence),
  constraint receivable_invoices_sent_at_check check (status <> 'sent' or sent_at is not null),
  constraint receivable_invoices_void_reason_check check (status <> 'voided' or length(trim(coalesce(void_reason, ''))) > 0)
);

create table if not exists public.receivable_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.receivable_invoices(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  fund_id uuid not null references public.funds(id) on delete restrict,
  description text,
  amount_pence bigint not null,
  created_at timestamptz not null default now(),

  constraint receivable_invoice_lines_amount_positive check (amount_pence > 0)
);

create unique index if not exists idx_receivable_invoices_org_number
  on public.receivable_invoices (organisation_id, lower(invoice_number))
  where invoice_number is not null;

create index if not exists idx_receivable_invoices_org_status_due
  on public.receivable_invoices (organisation_id, status, due_date);

create index if not exists idx_receivable_invoices_hirer
  on public.receivable_invoices (organisation_id, hirer_id, invoice_date desc);

create index if not exists idx_receivable_invoices_letting_charge
  on public.receivable_invoices (organisation_id, linked_letting_charge_id)
  where linked_letting_charge_id is not null;

create index if not exists idx_receivable_invoice_lines_invoice
  on public.receivable_invoice_lines (invoice_id);

create index if not exists idx_receivable_invoice_lines_account
  on public.receivable_invoice_lines (account_id);

create index if not exists idx_receivable_invoice_lines_fund
  on public.receivable_invoice_lines (fund_id);

drop trigger if exists trg_receivable_invoices_touch_updated_at on public.receivable_invoices;
create trigger trg_receivable_invoices_touch_updated_at
  before update on public.receivable_invoices
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Integrity trigger for receivable invoice lifecycle
-- ---------------------------------------------------------------------------

create or replace function public.validate_receivable_invoice_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  line_total bigint;
  line_count integer;
  invalid_account_id uuid;
begin
  if new.status in ('sent', 'viewed', 'partially_paid', 'paid', 'overdue') then
    select coalesce(sum(amount_pence), 0), count(*)
      into line_total, line_count
      from public.receivable_invoice_lines
     where invoice_id = new.id;

    if line_count = 0 then
      raise exception 'Cannot progress receivable invoice: no invoice lines exist.';
    end if;

    if line_total <> new.total_pence then
      raise exception 'Cannot progress receivable invoice: line total (%) does not match invoice total (%).',
        line_total, new.total_pence;
    end if;

    select ril.account_id
      into invalid_account_id
      from public.receivable_invoice_lines ril
      join public.accounts a on a.id = ril.account_id
     where ril.invoice_id = new.id
       and (a.organisation_id <> new.organisation_id or a.type <> 'income')
     limit 1;

    if invalid_account_id is not null then
      raise exception 'Receivable invoice lines must use income accounts in the same organisation.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_receivable_invoice_status_change() from public;

drop trigger if exists trg_receivable_invoice_status_change on public.receivable_invoices;
create trigger trg_receivable_invoice_status_change
  before insert or update of status, total_pence, paid_pence
  on public.receivable_invoices
  for each row execute function public.validate_receivable_invoice_status_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.receivable_invoices enable row level security;
alter table public.receivable_invoice_lines enable row level security;

drop policy if exists receivable_invoices_select_member on public.receivable_invoices;
create policy receivable_invoices_select_member on public.receivable_invoices
  for select using (public.is_org_member(organisation_id));

drop policy if exists receivable_invoices_insert_finance on public.receivable_invoices;
create policy receivable_invoices_insert_finance on public.receivable_invoices
  for insert with check (
    public.is_org_treasurer_or_admin(organisation_id)
    and status = 'draft'
  );

drop policy if exists receivable_invoices_update_finance on public.receivable_invoices;
create policy receivable_invoices_update_finance on public.receivable_invoices
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

drop policy if exists receivable_invoices_delete_draft_finance on public.receivable_invoices;
create policy receivable_invoices_delete_draft_finance on public.receivable_invoices
  for delete using (
    public.is_org_treasurer_or_admin(organisation_id)
    and status = 'draft'
  );

drop policy if exists receivable_invoice_lines_select_member on public.receivable_invoice_lines;
create policy receivable_invoice_lines_select_member on public.receivable_invoice_lines
  for select using (
    exists (
      select 1
      from public.receivable_invoices ri
      where ri.id = invoice_id
        and public.is_org_member(ri.organisation_id)
    )
  );

drop policy if exists receivable_invoice_lines_insert_draft_finance on public.receivable_invoice_lines;
create policy receivable_invoice_lines_insert_draft_finance on public.receivable_invoice_lines
  for insert with check (
    exists (
      select 1
      from public.receivable_invoices ri
      where ri.id = invoice_id
        and ri.status = 'draft'
        and public.is_org_treasurer_or_admin(ri.organisation_id)
    )
  );

drop policy if exists receivable_invoice_lines_update_draft_finance on public.receivable_invoice_lines;
create policy receivable_invoice_lines_update_draft_finance on public.receivable_invoice_lines
  for update
  using (
    exists (
      select 1
      from public.receivable_invoices ri
      where ri.id = invoice_id
        and ri.status = 'draft'
        and public.is_org_treasurer_or_admin(ri.organisation_id)
    )
  )
  with check (
    exists (
      select 1
      from public.receivable_invoices ri
      where ri.id = invoice_id
        and ri.status = 'draft'
        and public.is_org_treasurer_or_admin(ri.organisation_id)
    )
  );

drop policy if exists receivable_invoice_lines_delete_draft_finance on public.receivable_invoice_lines;
create policy receivable_invoice_lines_delete_draft_finance on public.receivable_invoice_lines
  for delete using (
    exists (
      select 1
      from public.receivable_invoices ri
      where ri.id = invoice_id
        and ri.status = 'draft'
        and public.is_org_treasurer_or_admin(ri.organisation_id)
    )
  );
