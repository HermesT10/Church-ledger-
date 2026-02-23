-- 00025_performance_indexes.sql
-- Phase 9.3: Performance optimisation indexes for reports and dashboards.
-- journals and journal_lines had ZERO indexes beyond PKs; these are
-- the two most-queried tables in the system.

-- ============================================================
-- 1. Journals: composite index for report queries
-- ============================================================
-- Used by getActualsByMonth, getFundMovementsReport, getBalanceSheet, dashboard.
-- Covers: WHERE organisation_id = ? AND status = 'posted' AND journal_date BETWEEN ? AND ?

create index if not exists idx_journals_org_status_date
  on public.journals (organisation_id, status, journal_date);

-- ============================================================
-- 2. Journal Lines: FK index + composite indexes
-- ============================================================
-- journal_lines had NO indexes at all. The journal_id FK is used in
-- every single report query via .in('journal_id', [...]).

create index if not exists idx_jlines_journal
  on public.journal_lines (journal_id);

-- Used by I&E, BvA, balance sheet: WHERE organisation_id = ? AND account_id IN (...)
create index if not exists idx_jlines_org_account
  on public.journal_lines (organisation_id, account_id);

-- Used by fund movements, fund-level budgets: WHERE organisation_id = ? AND fund_id = ?
create index if not exists idx_jlines_org_fund
  on public.journal_lines (organisation_id, fund_id);

-- ============================================================
-- 3. Donations: composite for Gift Aid preview + dashboard
-- ============================================================
-- Gift Aid claim preview: org + date range + claim status.
-- Dashboard: org + status + claim_id IS NULL.

create index if not exists idx_donations_org_date_claim
  on public.donations (organisation_id, donation_date, gift_aid_claim_id);

-- ============================================================
-- 4. Bank Lines: composite for reconciliation
-- ============================================================
-- Already has idx_bank_lines_account_date (bank_account_id, txn_date)
-- and idx_bank_lines_org (organisation_id).
-- Add 3-column composite for reconciliation queries:

create index if not exists idx_bank_lines_org_account_date
  on public.bank_lines (organisation_id, bank_account_id, txn_date);
