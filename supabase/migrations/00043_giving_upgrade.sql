-- 00043_giving_upgrade.sql
-- Giving Platform & Donations upgrade: channels, fees, GL posting, recurring, dashboard

-- ============================================================
-- 1. Add channel + fee columns to donations
-- ============================================================

ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS channel text DEFAULT 'other'
    CHECK (channel IN ('online', 'direct_debit', 'standing_order', 'cash', 'bank_transfer', 'other')),
  ADD COLUMN IF NOT EXISTS gross_amount_pence bigint,
  ADD COLUMN IF NOT EXISTS fee_amount_pence bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount_pence bigint,
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.giving_imports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fingerprint text;

-- Backfill gross/net from existing amount_pence
UPDATE public.donations
SET gross_amount_pence = amount_pence,
    net_amount_pence = amount_pence,
    fee_amount_pence = 0
WHERE gross_amount_pence IS NULL;

-- Map existing source values to channel
UPDATE public.donations SET channel = 'online'
WHERE source IN ('gocardless', 'sumup', 'izettle') AND channel = 'other';

-- ============================================================
-- 2. Expand source CHECK to include more providers
-- ============================================================

ALTER TABLE public.donations DROP CONSTRAINT IF EXISTS donations_source_valid;
ALTER TABLE public.donations ADD CONSTRAINT donations_source_valid
  CHECK (source IN ('manual', 'gocardless', 'sumup', 'izettle', 'stripe', 'paypal', 'churchsuite', 'other'));

-- ============================================================
-- 3. Donation fingerprint index for deduplication
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_donations_fingerprint
  ON public.donations (organisation_id, fingerprint)
  WHERE fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_donations_import_batch
  ON public.donations (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_donations_channel
  ON public.donations (organisation_id, channel);

-- ============================================================
-- 4. Recurring donations table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recurring_donations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  donor_id          uuid        NOT NULL REFERENCES public.donors(id),
  fund_id           uuid        REFERENCES public.funds(id),
  amount_pence      bigint      NOT NULL CHECK (amount_pence > 0),
  frequency         text        NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'annually')),
  next_due_date     date,
  channel           text        NOT NULL DEFAULT 'direct_debit'
    CHECK (channel IN ('online', 'direct_debit', 'standing_order', 'cash', 'bank_transfer', 'other')),
  provider_reference text,
  status            text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'cancelled')),
  created_by        uuid        REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY rd_select ON public.recurring_donations
  FOR SELECT USING (public.is_org_member(organisation_id));
CREATE POLICY rd_insert ON public.recurring_donations
  FOR INSERT WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));
CREATE POLICY rd_update ON public.recurring_donations
  FOR UPDATE USING (public.is_org_treasurer_or_admin(organisation_id))
  WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));
CREATE POLICY rd_delete ON public.recurring_donations
  FOR DELETE USING (public.is_org_treasurer_or_admin(organisation_id));

CREATE INDEX IF NOT EXISTS idx_recurring_donations_org_status
  ON public.recurring_donations (organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_recurring_donations_donor
  ON public.recurring_donations (donor_id);

-- ============================================================
-- 5. Donation settings on organisation_settings
-- ============================================================

ALTER TABLE public.organisation_settings
  ADD COLUMN IF NOT EXISTS default_donations_income_account_id uuid
    REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_donations_bank_account_id uuid
    REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_donations_fee_account_id uuid
    REFERENCES public.accounts(id) ON DELETE SET NULL;

-- ============================================================
-- 6. Add source_type values for journals
-- ============================================================
-- 'donation' and 'giving' already exist in the application type system.
-- No schema change needed; journals.source_type is a text column.

-- ============================================================
-- 7. RPC: get_donations_dashboard
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_donations_dashboard(
  p_org_id uuid,
  p_month_start date,
  p_month_end date,
  p_year_start date,
  p_year_end date
)
RETURNS TABLE (
  month_total_pence bigint,
  ytd_total_pence bigint,
  online_total_pence bigint,
  cash_total_pence bigint,
  recurring_total_pence bigint,
  gift_aid_eligible_pence bigint,
  fees_total_pence bigint,
  donation_count bigint,
  donor_count bigint
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT SUM(d.gross_amount_pence)
      FROM donations d
      WHERE d.organisation_id = p_org_id
        AND d.status = 'posted'
        AND d.donation_date >= p_month_start
        AND d.donation_date <= p_month_end
    ), 0) AS month_total_pence,

    COALESCE((
      SELECT SUM(d.gross_amount_pence)
      FROM donations d
      WHERE d.organisation_id = p_org_id
        AND d.status = 'posted'
        AND d.donation_date >= p_year_start
        AND d.donation_date <= p_year_end
    ), 0) AS ytd_total_pence,

    COALESCE((
      SELECT SUM(d.gross_amount_pence)
      FROM donations d
      WHERE d.organisation_id = p_org_id
        AND d.status = 'posted'
        AND d.channel = 'online'
        AND d.donation_date >= p_year_start
        AND d.donation_date <= p_year_end
    ), 0) AS online_total_pence,

    COALESCE((
      SELECT SUM(d.gross_amount_pence)
      FROM donations d
      WHERE d.organisation_id = p_org_id
        AND d.status = 'posted'
        AND d.channel = 'cash'
        AND d.donation_date >= p_year_start
        AND d.donation_date <= p_year_end
    ), 0) AS cash_total_pence,

    COALESCE((
      SELECT SUM(rd.amount_pence)
      FROM recurring_donations rd
      WHERE rd.organisation_id = p_org_id
        AND rd.status = 'active'
    ), 0) AS recurring_total_pence,

    COALESCE((
      SELECT SUM(d.gross_amount_pence)
      FROM donations d
      WHERE d.organisation_id = p_org_id
        AND d.status = 'posted'
        AND d.gift_aid_eligible = true
        AND d.donation_date >= p_year_start
        AND d.donation_date <= p_year_end
    ), 0) AS gift_aid_eligible_pence,

    COALESCE((
      SELECT SUM(d.fee_amount_pence)
      FROM donations d
      WHERE d.organisation_id = p_org_id
        AND d.status = 'posted'
        AND d.fee_amount_pence > 0
        AND d.donation_date >= p_year_start
        AND d.donation_date <= p_year_end
    ), 0) AS fees_total_pence,

    COALESCE((
      SELECT COUNT(*)
      FROM donations d
      WHERE d.organisation_id = p_org_id
        AND d.status = 'posted'
        AND d.donation_date >= p_year_start
        AND d.donation_date <= p_year_end
    ), 0) AS donation_count,

    COALESCE((
      SELECT COUNT(DISTINCT d.donor_id)
      FROM donations d
      WHERE d.organisation_id = p_org_id
        AND d.status = 'posted'
        AND d.donor_id IS NOT NULL
        AND d.donation_date >= p_year_start
        AND d.donation_date <= p_year_end
    ), 0) AS donor_count
  ;
$$;

REVOKE ALL ON FUNCTION public.get_donations_dashboard(uuid, date, date, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.get_donations_dashboard(uuid, date, date, date, date) TO authenticated;
