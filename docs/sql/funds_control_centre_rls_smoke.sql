-- Funds Control Centre — RLS smoke checks (migration 00071)
--
-- Run manually against a staging database with realistic JWT / role claims,
-- or adapt for pgTAP/pg_prove in CI. These are **expectations**, not runnable
-- as a single unattended script without org UUIDs and test users.
--
-- Tenancy column is always **organisation_id** (there is no workspace_id).

-- ---------------------------------------------------------------------------
-- 1) income_streams — member can read own org only
-- Authenticated user A (org OA): expect rows where organisation_id = OA.
-- Authenticated user B (org OB): must NOT select streams for OA (0 rows).

-- Example pattern (pseudo):
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"...","organisation_id":"<OA>"}';  -- if your JWT maps this way
--   select count(*) from public.income_streams where organisation_id = '<OB>'::uuid;
-- Expected: 0

-- ---------------------------------------------------------------------------
-- 2) fund_transfers / fund_adjustments — same as funds: treasurer/admin write

-- INSERT as ordinary member → expect RLS denial (depending on helper is_org_treasurer_or_admin).

-- ---------------------------------------------------------------------------
-- 3) RPC calculate_fund_balance — granted to authenticated; ensures only
-- scoped lines (organisation_id matches on journal_lines path via join).

-- ---------------------------------------------------------------------------
-- Automated alternative: integration tests calling Supabase with two test orgs
-- and asserting `.eq('organisation_id', otherOrg)` returns empty — see Vitest tests.
