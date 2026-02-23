-- 00029_accounts_hierarchy.sql
-- Add parent_id and reporting_category to accounts for Chart of Accounts hierarchy

-- 1. Add new columns
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS reporting_category text;

-- 2. Index for parent lookups (hierarchy queries)
CREATE INDEX IF NOT EXISTS idx_accounts_parent
  ON public.accounts (parent_id)
  WHERE parent_id IS NOT NULL;

-- 3. Index for reporting category grouping
CREATE INDEX IF NOT EXISTS idx_accounts_reporting_category
  ON public.accounts (organisation_id, reporting_category)
  WHERE reporting_category IS NOT NULL;

-- 4. Backfill reporting_category for existing seed accounts
UPDATE public.accounts SET reporting_category = 'Tithes & Offerings'    WHERE code IN ('INC-001', 'INC-002') AND reporting_category IS NULL;
UPDATE public.accounts SET reporting_category = 'Tax Recovery'          WHERE code = 'INC-003' AND reporting_category IS NULL;
UPDATE public.accounts SET reporting_category = 'Other Income'          WHERE code IN ('INC-004', 'INC-005', 'INC-006', 'INC-DON') AND reporting_category IS NULL;
UPDATE public.accounts SET reporting_category = 'Staff Costs'           WHERE code IN ('EXP-001', 'EXP-002', 'EXP-003') AND reporting_category IS NULL;
UPDATE public.accounts SET reporting_category = 'Premises Costs'        WHERE code IN ('EXP-004', 'EXP-005', 'EXP-006') AND reporting_category IS NULL;
UPDATE public.accounts SET reporting_category = 'Ministry & Activities' WHERE code IN ('EXP-007', 'EXP-008') AND reporting_category IS NULL;
UPDATE public.accounts SET reporting_category = 'Platform Fees'         WHERE code = 'EXP-FEE' AND reporting_category IS NULL;
UPDATE public.accounts SET reporting_category = 'Bank Accounts'         WHERE code IN ('AST-001', 'AST-002', 'AST-003') AND reporting_category IS NULL;
UPDATE public.accounts SET reporting_category = 'Clearing Accounts'     WHERE code IN ('CLR-GC', 'CLR-SU', 'CLR-IZ') AND reporting_category IS NULL;
UPDATE public.accounts SET reporting_category = 'Creditors'             WHERE code = 'LIA-001' AND reporting_category IS NULL;
UPDATE public.accounts SET reporting_category = 'Payroll Liabilities'   WHERE code IN ('LIA-002', 'LIA-003', 'LIA-004') AND reporting_category IS NULL;
UPDATE public.accounts SET reporting_category = 'General Reserves'      WHERE code = 'EQU-001' AND reporting_category IS NULL;
UPDATE public.accounts SET reporting_category = 'Restricted Reserves'   WHERE code = 'EQU-002' AND reporting_category IS NULL;
