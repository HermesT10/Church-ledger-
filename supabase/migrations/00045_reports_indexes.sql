-- =====================================================================
-- 00045_reports_indexes.sql
-- Performance indexes for the Reports module
-- =====================================================================

-- Index for cash flow / balance sheet reports: journal lines by account + date
CREATE INDEX IF NOT EXISTS idx_jlines_account_date
  ON public.journal_lines (account_id, organisation_id);

-- Index for fund-filtered reports: journal lines by fund + date
CREATE INDEX IF NOT EXISTS idx_jlines_fund_org
  ON public.journal_lines (fund_id, organisation_id)
  WHERE fund_id IS NOT NULL;

-- Index for account type lookups in reporting
CREATE INDEX IF NOT EXISTS idx_accounts_org_type
  ON public.accounts (organisation_id, type);

-- Index for journal date range queries
CREATE INDEX IF NOT EXISTS idx_journals_org_status_date
  ON public.journals (organisation_id, status, journal_date);

-- Index for reporting category grouping
CREATE INDEX IF NOT EXISTS idx_accounts_reporting_category
  ON public.accounts (organisation_id, reporting_category)
  WHERE reporting_category IS NOT NULL;
