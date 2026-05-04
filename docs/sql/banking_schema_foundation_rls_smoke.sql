-- Banking schema foundation RLS smoke checks.
--
-- Run this against a local/dev database with two authenticated test users.
-- Replace placeholders before running:
--   :org_a, :org_b, :user_a, :user_b
--
-- Expected outcome:
--   - user_a can see rows for org_a
--   - user_a cannot see rows for org_b
--   - cross-workspace inserts/updates are rejected by RLS or tenant-sync checks

-- As service/admin setup:
insert into public.bank_statement_imports (
  workspace_id,
  bank_account_id,
  file_name,
  file_path,
  file_type,
  file_hash,
  status,
  uploaded_by
)
select
  :'org_a'::uuid,
  ba.id,
  'rls-a.csv',
  :'org_a' || '/bank-imports/rls-a.csv',
  'text/csv',
  encode(digest('rls-a', 'sha256'), 'hex'),
  'uploaded',
  :'user_a'::uuid
from public.bank_accounts ba
where ba.organisation_id = :'org_a'::uuid
limit 1;

insert into public.bank_import_mappings (
  workspace_id,
  file_type,
  mapping_name,
  date_column,
  description_column,
  amount_column,
  created_by
)
values (
  :'org_a'::uuid,
  'text/csv',
  'RLS smoke mapping',
  'Date',
  'Description',
  'Amount',
  :'user_a'::uuid
);

insert into public.bank_rules (
  workspace_id,
  name,
  priority,
  condition_type,
  condition_value,
  transaction_type,
  created_by
)
values (
  :'org_a'::uuid,
  'RLS smoke rule',
  10,
  'contains',
  'test',
  'other',
  :'user_a'::uuid
);

-- In an authenticated session for user_a:
-- select count(*) from public.bank_statement_imports where workspace_id = :'org_a'::uuid; -- expect >= 1
-- select count(*) from public.bank_statement_imports where workspace_id = :'org_b'::uuid; -- expect 0
-- select count(*) from public.bank_import_mappings where workspace_id = :'org_b'::uuid; -- expect 0
-- select count(*) from public.bank_rules where workspace_id = :'org_b'::uuid; -- expect 0

-- Cross-tenant mismatch guard on compatibility columns:
-- insert into public.bank_accounts (organisation_id, workspace_id, name, currency)
-- values (:'org_a'::uuid, :'org_b'::uuid, 'Should fail', 'GBP');
-- Expected: ERROR "workspace_id and organisation_id must match."
