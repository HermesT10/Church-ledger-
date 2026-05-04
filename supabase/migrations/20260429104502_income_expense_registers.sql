-- Income and Expense Registers
-- These tables configure spreadsheet-style register rows only.
-- Actual register values are calculated from posted journals/journal_lines.

create table if not exists public.register_categories (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  register_type text not null,
  name text not null,
  group_name text,
  display_order integer not null default 100,
  status text not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint register_categories_type_check check (register_type in ('income', 'expense')),
  constraint register_categories_status_check check (status in ('active', 'archived')),
  constraint register_categories_name_not_blank check (length(trim(name)) > 0)
);

create unique index if not exists idx_register_categories_org_type_name
  on public.register_categories (organisation_id, register_type, lower(name))
  where status = 'active';

create index if not exists idx_register_categories_org_type_order
  on public.register_categories (organisation_id, register_type, status, display_order, name);

create table if not exists public.register_category_mappings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  register_category_id uuid not null references public.register_categories(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  income_stream_id uuid references public.income_streams(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete cascade,
  donor_id uuid references public.donors(id) on delete cascade,
  lettings_hirer_id uuid references public.lettings_hirers(id) on delete cascade,
  payroll_component text,
  fund_id uuid references public.funds(id) on delete cascade,
  mapping_type text not null default 'account',
  created_at timestamptz not null default now(),

  constraint register_category_mappings_type_check check (
    mapping_type in (
      'account',
      'income_stream',
      'supplier',
      'donor',
      'lettings_hirer',
      'payroll_component',
      'fund',
      'composite'
    )
  ),
  constraint register_category_mappings_has_dimension check (
    account_id is not null
    or income_stream_id is not null
    or supplier_id is not null
    or donor_id is not null
    or lettings_hirer_id is not null
    or payroll_component is not null
    or fund_id is not null
  )
);

create index if not exists idx_register_category_mappings_category
  on public.register_category_mappings (register_category_id);

create index if not exists idx_register_category_mappings_org_account
  on public.register_category_mappings (organisation_id, account_id)
  where account_id is not null;

create index if not exists idx_register_category_mappings_org_income_stream
  on public.register_category_mappings (organisation_id, income_stream_id)
  where income_stream_id is not null;

create index if not exists idx_register_category_mappings_org_supplier
  on public.register_category_mappings (organisation_id, supplier_id)
  where supplier_id is not null;

create index if not exists idx_register_category_mappings_org_fund
  on public.register_category_mappings (organisation_id, fund_id)
  where fund_id is not null;

create unique index if not exists idx_register_category_mappings_unique_dimension
  on public.register_category_mappings (
    organisation_id,
    register_category_id,
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(income_stream_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(donor_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(lettings_hirer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(payroll_component, ''),
    coalesce(fund_id, '00000000-0000-0000-0000-000000000000'::uuid),
    mapping_type
  );

drop trigger if exists trg_register_categories_touch_updated_at on public.register_categories;
create trigger trg_register_categories_touch_updated_at
  before update on public.register_categories
  for each row execute function public.touch_updated_at();

alter table public.register_categories enable row level security;
alter table public.register_category_mappings enable row level security;

create policy register_categories_select_member on public.register_categories
  for select using (public.is_org_member(organisation_id));
create policy register_categories_insert_finance on public.register_categories
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));
create policy register_categories_update_finance on public.register_categories
  for update using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));
create policy register_categories_delete_finance on public.register_categories
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

create policy register_category_mappings_select_member on public.register_category_mappings
  for select using (public.is_org_member(organisation_id));
create policy register_category_mappings_insert_finance on public.register_category_mappings
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));
create policy register_category_mappings_update_finance on public.register_category_mappings
  for update using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));
create policy register_category_mappings_delete_finance on public.register_category_mappings
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

-- Seed familiar spreadsheet rows for existing organisations. Future organisations
-- are also protected by runtime fallback rows in the register engine.
insert into public.register_categories (
  organisation_id,
  register_type,
  name,
  group_name,
  display_order
)
select o.id, seed.register_type, seed.name, seed.group_name, seed.display_order
from public.organisations o
cross join (
  values
    ('income', 'Cafe', null, 10),
    ('income', 'URC Funding', null, 20),
    ('income', 'Baptist Union', null, 30),
    ('income', 'Lettings', null, 40),
    ('income', 'Giving', null, 50),
    ('income', 'Gift Aid', null, 60),
    ('income', 'Events', null, 70),
    ('income', 'Offering', null, 80),
    ('income', 'Other', null, 900),
    ('expense', 'Salary', 'Payroll', 10),
    ('expense', 'Pension', 'Payroll', 20),
    ('expense', 'Intern', 'Payroll', 30),
    ('expense', 'Other payroll costs', 'Payroll', 40),
    ('expense', 'Valda', 'General', 100),
    ('expense', 'CF Corporate', 'General', 110),
    ('expense', 'Veolia', 'General', 120),
    ('expense', 'Amazon', 'General', 130),
    ('expense', 'Castle Water', 'General', 140),
    ('expense', 'Affinity Water', 'General', 150),
    ('expense', 'Lloyds Cards', 'General', 160),
    ('expense', 'Google Cloud', 'General', 170),
    ('expense', 'Insurance', 'General', 180),
    ('expense', 'Metro Loan', 'General', 190),
    ('expense', 'Baptist Union Loan', 'General', 200),
    ('expense', 'Dropbox', 'General', 210),
    ('expense', 'GoCardless', 'General', 220),
    ('expense', 'Zoom', 'General', 230),
    ('expense', 'TV Licence', 'General', 240),
    ('expense', 'Service Charge', 'General', 250),
    ('expense', 'Other', 'General', 900)
) as seed(register_type, name, group_name, display_order)
on conflict do nothing;

-- Seed account-based mappings from the starter chart where those accounts exist.
insert into public.register_category_mappings (
  organisation_id,
  register_category_id,
  account_id,
  mapping_type
)
select rc.organisation_id, rc.id, a.id, 'account'
from public.register_categories rc
join public.accounts a
  on a.organisation_id = rc.organisation_id
where rc.status = 'active'
  and (
    (rc.register_type = 'income' and rc.name = 'Giving' and (a.code in ('INC-001', 'INC-002') or a.subtype = 'Giving'))
    or (rc.register_type = 'income' and rc.name = 'Gift Aid' and (a.code = 'INC-003' or a.subtype = 'Gift Aid'))
    or (rc.register_type = 'income' and rc.name = 'Lettings' and (a.code = 'INC-004' or a.subtype = 'Lettings'))
    or (rc.register_type = 'income' and rc.name in ('URC Funding', 'Baptist Union') and (a.code = 'INC-005' or a.subtype = 'Grants'))
    or (rc.register_type = 'income' and rc.name = 'Events' and (a.code = 'INC-006' or a.subtype = 'Events'))
    or (rc.register_type = 'expense' and rc.name = 'Salary' and a.code = 'EXP-001')
    or (rc.register_type = 'expense' and rc.name = 'Other payroll costs' and a.code = 'EXP-002')
    or (rc.register_type = 'expense' and rc.name = 'Pension' and a.code = 'EXP-003')
    or (rc.register_type = 'expense' and rc.name in ('Valda', 'Castle Water', 'Affinity Water', 'Veolia') and a.code = 'EXP-004')
    or (rc.register_type = 'expense' and rc.name = 'Insurance' and a.code = 'EXP-005')
    or (rc.register_type = 'expense' and rc.name = 'Service Charge' and (a.code = 'EXP-010' or a.name ilike '%service charge%' or a.name ilike '%bank charge%'))
    or (rc.register_type = 'expense' and rc.name in ('Google Cloud', 'Dropbox', 'Zoom') and a.code = 'EXP-009')
  )
on conflict do nothing;

-- Seed income-stream mappings where streams exist.
insert into public.register_category_mappings (
  organisation_id,
  register_category_id,
  income_stream_id,
  mapping_type
)
select rc.organisation_id, rc.id, s.id, 'income_stream'
from public.register_categories rc
join public.income_streams s
  on s.organisation_id = rc.organisation_id
where rc.status = 'active'
  and (
    (rc.register_type = 'income' and rc.name = 'Lettings' and s.code = 'LETTINGS')
    or (rc.register_type = 'income' and rc.name = 'Giving' and s.code in ('GIVING', 'DONATIONS', 'OFFERING'))
    or (rc.register_type = 'income' and rc.name = 'Events' and s.code in ('EVENTS', 'FUNDRAISING'))
  )
on conflict do nothing;

-- Seed supplier mappings by existing supplier names.
insert into public.register_category_mappings (
  organisation_id,
  register_category_id,
  supplier_id,
  mapping_type
)
select rc.organisation_id, rc.id, s.id, 'supplier'
from public.register_categories rc
join public.suppliers s
  on s.organisation_id = rc.organisation_id
where rc.register_type = 'expense'
  and rc.status = 'active'
  and lower(s.name) = lower(rc.name)
on conflict do nothing;
