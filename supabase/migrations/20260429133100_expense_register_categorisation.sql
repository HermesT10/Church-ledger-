-- Expense Register categorisation redesign
-- Add review metadata and seed charity/church-friendly expense categories.

alter table if exists public.register_categories
  add column if not exists default_account_id uuid references public.accounts(id) on delete set null,
  add column if not exists default_fund_id uuid references public.funds(id) on delete set null,
  add column if not exists notes text;

alter table if exists public.register_category_mappings
  add column if not exists bank_rule_id uuid references public.bank_rules(id) on delete set null,
  add column if not exists mapping_confidence text not null default 'medium',
  add column if not exists needs_review boolean not null default false,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists notes text;

alter table if exists public.register_category_mappings
  drop constraint if exists register_category_mappings_has_dimension;

alter table if exists public.register_category_mappings
  add constraint register_category_mappings_has_dimension check (
    account_id is not null
    or income_stream_id is not null
    or supplier_id is not null
    or donor_id is not null
    or lettings_hirer_id is not null
    or payroll_component is not null
    or fund_id is not null
    or bank_rule_id is not null
  );

alter table if exists public.register_category_mappings
  drop constraint if exists register_category_mappings_confidence_check;

alter table if exists public.register_category_mappings
  add constraint register_category_mappings_confidence_check
  check (mapping_confidence in ('high', 'medium', 'low'));

create index if not exists idx_register_category_mappings_review
  on public.register_category_mappings (organisation_id, needs_review, mapping_confidence)
  where needs_review = true;

create index if not exists idx_register_category_mappings_org_bank_rule
  on public.register_category_mappings (organisation_id, bank_rule_id)
  where bank_rule_id is not null;

drop index if exists public.idx_register_category_mappings_unique_dimension;

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
    coalesce(bank_rule_id, '00000000-0000-0000-0000-000000000000'::uuid),
    mapping_type
  );

insert into public.register_categories (
  organisation_id,
  register_type,
  name,
  group_name,
  display_order,
  notes
)
select o.id, seed.register_type, seed.name, seed.group_name, seed.display_order, seed.notes
from public.organisations o
cross join (
  values
    ('expense', 'Salaries', 'Staff & Payroll Costs', 10, 'Gross payroll salaries and regular staff pay.'),
    ('expense', 'Pension Contributions', 'Staff & Payroll Costs', 20, 'Employer pension contributions.'),
    ('expense', 'Intern / Temporary Staff', 'Staff & Payroll Costs', 30, 'Interns, casual staff, and temporary staff support.'),
    ('expense', 'Employer Taxes / Payroll Costs', 'Staff & Payroll Costs', 40, 'Employer NI, payroll fees, and payroll-related costs.'),
    ('expense', 'Staff Expenses', 'Staff & Payroll Costs', 50, 'Reimbursed staff costs and staff-related expenses.'),
    ('expense', 'Staff Training', 'Staff & Payroll Costs', 60, 'Training, conferences, and development.'),

    ('expense', 'Building Maintenance', 'Premises & Building Costs', 110, 'General maintenance and facilities work.'),
    ('expense', 'Cleaning', 'Premises & Building Costs', 120, 'Cleaning services and supplies.'),
    ('expense', 'Water', 'Premises & Building Costs', 130, 'Water suppliers and water rates.'),
    ('expense', 'Utilities', 'Premises & Building Costs', 140, 'Gas, electricity, waste, and other utilities.'),
    ('expense', 'Insurance', 'Premises & Building Costs', 150, 'Property, liability, and broker insurance costs.'),
    ('expense', 'Service Charges', 'Premises & Building Costs', 160, 'Premises service charges where not bank-related.'),
    ('expense', 'Repairs', 'Premises & Building Costs', 170, 'Reactive building and equipment repairs.'),
    ('expense', 'Security / Fire Safety', 'Premises & Building Costs', 180, 'Security, alarms, fire safety, and compliance checks.'),

    ('expense', 'Software Subscriptions', 'Office, Admin & Software', 210, 'SaaS, hosting, and admin software subscriptions.'),
    ('expense', 'Cloud Storage', 'Office, Admin & Software', 220, 'File storage and backup subscriptions.'),
    ('expense', 'Video Conferencing', 'Office, Admin & Software', 230, 'Video meeting and conferencing tools.'),
    ('expense', 'Payment Processing Fees', 'Office, Admin & Software', 240, 'Merchant, Direct Debit, and donation platform fees.'),
    ('expense', 'Office Supplies', 'Office, Admin & Software', 250, 'General office consumables and supplies.'),
    ('expense', 'Stationery', 'Office, Admin & Software', 260, 'Paper, printing, and stationery.'),
    ('expense', 'Professional Fees', 'Office, Admin & Software', 270, 'Accounting, legal, consulting, and admin services.'),
    ('expense', 'Licences', 'Office, Admin & Software', 280, 'TV, music, and other licences unless ministry-specific.'),

    ('expense', 'Sunday Services', 'Ministry, Worship & Church Activities', 310, 'Sunday worship service costs.'),
    ('expense', 'Worship & Music', 'Ministry, Worship & Church Activities', 320, 'Music, worship, and worship licensing costs.'),
    ('expense', 'Guest Speakers', 'Ministry, Worship & Church Activities', 330, 'Speaker honoraria and visiting ministry costs.'),
    ('expense', 'Events', 'Ministry, Worship & Church Activities', 340, 'Church events and activity costs.'),
    ('expense', 'Cafe / Hospitality', 'Ministry, Worship & Church Activities', 350, 'Cafe, refreshments, hospitality, and fellowship costs.'),
    ('expense', 'Outreach Activities', 'Ministry, Worship & Church Activities', 360, 'Local outreach and evangelism activities.'),
    ('expense', 'Youth / Children Ministry', 'Ministry, Worship & Church Activities', 370, 'Youth, children, and family ministry costs.'),
    ('expense', 'Pastoral Support', 'Ministry, Worship & Church Activities', 380, 'Pastoral care and benevolence support.'),
    ('expense', 'Church Activities', 'Ministry, Worship & Church Activities', 390, 'General ministry and church activity costs needing a broad bucket.'),

    ('expense', 'Mission Giving', 'Mission, Giving & External Support', 410, 'Mission partners and mission giving.'),
    ('expense', 'Denominational Contributions', 'Mission, Giving & External Support', 420, 'Baptist, URC, association, and denominational contributions.'),
    ('expense', 'External Charity Support', 'Mission, Giving & External Support', 430, 'Support paid to external charities.'),
    ('expense', 'Grants Given', 'Mission, Giving & External Support', 440, 'Grants made to individuals or organisations.'),
    ('expense', 'Community Support', 'Mission, Giving & External Support', 450, 'Community support and local relief.'),
    ('expense', 'Leadership Support', 'Mission, Giving & External Support', 460, 'Leadership support payments where not payroll.'),

    ('expense', 'Bank Charges', 'Finance, Bank Charges & Loan Repayments', 510, 'Bank fees and account service charges.'),
    ('expense', 'Loan Interest', 'Finance, Bank Charges & Loan Repayments', 520, 'Interest element of loans and finance costs.'),
    ('expense', 'Loan Repayments', 'Finance, Bank Charges & Loan Repayments', 530, 'Loan repayments; split principal and interest where possible.'),
    ('expense', 'Card Charges', 'Finance, Bank Charges & Loan Repayments', 540, 'Credit card charges and card repayment fees.'),
    ('expense', 'Debt Repayments', 'Finance, Bank Charges & Loan Repayments', 550, 'Repayment of debts, arrears, or liabilities.'),

    ('expense', 'Uncategorized', 'Other / Needs Review', 900, 'System fallback for unmapped expense activity.'),
    ('expense', 'Needs Review', 'Other / Needs Review', 910, 'Uncertain supplier/account mappings awaiting review.'),
    ('expense', 'One-off Expense', 'Other / Needs Review', 920, 'One-off items that do not fit a regular category.'),
    ('expense', 'Correction / Adjustment', 'Other / Needs Review', 930, 'Corrections, adjustments, and unusual accounting entries.')
) as seed(register_type, name, group_name, display_order, notes)
on conflict do nothing;

with old_to_new(old_name, new_name, confidence, needs_review, review_note) as (
  values
    ('Salary', 'Salaries', 'high', false, null),
    ('Pension', 'Pension Contributions', 'high', false, null),
    ('Intern', 'Intern / Temporary Staff', 'high', false, null),
    ('Other payroll costs', 'Employer Taxes / Payroll Costs', 'medium', false, null),
    ('Valda', 'Needs Review', 'low', true, 'Supplier is uncertain; review before final category.'),
    ('CF Corporate', 'Needs Review', 'low', true, 'Supplier may be professional/admin services; review needed.'),
    ('Veolia', 'Utilities', 'low', true, 'Likely waste or premises utility; confirm before finalising.'),
    ('Amazon', 'Office Supplies', 'medium', true, 'Default to supplies but review because Amazon can include many expense types.'),
    ('Castle Water', 'Water', 'high', false, null),
    ('Affinity Water', 'Water', 'high', false, null),
    ('Lloyds Cards', 'Card Charges', 'medium', true, 'Could be card repayment rather than charge; review statement context.'),
    ('Google Cloud', 'Software Subscriptions', 'high', false, null),
    ('Insurance', 'Insurance', 'high', false, null),
    ('Metro Loan', 'Loan Repayments', 'medium', true, 'Review split between loan interest and principal/liability repayment.'),
    ('Baptist Union Loan', 'Loan Repayments', 'medium', true, 'Review split between loan interest and principal/liability repayment.'),
    ('Dropbox', 'Cloud Storage', 'high', false, null),
    ('GoCardless', 'Payment Processing Fees', 'high', false, null),
    ('Zoom', 'Video Conferencing', 'high', false, null),
    ('TV Licence', 'Licences', 'high', false, null),
    ('Service Charge', 'Needs Review', 'low', true, 'Could be premises service charge or bank charge; review needed.'),
    ('Other', 'Needs Review', 'low', true, 'Legacy catch-all category migrated to review workflow.')
),
old_categories as (
  select rc.*
  from public.register_categories rc
  join old_to_new m on lower(m.old_name) = lower(rc.name)
  where rc.register_type = 'expense'
    and rc.status = 'active'
    and coalesce(rc.group_name, '') in ('General', 'Payroll')
),
new_categories as (
  select rc.*, m.old_name, m.confidence, m.needs_review, m.review_note
  from public.register_categories rc
  join old_to_new m on lower(m.new_name) = lower(rc.name)
  where rc.register_type = 'expense'
    and rc.status = 'active'
),
migrated_mappings as (
  insert into public.register_category_mappings (
    organisation_id,
    register_category_id,
    account_id,
    income_stream_id,
    supplier_id,
    donor_id,
    lettings_hirer_id,
    payroll_component,
    fund_id,
    mapping_type,
    mapping_confidence,
    needs_review,
    notes
  )
  select
    old_map.organisation_id,
    new_categories.id,
    old_map.account_id,
    old_map.income_stream_id,
    old_map.supplier_id,
    old_map.donor_id,
    old_map.lettings_hirer_id,
    old_map.payroll_component,
    old_map.fund_id,
    old_map.mapping_type,
    new_categories.confidence,
    new_categories.needs_review,
    new_categories.review_note
  from public.register_category_mappings old_map
  join old_categories on old_categories.id = old_map.register_category_id
  join new_categories
    on new_categories.organisation_id = old_categories.organisation_id
   and lower(new_categories.old_name) = lower(old_categories.name)
  on conflict do nothing
  returning id
)
update public.register_categories rc
set status = 'archived',
    notes = coalesce(rc.notes, 'Archived by expense register categorisation redesign.')
from old_categories
where rc.id = old_categories.id;

-- Account-based defaults for existing charts of accounts.
insert into public.register_category_mappings (
  organisation_id,
  register_category_id,
  account_id,
  mapping_type,
  mapping_confidence,
  needs_review,
  notes
)
select rc.organisation_id, rc.id, a.id, 'account', seed.confidence, seed.needs_review, seed.notes
from public.register_categories rc
join public.accounts a on a.organisation_id = rc.organisation_id
join (
  values
    ('Salaries', 'EXP-001', 'high', false, null),
    ('Employer Taxes / Payroll Costs', 'EXP-002', 'medium', false, null),
    ('Pension Contributions', 'EXP-003', 'high', false, null),
    ('Building Maintenance', 'EXP-004', 'medium', false, null),
    ('Insurance', 'EXP-005', 'high', false, null),
    ('Worship & Music', 'EXP-007', 'medium', false, null),
    ('Events', 'EXP-008', 'medium', false, null),
    ('Software Subscriptions', 'EXP-009', 'medium', false, null),
    ('Bank Charges', 'EXP-010', 'medium', true, 'Confirm whether generic service charges are bank fees or premises charges.')
) as seed(category_name, account_code, confidence, needs_review, notes)
  on lower(rc.name) = lower(seed.category_name)
where rc.register_type = 'expense'
  and rc.status = 'active'
  and a.code = seed.account_code
on conflict do nothing;

-- Supplier defaults by known manual-ledger supplier names.
insert into public.register_category_mappings (
  organisation_id,
  register_category_id,
  supplier_id,
  mapping_type,
  mapping_confidence,
  needs_review,
  notes
)
select rc.organisation_id, rc.id, s.id, 'supplier', seed.confidence, seed.needs_review, seed.notes
from public.suppliers s
join (
  values
    ('Castle Water', 'Water', 'high', false, null),
    ('Affinity Water', 'Water', 'high', false, null),
    ('Google Cloud', 'Software Subscriptions', 'high', false, null),
    ('Google Clouds', 'Software Subscriptions', 'high', false, null),
    ('Dropbox', 'Cloud Storage', 'high', false, null),
    ('Zoom', 'Video Conferencing', 'high', false, null),
    ('GoCardless', 'Payment Processing Fees', 'high', false, null),
    ('TV Licence', 'Licences', 'high', false, null),
    ('The Broker Network', 'Insurance', 'medium', false, 'Broker/insurance supplier mapped to insurance.'),
    ('London Baptist A', 'Denominational Contributions', 'medium', false, 'Likely denominational contribution; review if loan-related.'),
    ('URC Trust', 'Denominational Contributions', 'medium', false, 'Likely denominational contribution.'),
    ('Home Mission', 'Mission Giving', 'medium', false, 'Mission giving supplier/category.'),
    ('Metro Loan', 'Loan Repayments', 'medium', true, 'Review interest/principal split.'),
    ('Baptist Union Loan', 'Loan Repayments', 'medium', true, 'Review interest/principal split.'),
    ('LB of Barnet Repayment', 'Debt Repayments', 'medium', true, 'Review repayment context.'),
    ('Lloyds Cards', 'Card Charges', 'medium', true, 'Confirm card charge vs credit card repayment.'),
    ('Amazon', 'Office Supplies', 'medium', true, 'Amazon spend can span categories; review recurring patterns.'),
    ('Veolia', 'Utilities', 'low', true, 'Likely waste/utility supplier; confirm.'),
    ('Valda', 'Needs Review', 'low', true, 'Uncertain supplier.'),
    ('Advantis Credit', 'Needs Review', 'low', true, 'Uncertain supplier.'),
    ('Viking', 'Needs Review', 'low', true, 'Uncertain supplier.'),
    ('CF Corporate', 'Needs Review', 'low', true, 'Uncertain supplier.'),
    ('Focus Group', 'Needs Review', 'low', true, 'Could be church activity or supplier service; review.'),
    ('Other', 'Needs Review', 'low', true, 'Generic supplier/category needs review.')
) as seed(supplier_name, category_name, confidence, needs_review, notes)
  on lower(s.name) = lower(seed.supplier_name)
join public.register_categories rc
  on rc.organisation_id = s.organisation_id
 and rc.register_type = 'expense'
 and rc.status = 'active'
 and lower(rc.name) = lower(seed.category_name)
on conflict do nothing;
