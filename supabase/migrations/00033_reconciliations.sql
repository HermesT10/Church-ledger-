-- 00033_reconciliations.sql
-- Statement reconciliation sessions

-- ============================================================
-- 1. Create reconciliations table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reconciliations (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id                 uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  bank_account_id                 uuid        NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  statement_date                  date        NOT NULL,
  statement_closing_balance_pence bigint      NOT NULL,
  opening_balance_pence           bigint      NOT NULL DEFAULT 0,
  cleared_balance_pence           bigint,
  lines_cleared                   integer     NOT NULL DEFAULT 0,
  reconciled_by                   uuid        REFERENCES public.profiles(id),
  reconciled_at                   timestamptz,
  locked                          boolean     NOT NULL DEFAULT false,
  created_at                      timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate reconciliation for same account+date
  UNIQUE (bank_account_id, statement_date)
);

-- ============================================================
-- 2. Add reconciliation_id to bank_lines
-- ============================================================

ALTER TABLE public.bank_lines
  ADD COLUMN IF NOT EXISTS reconciliation_id uuid REFERENCES public.reconciliations(id) ON DELETE SET NULL;

-- ============================================================
-- 3. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_reconciliations_org
  ON public.reconciliations (organisation_id);

CREATE INDEX IF NOT EXISTS idx_reconciliations_bank_account
  ON public.reconciliations (bank_account_id, statement_date DESC);

CREATE INDEX IF NOT EXISTS idx_bank_lines_reconciliation
  ON public.bank_lines (reconciliation_id)
  WHERE reconciliation_id IS NOT NULL;

-- ============================================================
-- 4. Enable RLS
-- ============================================================

ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY reconciliations_select_member ON public.reconciliations
  FOR SELECT USING (public.is_org_member(organisation_id));

CREATE POLICY reconciliations_insert_treasurer_admin ON public.reconciliations
  FOR INSERT WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));

CREATE POLICY reconciliations_update_treasurer_admin ON public.reconciliations
  FOR UPDATE
  USING (public.is_org_treasurer_or_admin(organisation_id))
  WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));

CREATE POLICY reconciliations_delete_treasurer_admin ON public.reconciliations
  FOR DELETE USING (public.is_org_treasurer_or_admin(organisation_id));
