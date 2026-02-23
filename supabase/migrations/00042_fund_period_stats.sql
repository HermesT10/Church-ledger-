-- 00042_fund_period_stats.sql
-- Fund period stats: RPC functions for server-side aggregation + indexes

-- ============================================================
-- 1. Additional performance indexes
-- ============================================================

-- Composite for period-based fund queries joining journals
CREATE INDEX IF NOT EXISTS idx_jlines_org_fund_account
  ON public.journal_lines (organisation_id, fund_id, account_id);

-- ============================================================
-- 2. RPC: get_fund_period_stats
-- Returns aggregated income/expense per fund for a date range.
-- Only includes posted journal lines.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_fund_period_stats(
  p_org_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  fund_id uuid,
  account_type text,
  total_debit_pence bigint,
  total_credit_pence bigint,
  line_count bigint
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    jl.fund_id,
    a.type::text AS account_type,
    COALESCE(SUM(jl.debit_pence), 0)  AS total_debit_pence,
    COALESCE(SUM(jl.credit_pence), 0) AS total_credit_pence,
    COUNT(*)                           AS line_count
  FROM public.journal_lines jl
  JOIN public.journals j ON j.id = jl.journal_id
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.organisation_id = p_org_id
    AND j.status = 'posted'
    AND j.journal_date >= p_start_date
    AND j.journal_date <= p_end_date
    AND jl.fund_id IS NOT NULL
  GROUP BY jl.fund_id, a.type
$$;

REVOKE ALL ON FUNCTION public.get_fund_period_stats(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.get_fund_period_stats(uuid, date, date) TO authenticated;

-- ============================================================
-- 3. RPC: get_fund_balance_stats
-- Returns overall balance stats per fund (all time, posted only).
-- More efficient than pulling all rows client-side.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_fund_balance_stats(
  p_org_id uuid
)
RETURNS TABLE (
  fund_id uuid,
  total_debit_pence bigint,
  total_credit_pence bigint,
  line_count bigint
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    jl.fund_id,
    COALESCE(SUM(jl.debit_pence), 0)  AS total_debit_pence,
    COALESCE(SUM(jl.credit_pence), 0) AS total_credit_pence,
    COUNT(*)                           AS line_count
  FROM public.journal_lines jl
  JOIN public.journals j ON j.id = jl.journal_id
  WHERE jl.organisation_id = p_org_id
    AND j.status = 'posted'
    AND jl.fund_id IS NOT NULL
  GROUP BY jl.fund_id
$$;

REVOKE ALL ON FUNCTION public.get_fund_balance_stats(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_fund_balance_stats(uuid) TO authenticated;

-- ============================================================
-- 4. RPC: get_fund_account_breakdown
-- For fund drill-down: income and expense totals by account
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_fund_account_breakdown(
  p_org_id uuid,
  p_fund_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  total_debit_pence bigint,
  total_credit_pence bigint,
  line_count bigint
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id             AS account_id,
    a.code           AS account_code,
    a.name           AS account_name,
    a.type::text     AS account_type,
    COALESCE(SUM(jl.debit_pence), 0)  AS total_debit_pence,
    COALESCE(SUM(jl.credit_pence), 0) AS total_credit_pence,
    COUNT(*)                           AS line_count
  FROM public.journal_lines jl
  JOIN public.journals j ON j.id = jl.journal_id
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.organisation_id = p_org_id
    AND jl.fund_id = p_fund_id
    AND j.status = 'posted'
    AND j.journal_date >= p_start_date
    AND j.journal_date <= p_end_date
  GROUP BY a.id, a.code, a.name, a.type
  ORDER BY a.type, total_credit_pence DESC, total_debit_pence DESC
$$;

REVOKE ALL ON FUNCTION public.get_fund_account_breakdown(uuid, uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.get_fund_account_breakdown(uuid, uuid, date, date) TO authenticated;

-- ============================================================
-- 5. RPC: get_fund_transactions
-- Paginated transaction list for a fund
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_fund_transactions(
  p_org_id uuid,
  p_fund_id uuid,
  p_start_date date,
  p_end_date date,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  journal_line_id uuid,
  journal_id uuid,
  journal_date date,
  journal_memo text,
  account_code text,
  account_name text,
  account_type text,
  description text,
  debit_pence bigint,
  credit_pence bigint
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    jl.id            AS journal_line_id,
    j.id             AS journal_id,
    j.journal_date,
    j.memo           AS journal_memo,
    a.code           AS account_code,
    a.name           AS account_name,
    a.type::text     AS account_type,
    jl.description,
    jl.debit_pence,
    jl.credit_pence
  FROM public.journal_lines jl
  JOIN public.journals j ON j.id = jl.journal_id
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.organisation_id = p_org_id
    AND jl.fund_id = p_fund_id
    AND j.status = 'posted'
    AND j.journal_date >= p_start_date
    AND j.journal_date <= p_end_date
  ORDER BY j.journal_date DESC, j.created_at DESC
  LIMIT p_limit OFFSET p_offset
$$;

REVOKE ALL ON FUNCTION public.get_fund_transactions(uuid, uuid, date, date, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_fund_transactions(uuid, uuid, date, date, int, int) TO authenticated;
