-- Accounts RLS verification (organisation_id tenancy)
--
-- Like other modules: authenticated members may SELECT rows for their organisation;
-- treasurer/admin may INSERT/UPDATE/DELETE. There is no workspace_id column.
--
-- Manual smoke: as user A with membership in org OA, querying accounts for OB must return zero rows.

-- Expect 0 rows (example — replace UUIDs):
-- set request.jwt.claims appropriately for Supabase dashboard SQL tester;
-- select count(*) from public.accounts where organisation_id = '<other_org_uuid>';
