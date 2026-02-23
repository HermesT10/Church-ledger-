-- 00038_financial_periods.sql
-- Phase 2: Financial Periods for period locking.

CREATE TABLE IF NOT EXISTS public.financial_periods (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  start_date      date        NOT NULL,
  end_date        date        NOT NULL,
  status          text        NOT NULL DEFAULT 'open',
  closed_by       uuid        REFERENCES public.profiles(id),
  closed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fp_dates_valid CHECK (end_date >= start_date),
  CONSTRAINT fp_status_valid CHECK (status IN ('open', 'closed', 'locked')),
  UNIQUE (organisation_id, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS idx_financial_periods_org
  ON public.financial_periods (organisation_id);

CREATE INDEX IF NOT EXISTS idx_financial_periods_dates
  ON public.financial_periods (organisation_id, start_date, end_date);

-- Add period_id to journals
ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.financial_periods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_journals_period
  ON public.journals (period_id)
  WHERE period_id IS NOT NULL;

-- RLS
ALTER TABLE public.financial_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY fp_select_member ON public.financial_periods
  FOR SELECT USING (public.is_org_member(organisation_id));

CREATE POLICY fp_insert_admin ON public.financial_periods
  FOR INSERT WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));

CREATE POLICY fp_update_admin ON public.financial_periods
  FOR UPDATE
  USING (public.is_org_treasurer_or_admin(organisation_id))
  WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));

CREATE POLICY fp_delete_admin ON public.financial_periods
  FOR DELETE USING (public.is_org_treasurer_or_admin(organisation_id));
