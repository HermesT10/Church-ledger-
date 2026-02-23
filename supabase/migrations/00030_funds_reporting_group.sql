-- 00030_funds_reporting_group.sql
-- Add reporting_group column to funds for charity reporting grouping

ALTER TABLE public.funds
  ADD COLUMN IF NOT EXISTS reporting_group text;

-- Index for reporting group queries
CREATE INDEX IF NOT EXISTS idx_funds_reporting_group
  ON public.funds (organisation_id, reporting_group)
  WHERE reporting_group IS NOT NULL;

-- Backfill reporting_group for existing seed funds
UPDATE public.funds SET reporting_group = 'General'    WHERE name = 'General Fund' AND reporting_group IS NULL;
UPDATE public.funds SET reporting_group = 'Outreach'   WHERE name IN ('Friends In Need', 'Tanzania Project') AND reporting_group IS NULL;
UPDATE public.funds SET reporting_group = 'Property'   WHERE name IN ('Building Project', 'Maintenance Funds') AND reporting_group IS NULL;
UPDATE public.funds SET reporting_group = 'Community'  WHERE name IN ('Seniors', 'Basketball', 'Youth') AND reporting_group IS NULL;
UPDATE public.funds SET reporting_group = 'Grants'     WHERE name IN ('URC Community Grant', 'Baptist Union', 'URC Funding') AND reporting_group IS NULL;
