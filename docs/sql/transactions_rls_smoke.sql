-- Transactions feature RLS smoke checks.
-- Run manually in a safe Supabase SQL session with representative users/orgs.
--
-- Replace placeholders before running:
--   :org_a, :org_b, :admin_user_a, :viewer_user_a

-- 1. Active org members can read their organisation's manual transactions.
-- Expected: rows from org A only.
select id, organisation_id, status
from public.manual_transactions
where organisation_id = :'org_a';

-- 2. Cross-organisation reads should return no rows for a user who is not a member.
-- As a user scoped only to org A, expected: 0 rows.
select id, organisation_id
from public.manual_transactions
where organisation_id = :'org_b';

-- 3. Finance write policies should allow admin/treasurer/finance users only.
-- As a read-only viewer/auditor, expected: permission denied or 0 inserted rows.
insert into public.manual_transactions (
  organisation_id,
  type,
  transaction_date,
  amount_pence,
  description,
  created_by
) values (
  :'org_a',
  'expense',
  current_date,
  100,
  'RLS smoke transaction',
  :'viewer_user_a'
);

-- 4. Lines, attachments, and matches must be scoped by organisation_id too.
-- These should not expose rows from org B to an org A-only user.
select id from public.manual_transaction_lines where organisation_id = :'org_b';
select id from public.transaction_attachments where organisation_id = :'org_b';
select id from public.transaction_matches where organisation_id = :'org_b';
