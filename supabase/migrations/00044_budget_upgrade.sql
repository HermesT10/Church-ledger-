-- 00044_budget_upgrade.sql
-- Budget module upgrade: versioning, approval, server-side actuals RPC,
-- monthly planning view, annual view, forecasting, fund protection.

-- ============================================================
-- 1. Add version_number, approved_at, approved_by to budgets
-- ============================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);

-- Update status CHECK to use 'approved' instead of 'active'
ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_status_check;
ALTER TABLE public.budgets ADD CONSTRAINT budgets_status_check
  CHECK (status IN ('draft', 'approved', 'archived'));

-- Migrate existing 'active' statuses to 'approved'
UPDATE public.budgets SET status = 'approved' WHERE status = 'active';

-- ============================================================
-- 2. Performance indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_budget_lines_budget_account_month
  ON public.budget_lines (budget_id, account_id);

CREATE INDEX IF NOT EXISTS idx_jlines_org_account_date
  ON public.journal_lines (organisation_id, account_id);

-- ============================================================
-- 3. RPC: get_budget_actuals
--    Server-side aggregation of actuals by account+month
--    from posted journal_lines for a given year.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_budget_actuals(
  p_org_id uuid,
  p_year integer,
  p_fund_id uuid DEFAULT NULL
)
RETURNS TABLE (
  account_id uuid,
  account_type text,
  month integer,
  net_pence bigint
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    jl.account_id,
    a.type AS account_type,
    EXTRACT(MONTH FROM j.journal_date)::integer AS month,
    CASE
      WHEN a.type = 'income' THEN SUM(jl.credit_pence - jl.debit_pence)
      WHEN a.type = 'expense' THEN SUM(jl.debit_pence - jl.credit_pence)
      ELSE 0
    END AS net_pence
  FROM journal_lines jl
  JOIN journals j ON j.id = jl.journal_id
  JOIN accounts a ON a.id = jl.account_id
  WHERE jl.organisation_id = p_org_id
    AND j.status = 'posted'
    AND j.journal_date >= make_date(p_year, 1, 1)
    AND j.journal_date <= make_date(p_year, 12, 31)
    AND a.type IN ('income', 'expense')
    AND (p_fund_id IS NULL OR jl.fund_id = p_fund_id)
  GROUP BY jl.account_id, a.type, EXTRACT(MONTH FROM j.journal_date)
$$;

REVOKE ALL ON FUNCTION public.get_budget_actuals(uuid, integer, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_budget_actuals(uuid, integer, uuid) TO authenticated;

-- ============================================================
-- 4. RPC: get_budget_drill_down
--    Paginated transaction lines for a specific account+month
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_budget_drill_down(
  p_org_id uuid,
  p_year integer,
  p_account_id uuid,
  p_fund_id uuid DEFAULT NULL,
  p_month integer DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  journal_id uuid,
  journal_date date,
  memo text,
  description text,
  debit_pence bigint,
  credit_pence bigint,
  fund_id uuid
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    j.id AS journal_id,
    j.journal_date,
    j.memo,
    jl.description,
    jl.debit_pence,
    jl.credit_pence,
    jl.fund_id
  FROM journal_lines jl
  JOIN journals j ON j.id = jl.journal_id
  WHERE jl.organisation_id = p_org_id
    AND jl.account_id = p_account_id
    AND j.status = 'posted'
    AND j.journal_date >= make_date(p_year, 1, 1)
    AND j.journal_date <= make_date(p_year, 12, 31)
    AND (p_fund_id IS NULL OR jl.fund_id = p_fund_id)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM j.journal_date) = p_month)
  ORDER BY j.journal_date DESC, j.id
  LIMIT p_limit
  OFFSET p_offset
$$;

REVOKE ALL ON FUNCTION public.get_budget_drill_down(uuid, integer, uuid, uuid, integer, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_budget_drill_down(uuid, integer, uuid, uuid, integer, integer, integer) TO authenticated;

-- ============================================================
-- 5. RPC: get_budget_fund_summary
--    Annual income/expense totals by fund from actuals
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_budget_fund_summary(
  p_org_id uuid,
  p_year integer
)
RETURNS TABLE (
  fund_id uuid,
  fund_name text,
  fund_type text,
  income_pence bigint,
  expense_pence bigint
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.id AS fund_id,
    f.name AS fund_name,
    f.type AS fund_type,
    COALESCE(SUM(CASE WHEN a.type = 'income' THEN jl.credit_pence - jl.debit_pence ELSE 0 END), 0) AS income_pence,
    COALESCE(SUM(CASE WHEN a.type = 'expense' THEN jl.debit_pence - jl.credit_pence ELSE 0 END), 0) AS expense_pence
  FROM funds f
  LEFT JOIN journal_lines jl ON jl.fund_id = f.id
    AND jl.organisation_id = p_org_id
  LEFT JOIN journals j ON j.id = jl.journal_id
    AND j.status = 'posted'
    AND j.journal_date >= make_date(p_year, 1, 1)
    AND j.journal_date <= make_date(p_year, 12, 31)
  LEFT JOIN accounts a ON a.id = jl.account_id
    AND a.type IN ('income', 'expense')
  WHERE f.organisation_id = p_org_id
    AND f.is_active = true
  GROUP BY f.id, f.name, f.type
  ORDER BY f.name
$$;

REVOKE ALL ON FUNCTION public.get_budget_fund_summary(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_budget_fund_summary(uuid, integer) TO authenticated;
