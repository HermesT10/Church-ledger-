-- 00032_banking_allocations.sql
-- Add allocations table, allocated/reconciled flags on bank_lines

-- ============================================================
-- 1. Add status columns to bank_lines
-- ============================================================

ALTER TABLE public.bank_lines
  ADD COLUMN IF NOT EXISTS allocated boolean NOT NULL DEFAULT false;

ALTER TABLE public.bank_lines
  ADD COLUMN IF NOT EXISTS reconciled boolean NOT NULL DEFAULT false;

ALTER TABLE public.bank_lines
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

-- ============================================================
-- 2. Create allocations table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.allocations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  bank_line_id    uuid        NOT NULL REFERENCES public.bank_lines(id) ON DELETE CASCADE,
  account_id      uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  fund_id         uuid        NOT NULL REFERENCES public.funds(id) ON DELETE RESTRICT,
  amount_pence    bigint      NOT NULL,
  created_by      uuid        REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- One allocation per bank line (no double-allocation)
  UNIQUE (bank_line_id)
);

-- ============================================================
-- 3. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_allocations_org
  ON public.allocations (organisation_id);

CREATE INDEX IF NOT EXISTS idx_allocations_bank_line
  ON public.allocations (bank_line_id);

CREATE INDEX IF NOT EXISTS idx_allocations_account
  ON public.allocations (account_id);

CREATE INDEX IF NOT EXISTS idx_allocations_fund
  ON public.allocations (fund_id);

CREATE INDEX IF NOT EXISTS idx_bank_lines_allocated
  ON public.bank_lines (bank_account_id, allocated);

CREATE INDEX IF NOT EXISTS idx_bank_lines_reconciled
  ON public.bank_lines (bank_account_id, reconciled);

-- ============================================================
-- 4. Enable RLS on allocations
-- ============================================================

ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY allocations_select_member ON public.allocations
  FOR SELECT USING (public.is_org_member(organisation_id));

CREATE POLICY allocations_insert_treasurer_admin ON public.allocations
  FOR INSERT WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));

CREATE POLICY allocations_update_treasurer_admin ON public.allocations
  FOR UPDATE
  USING (public.is_org_treasurer_or_admin(organisation_id))
  WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));

CREATE POLICY allocations_delete_treasurer_admin ON public.allocations
  FOR DELETE USING (public.is_org_treasurer_or_admin(organisation_id));

-- ============================================================
-- 5. Backfill reconciled flag from existing matches
-- ============================================================

UPDATE public.bank_lines bl
SET reconciled = true,
    reconciled_at = brm.created_at
FROM public.bank_reconciliation_matches brm
WHERE bl.id = brm.bank_line_id
  AND bl.reconciled = false;
