-- 00034_suppliers_enhancement.sql
-- Enhance suppliers table with contact details and default account/fund.

-- ============================================================
-- 1. Add new columns to suppliers
-- ============================================================

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS default_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_fund_id uuid REFERENCES public.funds(id) ON DELETE SET NULL;

-- ============================================================
-- 2. Indexes for FK lookups
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_suppliers_default_account
  ON public.suppliers (default_account_id)
  WHERE default_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_default_fund
  ON public.suppliers (default_fund_id)
  WHERE default_fund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_org_active
  ON public.suppliers (organisation_id, is_active);
