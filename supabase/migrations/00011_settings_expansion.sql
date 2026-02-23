-- 00011_settings_expansion.sql
-- Expand organisation_settings with additional columns for the Settings page.

-- ============================================================
-- 1. Add new columns
-- ============================================================

ALTER TABLE public.organisation_settings
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/London',
  ADD COLUMN IF NOT EXISTS date_format text NOT NULL DEFAULT 'DD/MM/YYYY',
  ADD COLUMN IF NOT EXISTS default_bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_creditors_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forecast_risk_tolerance_pence bigint NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS require_fund_on_journal_lines boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_fund_level_budgets boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS overspend_alert_notifications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS month_end_reminder boolean NOT NULL DEFAULT true;

-- ============================================================
-- 2. CHECK constraints
-- ============================================================

-- fiscal_year_start_month must be 1..12
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'org_settings_fiscal_month_range'
  ) THEN
    ALTER TABLE public.organisation_settings
      ADD CONSTRAINT org_settings_fiscal_month_range
      CHECK (fiscal_year_start_month >= 1 AND fiscal_year_start_month <= 12);
  END IF;
END $$;

-- date_format must be one of the supported values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'org_settings_date_format_valid'
  ) THEN
    ALTER TABLE public.organisation_settings
      ADD CONSTRAINT org_settings_date_format_valid
      CHECK (date_format IN ('DD/MM/YYYY', 'MM/DD/YYYY'));
  END IF;
END $$;

-- forecast_risk_tolerance_pence must be non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'org_settings_risk_tolerance_nonneg'
  ) THEN
    ALTER TABLE public.organisation_settings
      ADD CONSTRAINT org_settings_risk_tolerance_nonneg
      CHECK (forecast_risk_tolerance_pence >= 0);
  END IF;
END $$;
