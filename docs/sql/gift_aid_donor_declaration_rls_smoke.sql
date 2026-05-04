-- Gift Aid donor/declaration RLS smoke checks.
-- Replace the UUID placeholders with two organisations and two users in a
-- local/staging database. Run as authenticated users, not service_role.

-- Expected setup:
-- - user A is a member/treasurer of org A only.
-- - user B is a member/treasurer of org B only.
-- - each org has at least one donor and Gift Aid declaration.

-- As user A: donors from org B must not be visible.
select count(*) as visible_org_b_donors
from public.donors
where organisation_id = '00000000-0000-0000-0000-0000000000b2';

-- Expected: 0

-- As user A: declarations from org B must not be visible.
select count(*) as visible_org_b_declarations
from public.gift_aid_declarations
where organisation_id = '00000000-0000-0000-0000-0000000000b2';

-- Expected: 0

-- As user A: inserting a donor into org B must fail RLS.
insert into public.donors (organisation_id, full_name)
values ('00000000-0000-0000-0000-0000000000b2', 'Cross Org Donor');

-- Expected: ERROR from row-level security policy.

-- As user A: inserting a declaration for an org B donor must fail RLS.
insert into public.gift_aid_declarations (
  organisation_id,
  donor_id,
  declaration_type,
  status,
  start_date,
  declaration_date,
  signed_date,
  charity_name,
  donor_title_snapshot,
  donor_first_name_or_initial_snapshot,
  donor_surname_snapshot,
  donor_full_home_address_snapshot,
  donor_postcode_snapshot,
  taxpayer_confirmation,
  declaration_wording,
  donor_notification_notes
)
values (
  '00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-00000000d0b2',
  'single',
  'draft',
  current_date,
  current_date,
  current_date,
  'Other Org Church',
  'Mr',
  'A',
  'Donor',
  '1 Other Street',
  'SW1A 1AA',
  true,
  'Gift Aid declaration wording.',
  'Notify the charity if circumstances change.'
);

-- Expected: ERROR from row-level security policy.

-- As user A: Gift Aid declaration documents from org B must not be visible.
select count(*) as visible_org_b_documents
from public.gift_aid_declaration_documents
where organisation_id = '00000000-0000-0000-0000-0000000000b2';

-- Expected: 0
