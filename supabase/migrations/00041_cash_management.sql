-- 00041_cash_management.sql
-- Complete Cash Management module: collections, spends, deposits

-- ============================================================
-- 1. Add system_account column to accounts
-- ============================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS system_account text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_system_account
  ON public.accounts (organisation_id, system_account)
  WHERE system_account IS NOT NULL;

-- ============================================================
-- 2. Cash-in-Hand account setting
-- ============================================================

ALTER TABLE public.organisation_settings
  ADD COLUMN IF NOT EXISTS cash_in_hand_account_id uuid
    REFERENCES public.accounts(id) ON DELETE SET NULL;

-- ============================================================
-- 3. cash_collections
-- ============================================================

CREATE TABLE public.cash_collections (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id         uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  collected_date          date        NOT NULL,
  service_name            text        NOT NULL,
  total_amount_pence      bigint      NOT NULL CHECK (total_amount_pence > 0),
  counted_by_name_1       text        NOT NULL,
  counted_by_name_2       text        NOT NULL,
  counter_1_confirmed     boolean     NOT NULL DEFAULT false,
  counter_2_confirmed     boolean     NOT NULL DEFAULT false,
  counted_at              timestamptz NOT NULL DEFAULT now(),
  notes                   text,
  status                  text        NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'posted', 'banked')),
  posted_transaction_id   uuid        REFERENCES public.journals(id) ON DELETE SET NULL,
  banked_at               timestamptz,
  created_by              uuid        REFERENCES public.profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY cc_select ON public.cash_collections
  FOR SELECT USING (public.is_org_member(organisation_id));
CREATE POLICY cc_insert ON public.cash_collections
  FOR INSERT WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));
CREATE POLICY cc_update ON public.cash_collections
  FOR UPDATE USING (public.is_org_treasurer_or_admin(organisation_id))
  WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));
CREATE POLICY cc_delete ON public.cash_collections
  FOR DELETE USING (public.is_org_treasurer_or_admin(organisation_id));

CREATE INDEX idx_cash_collections_org_status
  ON public.cash_collections (organisation_id, status);
CREATE INDEX idx_cash_collections_date
  ON public.cash_collections (collected_date);

-- ============================================================
-- 4. cash_collection_lines
-- ============================================================

CREATE TABLE public.cash_collection_lines (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_collection_id   uuid    NOT NULL REFERENCES public.cash_collections(id) ON DELETE CASCADE,
  fund_id              uuid    NOT NULL REFERENCES public.funds(id),
  income_account_id    uuid    NOT NULL REFERENCES public.accounts(id),
  amount_pence         bigint  NOT NULL CHECK (amount_pence > 0),
  donor_id             uuid    REFERENCES public.donors(id) ON DELETE SET NULL,
  gift_aid_eligible    boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_collection_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY ccl_select ON public.cash_collection_lines
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cash_collections cc WHERE cc.id = cash_collection_id AND public.is_org_member(cc.organisation_id))
  );
CREATE POLICY ccl_insert ON public.cash_collection_lines
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.cash_collections cc WHERE cc.id = cash_collection_id AND public.is_org_treasurer_or_admin(cc.organisation_id))
  );
CREATE POLICY ccl_update ON public.cash_collection_lines
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.cash_collections cc WHERE cc.id = cash_collection_id AND public.is_org_treasurer_or_admin(cc.organisation_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cash_collections cc WHERE cc.id = cash_collection_id AND public.is_org_treasurer_or_admin(cc.organisation_id)));
CREATE POLICY ccl_delete ON public.cash_collection_lines
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.cash_collections cc WHERE cc.id = cash_collection_id AND public.is_org_treasurer_or_admin(cc.organisation_id))
  );

CREATE INDEX idx_ccl_collection ON public.cash_collection_lines (cash_collection_id);

-- ============================================================
-- 5. cash_spends
-- ============================================================

CREATE TABLE public.cash_spends (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id         uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  spend_date              date        NOT NULL,
  paid_to                 text        NOT NULL,
  spent_by                text        NOT NULL,
  description             text        NOT NULL,
  receipt_url             text,
  fund_id                 uuid        NOT NULL REFERENCES public.funds(id),
  expense_account_id      uuid        NOT NULL REFERENCES public.accounts(id),
  amount_pence            bigint      NOT NULL CHECK (amount_pence > 0),
  status                  text        NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'posted')),
  posted_transaction_id   uuid        REFERENCES public.journals(id) ON DELETE SET NULL,
  created_by              uuid        REFERENCES public.profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_spends ENABLE ROW LEVEL SECURITY;

CREATE POLICY cs_select ON public.cash_spends
  FOR SELECT USING (public.is_org_member(organisation_id));
CREATE POLICY cs_insert ON public.cash_spends
  FOR INSERT WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));
CREATE POLICY cs_update ON public.cash_spends
  FOR UPDATE USING (public.is_org_treasurer_or_admin(organisation_id))
  WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));
CREATE POLICY cs_delete ON public.cash_spends
  FOR DELETE USING (public.is_org_treasurer_or_admin(organisation_id));

CREATE INDEX idx_cash_spends_org_status ON public.cash_spends (organisation_id, status);
CREATE INDEX idx_cash_spends_date ON public.cash_spends (spend_date);

-- ============================================================
-- 6. cash_deposits
-- ============================================================

CREATE TABLE public.cash_deposits (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id         uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  bank_account_id         uuid        NOT NULL REFERENCES public.bank_accounts(id),
  deposit_date            date        NOT NULL,
  total_amount_pence      bigint      NOT NULL CHECK (total_amount_pence > 0),
  status                  text        NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'posted', 'matched')),
  posted_transaction_id   uuid        REFERENCES public.journals(id) ON DELETE SET NULL,
  matched_bank_line_id    uuid,
  created_by              uuid        REFERENCES public.profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY cd_select ON public.cash_deposits
  FOR SELECT USING (public.is_org_member(organisation_id));
CREATE POLICY cd_insert ON public.cash_deposits
  FOR INSERT WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));
CREATE POLICY cd_update ON public.cash_deposits
  FOR UPDATE USING (public.is_org_treasurer_or_admin(organisation_id))
  WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));
CREATE POLICY cd_delete ON public.cash_deposits
  FOR DELETE USING (public.is_org_treasurer_or_admin(organisation_id));

CREATE INDEX idx_cash_deposits_org_status ON public.cash_deposits (organisation_id, status);

-- ============================================================
-- 7. cash_deposit_collections (junction)
-- ============================================================

CREATE TABLE public.cash_deposit_collections (
  deposit_id          uuid NOT NULL REFERENCES public.cash_deposits(id) ON DELETE CASCADE,
  cash_collection_id  uuid NOT NULL REFERENCES public.cash_collections(id) ON DELETE CASCADE,
  PRIMARY KEY (deposit_id, cash_collection_id)
);

ALTER TABLE public.cash_deposit_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY cdc_select ON public.cash_deposit_collections
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cash_deposits cd WHERE cd.id = deposit_id AND public.is_org_member(cd.organisation_id))
  );
CREATE POLICY cdc_insert ON public.cash_deposit_collections
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.cash_deposits cd WHERE cd.id = deposit_id AND public.is_org_treasurer_or_admin(cd.organisation_id))
  );
CREATE POLICY cdc_delete ON public.cash_deposit_collections
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.cash_deposits cd WHERE cd.id = deposit_id AND public.is_org_treasurer_or_admin(cd.organisation_id))
  );

CREATE INDEX idx_cdc_collection ON public.cash_deposit_collections (cash_collection_id);
