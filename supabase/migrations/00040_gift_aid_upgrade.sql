-- 00040_gift_aid_upgrade.sql
-- Upgrade Gift Aid module: declarations, claims, GL integration, settings

-- ============================================================
-- 1. Enhance gift_aid_declarations
-- ============================================================

ALTER TABLE public.gift_aid_declarations
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS declaration_date date,
  ADD COLUMN IF NOT EXISTS hmrc_version text,
  ADD COLUMN IF NOT EXISTS template_version text,
  ADD COLUMN IF NOT EXISTS attachment_url text;

-- Backfill organisation_id from donors table
UPDATE public.gift_aid_declarations gad
SET organisation_id = d.organisation_id
FROM public.donors d
WHERE gad.donor_id = d.id
  AND gad.organisation_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_declarations_donor_active
  ON public.gift_aid_declarations (donor_id, is_active);

CREATE INDEX IF NOT EXISTS idx_declarations_org
  ON public.gift_aid_declarations (organisation_id)
  WHERE organisation_id IS NOT NULL;

-- ============================================================
-- 2. Enhance gift_aid_claims
-- ============================================================

ALTER TABLE public.gift_aid_claims
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS total_donations_pence bigint,
  ADD COLUMN IF NOT EXISTS total_gift_aid_pence bigint,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS journal_id uuid REFERENCES public.journals(id) ON DELETE SET NULL;

-- Add check constraint for status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gac_status_valid'
  ) THEN
    ALTER TABLE public.gift_aid_claims
      ADD CONSTRAINT gac_status_valid CHECK (status IN ('draft', 'submitted', 'paid'));
  END IF;
END $$;

-- Backfill status for existing claims
UPDATE public.gift_aid_claims
SET status = 'submitted'
WHERE submitted_at IS NOT NULL AND status = 'draft';

-- Backfill totals for existing claims
UPDATE public.gift_aid_claims gac
SET
  total_donations_pence = sub.total_donations,
  total_gift_aid_pence = ROUND(sub.total_donations * 0.25)
FROM (
  SELECT
    gift_aid_claim_id,
    SUM(amount_pence) AS total_donations
  FROM public.donations
  WHERE gift_aid_claim_id IS NOT NULL
  GROUP BY gift_aid_claim_id
) sub
WHERE gac.id = sub.gift_aid_claim_id
  AND gac.total_donations_pence IS NULL;

CREATE INDEX IF NOT EXISTS idx_gift_aid_claims_status
  ON public.gift_aid_claims (organisation_id, status);

CREATE INDEX IF NOT EXISTS idx_gift_aid_claims_journal
  ON public.gift_aid_claims (journal_id)
  WHERE journal_id IS NOT NULL;

-- ============================================================
-- 3. Gift Aid settings on organisation_settings
-- ============================================================

ALTER TABLE public.organisation_settings
  ADD COLUMN IF NOT EXISTS gift_aid_income_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gift_aid_bank_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gift_aid_default_fund_id uuid REFERENCES public.funds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gift_aid_use_proportional_funds boolean NOT NULL DEFAULT true;
